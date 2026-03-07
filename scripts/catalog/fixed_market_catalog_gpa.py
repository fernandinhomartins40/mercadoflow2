#!/usr/bin/env python3
from __future__ import annotations

import json
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from typing import Any, Callable, Dict, Iterable, List, Optional, Tuple

import requests

from fixed_market_catalog_common import ImportOptions, MarketImportSession, RunCancelled, norm_gtin, norm_text, normalize_key

_THREAD_LOCAL = threading.local()


@dataclass(frozen=True)
class GpaJobConfig:
    name: str
    brand: str
    store_id: int
    provider: str
    source_license: str
    output: str
    site_base: str
    allowed_root_categories: Tuple[str, ...] = ()


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


def fetch_categories(session: requests.Session, job: GpaJobConfig) -> Dict[str, Any]:
    response = session.get(
        f"https://api.vendas.gpa.digital/{job.brand}/v4/products/categories/ecom",
        params={"storeId": job.store_id},
        timeout=45,
    )
    response.raise_for_status()
    payload = response.json()
    return payload if isinstance(payload, dict) else {}


def iter_shelf_nodes(node: Any, trail: Tuple[str, ...] = ()) -> Iterable[Tuple[int, str]]:
    if isinstance(node, list):
        for item in node:
            yield from iter_shelf_nodes(item, trail)
        return

    if not isinstance(node, dict):
        return

    name = norm_text(node.get("name"))
    next_trail = trail + ((name,) if name else ())
    node_id = node.get("id")
    if isinstance(node_id, int) and node_id > 0:
        yield node_id, " > ".join(next_trail[:4])[:255]

    for child in node.get("subCategories") or []:
        yield from iter_shelf_nodes(child, next_trail)


