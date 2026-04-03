#!/usr/bin/env python3
"""Enrich GTIN catalog records using Wireshape-like and public product sources.

This service is independent from supermarket crawler and can be scheduled separately.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence
from urllib.parse import quote_plus

import requests
from optimized_image_store import OptimizedImageStore

GTIN_RE = re.compile(r"^\d{8,14}$")


@dataclass
class EnrichedRecord:
    provider: str
    source_license: str
    code: str
    name: str
    brand: str
    category: str
    ncm: str
    unit: str
    description: str
    manufacturer: str
    package_description: str
    image_url: str
    image_storage_key: str
    attributes_json: str
    raw_payload: str

    def as_import_item(self) -> Dict[str, Any]:
        return {
            "code": self.code,
            "name": self.name,
            "brand": self.brand or None,
            "category": self.category or None,
            "ncm": self.ncm or None,
            "unit": self.unit or None,
            "description": self.description or None,
            "manufacturer": self.manufacturer or None,
            "packageDescription": self.package_description or None,
            "imageUrl": self.image_url or None,
            "imageStorageKey": self.image_storage_key or None,
            "attributesJson": self.attributes_json or None,
            "rawPayload": self.raw_payload or None,
        }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Enrich GTINs from external web sources")
    parser.add_argument("--api-base", default="", help="MercadoFlow API base (example: http://localhost:8080/api)")
    parser.add_argument("--token", default="", help="JWT token")
    parser.add_argument("--email", default="", help="Super admin email for login")
    parser.add_argument("--password", default="", help="Super admin password for login")
    parser.add_argument("--login-endpoint", default="/v1/super-admin/auth/login")
    parser.add_argument("--input", default="", help="Optional JSON input with items/code fields")
    parser.add_argument("--output", default="data/catalog/barcode_enrichment_output.json")
    parser.add_argument("--gtin", action="append", default=[], help="Direct GTIN (can be repeated)")
    parser.add_argument("--max-gtins", type=int, default=2000)
    parser.add_argument("--fetch-catalog-from-api", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--catalog-endpoint", default="/v1/super-admin/catalog/products")
    parser.add_argument("--catalog-pages", type=int, default=20)
    parser.add_argument("--catalog-page-size", type=int, default=100)
    parser.add_argument("--skip-api-import", action="store_true")
    parser.add_argument("--import-endpoint", default="/v1/admin/catalog/import/records")
    parser.add_argument("--confidence", type=float, default=0.92)
    parser.add_argument("--batch-size", type=int, default=300)
    parser.add_argument("--download-images", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--images-dir", default="data/catalog/images")
    parser.add_argument("--max-image-bytes", type=int, default=3_000_000)
    parser.add_argument("--watch", action="store_true")
    parser.add_argument("--interval-minutes", type=int, default=720)
    return parser.parse_args()


def norm_text(value: Any) -> str:
    if value is None:
        return ""
    return " ".join(str(value).split()).strip()


def norm_gtin(value: Any) -> str:
    digits = "".join(ch for ch in str(value or "") if ch.isdigit())
    if GTIN_RE.match(digits) and set(digits) != {"0"}:
        return digits
    return ""


def canonical_url(value: Any) -> str:
    text = norm_text(value)
    if text.startswith("http://") or text.startswith("https://"):
        return text
    return ""


def to_json(value: Any) -> str:
    try:
        return json.dumps(value, ensure_ascii=False)
    except Exception:
        return ""


def login(api_base: str, endpoint: str, email: str, password: str) -> str:
    path = endpoint if endpoint.startswith("/") else f"/{endpoint}"
    response = requests.post(
        f"{api_base.rstrip('/')}{path}",
        json={"email": email, "password": password, "keepConnected": True},
        timeout=60,
    )
    response.raise_for_status()
    token = response.json().get("token")
    if not token:
        raise RuntimeError("Login succeeded but no token returned")
    return str(token)


def ensure_token(args: argparse.Namespace) -> str:
    token = norm_text(args.token)
    if token:
        return token
    if args.api_base and args.email and args.password:
        token = login(args.api_base, args.login_endpoint, args.email, args.password)
        args.token = token
        return token
    return ""


def read_input_gtins(path: str) -> List[str]:
    if not path:
        return []
    input_path = Path(path).resolve()
    if not input_path.exists():
        return []
    payload = json.loads(input_path.read_text(encoding="utf-8"))
    items = payload.get("items") if isinstance(payload, dict) else payload
    if not isinstance(items, list):
        return []
    gtins: List[str] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        candidate = norm_gtin(item.get("code") or item.get("gtin") or item.get("ean"))
        if candidate:
            gtins.append(candidate)
    return gtins


def fetch_catalog_gtins(args: argparse.Namespace, token: str) -> List[str]:
    if not args.api_base or not token or not args.fetch_catalog_from_api:
        return []

    endpoint = args.catalog_endpoint if args.catalog_endpoint.startswith("/") else f"/{args.catalog_endpoint}"
    headers = {"Authorization": f"Bearer {token}"}
    collected: List[str] = []

    for page in range(max(1, args.catalog_pages)):
        response = requests.get(
            f"{args.api_base.rstrip('/')}{endpoint}",
            headers=headers,
            params={"page": page, "size": max(1, min(args.catalog_page_size, 200))},
            timeout=60,
        )
        response.raise_for_status()
        payload = response.json()
        content = payload.get("content", [])
        if not isinstance(content, list) or not content:
            break
        for row in content:
            if not isinstance(row, dict):
                continue
            gtin = norm_gtin(row.get("gtin") or row.get("ean"))
            if gtin:
                collected.append(gtin)
        if page >= int(payload.get("totalPages", 1)) - 1:
            break

    return collected


def unique_gtins(items: Iterable[str], limit: int) -> List[str]:
    seen = set()
    result: List[str] = []
    for value in items:
        gtin = norm_gtin(value)
        if not gtin or gtin in seen:
            continue
        seen.add(gtin)
        result.append(gtin)
        if len(result) >= limit:
            break
    return result


def read_json(url: str, timeout: int = 25) -> Optional[Dict[str, Any]]:
    response = requests.get(url, timeout=timeout)
    if response.status_code >= 400:
        return None
    try:
        payload = response.json()
        return payload if isinstance(payload, dict) else None
    except Exception:
        return None


def pick_first(payload: Dict[str, Any], *keys: str) -> str:
    for key in keys:
        value = payload.get(key)
        if value is None:
            continue
        if isinstance(value, (list, tuple)) and value:
            value = value[0]
        text = norm_text(value)
        if text:
            return text
    return ""


def fetch_from_wireshape(gtin: str) -> Optional[Dict[str, Any]]:
    candidate_urls = [
        f"https://data.wireshape.com/api/products/{gtin}",
        f"https://data.wireshape.com/api/v1/products/{gtin}",
        f"https://data.wireshape.com/products/{gtin}.json",
        f"https://data.wireshape.com/search.json?q={quote_plus(gtin)}",
    ]
    for url in candidate_urls:
        payload = read_json(url)
        if not payload:
            continue
        node: Dict[str, Any]
        if isinstance(payload.get("product"), dict):
            node = payload["product"]
        elif isinstance(payload.get("data"), dict):
            node = payload["data"]
        elif isinstance(payload.get("items"), list) and payload["items"]:
            first = payload["items"][0]
            node = first if isinstance(first, dict) else {}
        else:
            node = payload
        name = pick_first(node, "name", "product_name", "description")
        if not name:
            continue
        return {
            "provider": "WIRESHAPE_WEB",
            "sourceLicense": "Public website data (respect provider terms and robots)",
            "code": gtin,
            "name": name[:255],
            "brand": pick_first(node, "brand", "manufacturer", "vendor")[:120],
            "category": pick_first(node, "category", "department", "segment")[:120],
            "ncm": pick_first(node, "ncm", "ncm_code")[:32],
            "unit": pick_first(node, "unit", "uom", "unit_measure")[:32],
            "description": pick_first(node, "description", "short_description", "details")[:1024],
            "manufacturer": pick_first(node, "manufacturer", "producer", "brand")[:255],
            "packageDescription": pick_first(node, "package", "package_description", "content")[:255],
            "imageUrl": canonical_url(pick_first(node, "image", "image_url", "photo")),
            "attributesJson": to_json(node.get("attributes") or node.get("specs") or {}),
            "rawPayload": to_json({"source": url, "payload": payload}),
        }
    return None


def merge_records(gtin: str, candidates: List[Dict[str, Any]]) -> Optional[EnrichedRecord]:
    if not candidates:
        return None
    provider_rank = {
        "WIRESHAPE_WEB": 1,
    }
    candidates.sort(key=lambda item: provider_rank.get(str(item.get("provider")), 99))
    base = dict(candidates[0])

    def fill(field: str) -> None:
        if norm_text(base.get(field)):
            return
        for item in candidates[1:]:
            value = norm_text(item.get(field))
            if value:
                base[field] = value
                return

    for key in (
        "name",
        "brand",
        "category",
        "ncm",
        "unit",
        "description",
        "manufacturer",
        "packageDescription",
        "imageUrl",
        "attributesJson",
    ):
        fill(key)

    raw_payload = {
        "gtin": gtin,
        "sources": candidates,
    }

    return EnrichedRecord(
        provider=norm_text(base.get("provider")) or "EXTERNAL_BARCODE_ENRICH",
        source_license=norm_text(base.get("sourceLicense")) or "External barcode enrichment",
        code=gtin,
        name=norm_text(base.get("name"))[:255],
        brand=norm_text(base.get("brand"))[:120],
        category=norm_text(base.get("category"))[:120],
        ncm=norm_text(base.get("ncm"))[:32],
        unit=norm_text(base.get("unit"))[:32],
        description=norm_text(base.get("description"))[:1024],
        manufacturer=norm_text(base.get("manufacturer"))[:255],
        package_description=norm_text(base.get("packageDescription"))[:255],
        image_url=canonical_url(base.get("imageUrl")),
        image_storage_key="",
        attributes_json=norm_text(base.get("attributesJson"))[:4000],
        raw_payload=to_json(raw_payload),
    )


class LocalImageStorage:
    def __init__(self, base_dir: Path, max_bytes: int):
        self.store = OptimizedImageStore(
            base_dir=base_dir,
            max_bytes=max_bytes,
            user_agent="Mozilla/5.0 (compatible; MercadoFlowCatalogHarvester/1.0)",
        )

    def save(self, provider: str, gtin: str, image_url: str) -> str:
        return self.store.save(gtin, image_url)


def chunks(items: Sequence[EnrichedRecord], size: int) -> Iterable[List[EnrichedRecord]]:
    for start in range(0, len(items), size):
        yield list(items[start:start + size])


def import_records(args: argparse.Namespace, token: str, records: Sequence[EnrichedRecord]) -> Dict[str, int]:
    if not args.api_base or not token:
        return {"importedProducts": 0, "errors": 0}
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
    grouped: Dict[str, List[EnrichedRecord]] = {}
    for record in records:
        grouped.setdefault(record.provider, []).append(record)

    endpoint = args.import_endpoint if args.import_endpoint.startswith("/") else f"/{args.import_endpoint}"
    batch_size = max(1, min(int(args.batch_size), 2000))

    for provider, provider_records in grouped.items():
        source_license = provider_records[0].source_license if provider_records else "External enrichment"
        for batch in chunks(provider_records, batch_size):
            payload = {
                "provider": provider,
                "sourceLicense": source_license,
                "confidenceScore": args.confidence,
                "skipMedication": True,
                "items": [record.as_import_item() for record in batch],
            }
            response = requests.post(
                f"{args.api_base.rstrip('/')}{endpoint}",
                headers=headers,
                json=payload,
                timeout=180,
            )
            response.raise_for_status()
            stats = response.json()
            for key in totals:
                totals[key] += int(stats.get(key, 0))

    return totals


def run_once(args: argparse.Namespace) -> int:
    token = ensure_token(args)
    all_gtins = []
    all_gtins.extend(args.gtin or [])
    all_gtins.extend(read_input_gtins(args.input))
    all_gtins.extend(fetch_catalog_gtins(args, token))
    gtins = unique_gtins(all_gtins, max(1, int(args.max_gtins)))

    if not gtins:
        print("no GTINs to enrich")
        return 0

    image_store = LocalImageStorage(Path(args.images_dir).resolve(), int(args.max_image_bytes)) if args.download_images else None
    results: List[EnrichedRecord] = []

    for index, gtin in enumerate(gtins, start=1):
        candidates = []
        wireshape = fetch_from_wireshape(gtin)
        if wireshape:
            candidates.append(wireshape)

        merged = merge_records(gtin, candidates)
        if not merged or not merged.name:
            continue
        if image_store and merged.image_url:
            try:
                merged.image_storage_key = image_store.save(merged.provider, merged.code, merged.image_url)
            except Exception:
                merged.image_storage_key = ""
        results.append(merged)

        if index % 100 == 0:
            print(f"processed={index} enriched={len(results)}")

    output_path = Path(args.output).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(
            {
                "source": "BARCODE_ENRICHMENT_SERVICE",
                "count": len(results),
                "items": [record.as_import_item() | {"provider": record.provider, "sourceLicense": record.source_license} for record in results],
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"saved output: {output_path} count={len(results)}")

    if args.skip_api_import:
        return 0

    if not args.api_base or not token:
        print("api import skipped: missing --api-base or token/email/password")
        return 0

    totals = import_records(args, token, results)
    print("import totals")
    print(json.dumps(totals, ensure_ascii=False, indent=2))
    return 0


def main() -> int:
    args = parse_args()
    if not args.watch:
        try:
            return run_once(args)
        except Exception as exc:
            print(f"enrichment cycle failed: {exc}", file=sys.stderr)
            return 1

    interval = max(60, int(args.interval_minutes) * 60)
    print(f"watch mode enabled interval={max(1, interval // 60)} minutes")
    while True:
        try:
            code = run_once(args)
            if code != 0:
                return code
        except KeyboardInterrupt:
            print("stopped by user")
            return 0
        except Exception as exc:
            print(f"enrichment cycle failed: {exc}", file=sys.stderr)
        time.sleep(interval)


if __name__ == "__main__":
    raise SystemExit(main())
