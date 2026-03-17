#!/usr/bin/env python3
"""Extract Pao de Acucar alimentos catalog and import into MercadoFlow global catalog.

Flow:
1) Crawl all shelves under categoria "Alimentos" (id=12001) using paginated API.
2) Enrich each unique product with /bestPrices to capture EAN/metadata/image.
3) Save extracted payload to JSON.
4) Optionally import in batches via MercadoFlow admin API.
"""

from __future__ import annotations

import argparse
import json
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple
from urllib.parse import urlparse

import requests
from optimized_image_store import OptimizedImageStore

GTIN_RE = re.compile(r"^\d{8,14}$")
_THREAD_LOCAL = threading.local()


def norm_text(value: Any) -> str:
    if value is None:
        return ""
    return " ".join(str(value).split()).strip()


def norm_gtin(value: Any) -> str:
    digits = "".join(ch for ch in str(value or "") if ch.isdigit())
    if not GTIN_RE.match(digits):
        return ""
    if set(digits) == {"0"}:
        return ""
    return digits


def unique_records_by_gtin(records: Iterable[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], int]:
    unique: List[Dict[str, Any]] = []
    seen_gtins: set[str] = set()
    duplicates = 0
    for record in records:
        gtin = norm_gtin(record.get("code"))
        if gtin:
            if gtin in seen_gtins:
                duplicates += 1
                continue
            seen_gtins.add(gtin)
        unique.append(record)
    return unique, duplicates


def canonical_url(value: Any) -> str:
    text = norm_text(value)
    if text.startswith("http://") or text.startswith("https://"):
        return text
    return ""


def infer_extension(content_type: str, url: str) -> str:
    content = (content_type or "").lower()
    if "png" in content:
        return ".png"
    if "webp" in content:
        return ".webp"
    if "gif" in content:
        return ".gif"
    if "jpeg" in content or "jpg" in content:
        return ".jpg"
    path = (urlparse(url).path or "").lower()
    for ext in (".jpg", ".jpeg", ".png", ".webp", ".gif"):
        if path.endswith(ext):
            return ext
    return ".jpg"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Extract + import PA alimentos catalog")
    parser.add_argument("--store-id", type=int, default=461)
    parser.add_argument("--max-workers-list", type=int, default=8)
    parser.add_argument("--max-workers-detail", type=int, default=16)
    parser.add_argument("--output", default="data/catalog/pa_alimentos_full.json")
    parser.add_argument("--do-import", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--api-base", default="https://mercadoflow.com/api")
    parser.add_argument("--login-endpoint", default="/v1/super-admin/auth/login")
    parser.add_argument("--import-endpoint", default="/v1/admin/catalog/import/records")
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--provider", default="PAODEACUCAR_WEB_BR_ALIMENTOS")
    parser.add_argument(
        "--source-license",
        default="Public website/API data (respect provider terms and robots)",
    )
    parser.add_argument("--confidence", type=float, default=0.96)
    parser.add_argument("--batch-size", type=int, default=300)
    parser.add_argument("--pause-ms", type=int, default=0)
    parser.add_argument("--download-images", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--images-dir", default="data/catalog/images")
    parser.add_argument("--max-image-bytes", type=int, default=3_000_000)
    return parser.parse_args()


class LocalImageStorage:
    def __init__(self, base_dir: Path, max_bytes: int):
        self.store = OptimizedImageStore(
            base_dir=base_dir,
            max_bytes=max_bytes,
            user_agent="Mozilla/5.0 (compatible; MercadoFlowCatalogHarvester/1.0)",
        )

    def save(self, provider: str, code: str, image_url: str) -> str:
        return self.store.save(code, image_url)


def build_session() -> requests.Session:
    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": "Mozilla/5.0 (compatible; MercadoFlowCatalogHarvester/1.0)",
            "Accept": "application/json, text/plain, */*",
        }
    )
    return session


def thread_session() -> requests.Session:
    session = getattr(_THREAD_LOCAL, "session", None)
    if session is None:
        session = build_session()
        _THREAD_LOCAL.session = session
    return session