def crawl_shelf(job: GpaJobConfig, shelf_id: int, pause_ms: int) -> Tuple[int, List[Dict[str, Any]]]:
    session = thread_session()
    rows: List[Dict[str, Any]] = []
    page = 1
    seen_signatures: set[str] = set()
    while True:
        response = session.get(
            f"https://api.vendas.gpa.digital/{job.brand}/v2/products/ecom/seeMore",
            params={
                "storeId": job.store_id,
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
        signature = "|".join(str(item.get("id")) for item in items if item.get("id") is not None)
        if signature in seen_signatures:
            break
        seen_signatures.add(signature)
        rows.extend([item for item in items if isinstance(item, dict)])
        if len(items) < 50:
            break
        page += 1
        if page > 1000:
            break
        if pause_ms > 0:
            time.sleep(pause_ms / 1000.0)
    return shelf_id, rows


def fetch_best_prices(job: GpaJobConfig, product_id: str, pause_ms: int) -> Dict[str, Any]:
    session = thread_session()
    response = session.get(
        f"https://api.vendas.gpa.digital/{job.brand}/v4/products/ecom/{product_id}/bestPrices",
        params={"storeId": job.store_id, "sellType": "normal", "isClienteMais": "true"},
        timeout=40,
    )
    if pause_ms > 0:
        time.sleep(pause_ms / 1000.0)
    if response.status_code != 200:
        return {}
    payload = response.json()
    return payload if isinstance(payload, dict) else {}


def pick_category(details: Dict[str, Any], fallback: str) -> str:
    content = details.get("content") if isinstance(details, dict) else {}
    shelves = content.get("shelfList") if isinstance(content, dict) else []
    names: List[str] = []
    for item in shelves or []:
        if not isinstance(item, dict):
            continue
        name = norm_text(item.get("name"))
        if name and name not in names:
            names.append(name)
    if names:
        return " > ".join(names[:4])[:255]
    return fallback


def pick_image_url(content: Dict[str, Any], brand: str) -> str:
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
                    return ("https://static.extramercado.com.br" if brand == "ex" else "https://static.paodeacucar.com") + value
    thumb = norm_text(content.get("thumbPath"))
    if thumb:
        if thumb.startswith("http"):
            return thumb
        return ("https://static.extramercado.com.br" if brand == "ex" else "https://static.paodeacucar.com") + thumb
    return ""


def merge_record(job: GpaJobConfig, base: Dict[str, Any], details: Dict[str, Any], fallback_category: str) -> Dict[str, Any]:
    content = details.get("content") if isinstance(details, dict) else {}
    if not isinstance(content, dict):
        content = {}
    product_id = norm_text(base.get("id") or content.get("id"))
    sku = norm_text(base.get("sku") or content.get("sku"))
    ean = norm_gtin(content.get("ean"))
    name = norm_text(content.get("name") or base.get("name"))[:255]
    brand = norm_text(content.get("brand") or base.get("brand"))[:120]
    category = pick_category(details, fallback_category)
    image_url = pick_image_url(content if content else base, job.brand)
    short_desc = norm_text(content.get("shortDescription") or base.get("shortDescription"))[:2048]
    source_url = norm_text(content.get("urlDetails") or base.get("urlDetails"))
    if source_url and not source_url.startswith("http"):
        source_url = f"{job.site_base}{source_url}"
    price_value = content.get("sellPrice") or content.get("currentPrice") or base.get("sellPrice") or base.get("currentPrice")
    try:
        price = float(price_value) if price_value is not None else None
    except Exception:
        price = None

    return {
        "code": ean or sku or product_id,
        "name": name,
        "brand": brand,
        "category": category,
        "description": short_desc,
        "imageUrl": image_url,
        "imageStorageKey": "",
        "sourceUrl": source_url,
        "currency": "BRL",
        "price": price,
        "providerProductId": product_id or sku,
        "attributesJson": json.dumps(
            {
                "storeId": job.store_id,
                "sku": sku,
                "productId": product_id,
                "brand": job.brand,
                "urlDetails": content.get("urlDetails") or base.get("urlDetails"),
            },
            ensure_ascii=False,
        ),
        "rawPayload": {"base": base, "details": details},
    }


def run_gpa_catalog_job(
    job: GpaJobConfig,
    options: ImportOptions,
    max_workers_list: int = 8,
    max_workers_detail: int = 16,
    pause_ms: int = 0,
    cancel_check: Optional[Callable[[], bool]] = None,
) -> Dict[str, Any]:
    session = build_session()
    categories = fetch_categories(session, job)
    session_import = MarketImportSession(options, cancel_check=cancel_check)

    def cancelled_result(message: str) -> Dict[str, Any]:
        totals, manifest_path = session_import.finalize(
            {
                "source": "GPA_PUBLIC_API",
                "storeId": job.store_id,
                "selectedRootCategories": selected_roots,
                "shelvesDiscovered": len(shelf_ids),
                "rowsTotal": listing_rows_total,
                "productsUnique": len(unique_rows),
            },
            flush_pending=False,
        )
        return {
            "status": "CANCELLED",
            "message": message,
            "summary": [
                {
                    "source": job.name,
                    "provider": job.provider,
                    "capturedProducts": session_import.captured,
                    "rowsTotal": listing_rows_total,
                    "productsUnique": len(unique_rows),
                    "outputManifest": str(manifest_path),
                }
            ],
            "scannedProducts": int(totals.get("scannedProducts", 0)),
            "importedProducts": int(totals.get("importedProducts", 0)),
            "skippedInvalidGtin": int(totals.get("skippedInvalidGtin", 0)),
            "skippedMissingName": int(totals.get("skippedMissingName", 0)),
            "skippedMedication": int(totals.get("skippedMedication", 0)),
            "skippedDuplicateGtin": int(totals.get("skippedDuplicateGtin", 0)),
            "errors": int(totals.get("errors", 0)),
        }

    shelf_paths: Dict[int, str] = {}
    allowed_roots = {normalize_key(value) for value in job.allowed_root_categories if normalize_key(value)}
    selected_roots: List[str] = []
    for root_node in categories.get("content") or []:
        root_name = norm_text(root_node.get("name")) if isinstance(root_node, dict) else ""
        if allowed_roots and normalize_key(root_name) not in allowed_roots:
            continue
        if root_name:
            selected_roots.append(root_name)
        for shelf_id, trail in iter_shelf_nodes(root_node):
            shelf_paths.setdefault(shelf_id, trail)
    shelf_ids = sorted(shelf_paths.keys())
    print(f"[{job.provider}] shelves discovered={len(shelf_ids)} roots={selected_roots or 'ALL'}")

    unique_rows: Dict[str, Dict[str, Any]] = {}
    listing_errors = 0
    listing_rows_total = 0
    executor = ThreadPoolExecutor(max_workers=max(1, max_workers_list))
    cancelled = False
    futures = [executor.submit(crawl_shelf, job, shelf_id, pause_ms) for shelf_id in shelf_ids]
    try:
        for index, future in enumerate(as_completed(futures), start=1):
            if cancel_check and cancel_check():
                cancelled = True
                break
            try:
                shelf_id, rows = future.result()
            except Exception as exc:
                listing_errors += 1
                print(f"[{job.provider}] shelf error: {exc}")
                continue
            listing_rows_total += len(rows)
            fallback_category = shelf_paths.get(shelf_id, "")
            for row in rows:
                product_id = norm_text(row.get("id"))
                if not product_id:
                    continue
                current = unique_rows.get(product_id)
                if current is None:
                    copied = dict(row)
                    copied["_crawlerCategoryPath"] = fallback_category
                    unique_rows[product_id] = copied
                elif not norm_text(current.get("_crawlerCategoryPath")) and fallback_category:
                    current["_crawlerCategoryPath"] = fallback_category
            if index % 25 == 0 or index == len(futures):
                print(f"[{job.provider}] listing progress={index}/{len(futures)} rows={listing_rows_total} unique={len(unique_rows)}")
    finally:
        executor.shutdown(wait=not cancelled, cancel_futures=cancelled)

    if cancelled:
        return cancelled_result(f"{job.name}: execucao cancelada durante a varredura de categorias.")

    detail_errors = 0
    executor = ThreadPoolExecutor(max_workers=max(1, max_workers_detail))
    cancelled = False
    future_to_product = {
        executor.submit(fetch_best_prices, job, product_id, pause_ms): product_id
        for product_id in unique_rows.keys()
    }
    try:
        for index, future in enumerate(as_completed(future_to_product), start=1):
            if cancel_check and cancel_check():
                cancelled = True
                break
            product_id = future_to_product[future]
            base = unique_rows[product_id]
            try:
                details = future.result()
            except Exception as exc:
                detail_errors += 1
                print(f"[{job.provider}] detail error product_id={product_id} error={exc}")
                continue
            try:
                record = merge_record(job, base, details, norm_text(base.get("_crawlerCategoryPath")))
                session_import.push(record)
            except RunCancelled:
                cancelled = True
                break
            if index % 250 == 0 or index == len(future_to_product):
                print(f"[{job.provider}] detail progress={index}/{len(future_to_product)} captured={session_import.captured}")
    finally:
        executor.shutdown(wait=not cancelled, cancel_futures=cancelled)

    if cancelled:
        return cancelled_result(f"{job.name}: execucao cancelada durante a coleta detalhada.")

    totals, manifest_path = session_import.finalize(
        {
            "source": "GPA_PUBLIC_API",
            "storeId": job.store_id,
            "selectedRootCategories": selected_roots,
            "shelvesDiscovered": len(shelf_ids),
            "rowsTotal": listing_rows_total,
            "productsUnique": len(unique_rows),
        }
    )
    total_errors = listing_errors + detail_errors + int(totals.get("errors", 0))
    return {
        "status": "SUCCESS" if total_errors == 0 else "FAILED",
        "message": (
            f"{job.name}: capturados={session_import.captured} "
            f"importados={totals.get('importedProducts', 0)} "
            f"erros={total_errors}"
        ),
        "summary": [
            {
                "source": job.name,
                "provider": job.provider,
                "capturedProducts": session_import.captured,
                "rowsTotal": listing_rows_total,
                "productsUnique": len(unique_rows),
                "outputManifest": str(manifest_path),
            }
        ],
        "scannedProducts": int(totals.get("scannedProducts", session_import.captured)),
        "importedProducts": int(totals.get("importedProducts", 0)),
        "skippedInvalidGtin": int(totals.get("skippedInvalidGtin", 0)),
        "skippedMissingName": int(totals.get("skippedMissingName", 0)),
        "skippedMedication": int(totals.get("skippedMedication", 0)),
        "skippedDuplicateGtin": int(totals.get("skippedDuplicateGtin", 0)),
        "errors": total_errors,
    }