def fetch_categories(session: requests.Session, store_id: int) -> Dict[str, Any]:
    response = session.get(
        "https://api.vendas.gpa.digital/pa/v4/products/categories/ecom",
        params={"storeId": store_id},
        timeout=45,
    )
    response.raise_for_status()
    payload = response.json()
    return payload if isinstance(payload, dict) else {}


def find_alimentos_node(payload: Dict[str, Any]) -> Dict[str, Any]:
    for node in payload.get("content") or []:
        if isinstance(node, dict) and node.get("id") == 12001:
            return node
    raise RuntimeError("Alimentos category (id=12001) not found")


def iter_shelf_ids(node: Any) -> Iterable[int]:
    if isinstance(node, dict):
        node_id = node.get("id")
        if isinstance(node_id, int) and node_id > 0:
            yield node_id
        for child in node.get("subCategories") or []:
            yield from iter_shelf_ids(child)
    elif isinstance(node, list):
        for item in node:
            yield from iter_shelf_ids(item)


def crawl_shelf(
    shelf_id: int,
    store_id: int,
    pause_ms: int = 0,
) -> Tuple[int, List[Dict[str, Any]]]:
    local_session = thread_session()
    products: List[Dict[str, Any]] = []
    page = 1
    seen_page_signatures: set[str] = set()
    while True:
        response = local_session.get(
            "https://api.vendas.gpa.digital/pa/v2/products/ecom/seeMore",
            params={
                "storeId": store_id,
                "isClienteMais": "true",
                "shelfId": shelf_id,
                "page": page,
                "size": 50,
            },
            timeout=40,
        )
        if response.status_code != 200:
            break
        payload = response.json()
        items = payload.get("content") or []
        if not items:
            break
        ids = [str(item.get("id")) for item in items if item.get("id") is not None]
        signature = "|".join(ids)
        if signature in seen_page_signatures:
            break
        seen_page_signatures.add(signature)
        products.extend([item for item in items if isinstance(item, dict)])
        if len(items) < 50:
            break
        page += 1
        if page > 500:
            break
        if pause_ms > 0:
            time.sleep(pause_ms / 1000.0)
    return shelf_id, products


def pick_category(best_prices_payload: Dict[str, Any]) -> str:
    content = best_prices_payload.get("content") or {}
    shelves = content.get("shelfList") or []
    names: List[str] = []
    for item in shelves:
        if isinstance(item, dict):
            name = norm_text(item.get("name"))
            if name and name not in names:
                names.append(name)
    if names:
        return " > ".join(names[:3])[:120]
    return ""


def pick_image_url(content: Dict[str, Any]) -> str:
    image_map = content.get("mapOfImages")
    if isinstance(image_map, dict):
        for image_node in image_map.values():
            if not isinstance(image_node, dict):
                continue
            for key in ("BIG", "MEDIUM", "SMALL"):
                value = norm_text(image_node.get(key))
                if value:
                    if value.startswith("http"):
                        return value
                    return f"https://static.paodeacucar.com{value}"
    thumb = norm_text(content.get("thumbPath"))
    if thumb:
        if thumb.startswith("http"):
            return thumb
        return f"https://static.paodeacucar.com{thumb}"
    return ""


def fetch_best_prices(product_id: str, store_id: int, pause_ms: int = 0) -> Dict[str, Any]:
    session = thread_session()
    response = session.get(
        f"https://api.vendas.gpa.digital/pa/v4/products/ecom/{product_id}/bestPrices",
        params={"storeId": store_id, "sellType": "normal", "isClienteMais": "true"},
        timeout=40,
    )
    if pause_ms > 0:
        time.sleep(pause_ms / 1000.0)
    if response.status_code != 200:
        return {}
    payload = response.json()
    return payload if isinstance(payload, dict) else {}


def merge_record(base: Dict[str, Any], details: Dict[str, Any], store_id: int) -> Dict[str, Any]:
    content = details.get("content") if isinstance(details, dict) else {}
    if not isinstance(content, dict):
        content = {}
    product_id = str(base.get("id") or content.get("id") or "").strip()
    sku = norm_text(base.get("sku") or content.get("sku"))
    ean = norm_gtin(content.get("ean"))
    name = norm_text(content.get("name") or base.get("name"))[:255]
    brand = norm_text(content.get("brand") or base.get("brand"))[:120]
    category = pick_category(details)
    image_url = pick_image_url(content if content else base)
    short_desc = norm_text(content.get("shortDescription") or base.get("shortDescription"))[:1024]
    source_url = norm_text(content.get("urlDetails") or base.get("urlDetails"))
    if source_url and not source_url.startswith("http"):
        source_url = f"https://www.paodeacucar.com{source_url}"
    price_value = content.get("sellPrice") or content.get("currentPrice") or base.get("sellPrice") or base.get("currentPrice")
    try:
        price = float(price_value) if price_value is not None else None
    except Exception:
        price = None

    raw_payload = {
        "storeId": store_id,
        "base": base,
        "details": details,
    }
    return {
        "code": ean or sku or product_id,
        "ean": ean,
        "providerProductId": product_id or sku,
        "sku": sku,
        "name": name,
        "brand": brand,
        "category": category,
        "description": short_desc,
        "imageUrl": image_url,
        "imageStorageKey": "",
        "sourceUrl": source_url,
        "currency": "BRL",
        "price": price,
        "attributesJson": json.dumps(
            {
                "storeId": store_id,
                "sku": sku,
                "productId": product_id,
                "urlDetails": content.get("urlDetails") or base.get("urlDetails"),
                "thumbPath": content.get("thumbPath") or base.get("thumbPath"),
            },
            ensure_ascii=False,
        ),
        "rawPayload": json.dumps(raw_payload, ensure_ascii=False),
    }


def login_super_admin(api_base: str, endpoint: str, email: str, password: str) -> str:
    path = endpoint if endpoint.startswith("/") else f"/{endpoint}"
    response = requests.post(
        f"{api_base.rstrip('/')}{path}",
        json={"email": email, "password": password},
        timeout=60,
    )
    response.raise_for_status()
    token = response.json().get("token")
    if not token:
        raise RuntimeError("Super admin login succeeded without token")
    return str(token)


def chunked(items: List[Dict[str, Any]], size: int) -> Iterable[List[Dict[str, Any]]]:
    for idx in range(0, len(items), size):
        yield items[idx:idx + size]


def import_records(
    api_base: str,
    import_endpoint: str,
    token: str,
    provider: str,
    source_license: str,
    confidence: float,
    records: List[Dict[str, Any]],
    batch_size: int,
) -> Dict[str, int]:
    path = import_endpoint if import_endpoint.startswith("/") else f"/{import_endpoint}"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    totals = {
        "scannedProducts": 0,
        "importedProducts": 0,
        "skippedInvalidGtin": 0,
        "skippedMissingName": 0,
        "skippedMedication": 0,
        "skippedDuplicateGtin": 0,
        "errors": 0,
    }

    valid_items = [item for item in records if norm_gtin(item.get("code")) and norm_text(item.get("name"))]
    valid_items, local_duplicates = unique_records_by_gtin(valid_items)
    totals["skippedDuplicateGtin"] += local_duplicates
    print(f"records ready for import: {len(valid_items)}")

    for index, batch in enumerate(chunked(valid_items, max(1, min(batch_size, 1500))), start=1):
        body = {
            "provider": provider,
            "sourceLicense": source_license,
            "confidenceScore": confidence,
            "skipMedication": True,
            "items": [
                {
                    "code": item.get("code"),
                    "name": item.get("name"),
                    "brand": item.get("brand"),
                    "category": item.get("category"),
                    "ncm": item.get("ncm"),
                    "unit": item.get("unit"),
                    "description": item.get("description"),
                    "manufacturer": item.get("manufacturer"),
                    "packageDescription": item.get("packageDescription"),
                    "imageUrl": item.get("imageUrl"),
                    "imageStorageKey": item.get("imageStorageKey"),
                    "attributesJson": item.get("attributesJson"),
                    "rawPayload": item.get("rawPayload"),
                }
                for item in batch
            ],
        }
        response = requests.post(
            f"{api_base.rstrip('/')}{path}",
            headers=headers,
            json=body,
            timeout=240,
        )
        response.raise_for_status()
        payload = response.json()
        for key in totals:
            totals[key] += int(payload.get(key, 0))
        print(
            f"batch {index}: scanned={payload.get('scannedProducts', 0)} "
            f"imported={payload.get('importedProducts', 0)} "
            f"duplicate={payload.get('skippedDuplicateGtin', 0)} "
            f"errors={payload.get('errors', 0)}"
        )
    return totals


def main() -> int:
    args = parse_args()
    output = Path(args.output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)

    root_session = build_session()
    categories = fetch_categories(root_session, args.store_id)
    alimentos = find_alimentos_node(categories)

    shelf_ids = sorted(set(iter_shelf_ids(alimentos)))
    print(f"shelves discovered under Alimentos: {len(shelf_ids)}")

    listing_rows: List[Dict[str, Any]] = []
    start = time.time()
    with ThreadPoolExecutor(max_workers=max(1, args.max_workers_list)) as executor:
        futures = [executor.submit(crawl_shelf, shelf_id, args.store_id, args.pause_ms) for shelf_id in shelf_ids]
        for idx, future in enumerate(as_completed(futures), start=1):
            shelf_id, rows = future.result()
            listing_rows.extend(rows)
            if idx % 20 == 0 or idx == len(futures):
                print(f"listing progress: shelves_done={idx}/{len(futures)} rows={len(listing_rows)} last_shelf={shelf_id}")
    print(f"listing done in {time.time() - start:.1f}s rows={len(listing_rows)}")

    by_id: Dict[str, Dict[str, Any]] = {}
    for row in listing_rows:
        product_id = str(row.get("id") or "").strip()
        if not product_id:
            continue
        by_id[product_id] = row
    print(f"unique products by id: {len(by_id)}")

    records_by_id: Dict[str, Dict[str, Any]] = {}
    start = time.time()
    with ThreadPoolExecutor(max_workers=max(1, args.max_workers_detail)) as executor:
        future_to_product = {
            executor.submit(fetch_best_prices, product_id, args.store_id, args.pause_ms): product_id
            for product_id in by_id.keys()
        }
        for idx, future in enumerate(as_completed(future_to_product), start=1):
            details = future.result()
            product_id = future_to_product[future]
            merged = merge_record(by_id[product_id], details, args.store_id)
            records_by_id[product_id] = merged
            if idx % 250 == 0 or idx == len(by_id):
                gtin_count = sum(1 for r in records_by_id.values() if norm_gtin(r.get("code")))
                print(f"detail progress: {idx}/{len(by_id)} with_gtin={gtin_count}")
    print(f"detail done in {time.time() - start:.1f}s")

    records = list(records_by_id.values())
    images_saved = 0
    if args.download_images:
        image_store = LocalImageStorage(Path(args.images_dir).resolve(), int(args.max_image_bytes))
        for index, record in enumerate(records, start=1):
            image_url = canonical_url(record.get("imageUrl"))
            if not image_url or norm_text(record.get("imageStorageKey")):
                continue
            code = norm_text(record.get("code") or record.get("providerProductId"))
            if not code:
                continue
            try:
                key = image_store.save(args.provider, code, image_url)
            except Exception:
                key = ""
            if key:
                record["imageStorageKey"] = key
                images_saved += 1
            if index % 500 == 0:
                print(f"image progress: checked={index}/{len(records)} saved={images_saved}")
    with_gtin = [r for r in records if norm_gtin(r.get("code"))]
    payload = {
        "source": "PAODEACUCAR_ALIMENTOS_API",
        "storeId": args.store_id,
        "capturedAtEpochMs": int(time.time() * 1000),
        "rowsTotal": len(listing_rows),
        "productsUnique": len(records),
        "productsWithGtin": len(with_gtin),
        "imagesSaved": images_saved,
        "items": records,
    }
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"saved extraction file: {output}")

    if not args.do_import:
        return 0

    token = login_super_admin(args.api_base, args.login_endpoint, args.email, args.password)
    totals = import_records(
        api_base=args.api_base,
        import_endpoint=args.import_endpoint,
        token=token,
        provider=args.provider,
        source_license=args.source_license,
        confidence=args.confidence,
        records=records,
        batch_size=args.batch_size,
    )
    print("import summary")
    print(json.dumps(totals, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
