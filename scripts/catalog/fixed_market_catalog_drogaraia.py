#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import sys
import time
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional, Tuple
from urllib.parse import urljoin

import requests

from fixed_market_catalog_common import (
    ImportOptions,
    MarketImportSession,
    RemoteCheckpointStore,
    RunCancelled,
    canonical_url,
    norm_gtin,
    norm_text,
    normalize_key,
    plain_text,
    request_with_retry,
    stable_hash,
)

EXTRACTION_SCHEMA_VERSION = "2026-03-31-drogaraia-next-category-v1"
NEXT_DATA_RE = re.compile(
    r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>',
    re.IGNORECASE | re.DOTALL,
)


@dataclass(frozen=True)
class DrogariaRaiaJobConfig:
    name: str
    provider: str
    source_license: str
    output: str
    site_base: str
    home_url: str
    selected_categories: Tuple[str, ...] = ()
    request_interval_seconds: float = 0.15


@dataclass(frozen=True)
class DrogariaRaiaCategory:
    names: Tuple[str, ...]
    url_path: str

    @property
    def label(self) -> str:
        return " > ".join(self.names)


def build_session() -> requests.Session:
    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/135.0.0.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
            "Upgrade-Insecure-Requests": "1",
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "none",
            "Sec-Fetch-User": "?1",
            "sec-ch-ua": "\"Chromium\";v=\"135\", \"Not=A?Brand\";v=\"8\"",
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": "\"Windows\"",
        }
    )
    return session


def extract_next_data(text: str) -> Dict[str, Any]:
    match = NEXT_DATA_RE.search(text)
    if not match:
        raise ValueError("NEXT_DATA not found in Drogaria Raia response")
    payload = json.loads(match.group(1))
    if not isinstance(payload, dict):
        raise ValueError("Invalid NEXT_DATA payload for Drogaria Raia")
    return payload


def fetch_home_menu(job: DrogariaRaiaJobConfig, session: requests.Session) -> List[Dict[str, Any]]:
    response = request_with_retry(session, "GET", job.home_url, attempts=6, timeout=60)
    payload = extract_next_data(response.text)
    menu_items = (((payload.get("props") or {}).get("pageProps") or {}).get("data") or {}).get("menuItems")
    if not isinstance(menu_items, list):
        raise ValueError("Drogaria Raia home payload does not expose menuItems")
    return [item for item in menu_items if isinstance(item, dict)]


def append_categories(
    node: Dict[str, Any],
    parent_names: Tuple[str, ...],
    leaves: List[DrogariaRaiaCategory],
) -> None:
    name = norm_text(node.get("name"))
    if not name:
        return
    children_raw = node.get("children")
    children = [child for child in children_raw if isinstance(child, dict)] if isinstance(children_raw, list) else []
    trail = parent_names + (name,)
    url_path = norm_text(node.get("url_path") or node.get("urlPath")).lstrip("/")
    if url_path and not children:
        leaves.append(DrogariaRaiaCategory(names=trail, url_path=url_path))
    for child in children:
        append_categories(child, trail, leaves)


def iter_category_leaves(menu_items: List[Dict[str, Any]]) -> List[DrogariaRaiaCategory]:
    leaves: List[DrogariaRaiaCategory] = []
    seen_paths: set[str] = set()
    for item in menu_items:
        append_categories(item, (), leaves)
    unique: List[DrogariaRaiaCategory] = []
    for leaf in leaves:
        key = normalize_key(leaf.url_path)
        if not key or key in seen_paths:
            continue
        seen_paths.add(key)
        unique.append(leaf)
    return unique


def category_matches(job: DrogariaRaiaJobConfig, category_label: str) -> bool:
    selected = [normalize_key(value) for value in job.selected_categories if normalize_key(value)]
    if not selected:
        return True
    normalized_label = normalize_key(category_label)
    if not normalized_label:
        return False
    return any(value in normalized_label for value in selected)


def build_category_page_url(job: DrogariaRaiaJobConfig, category: DrogariaRaiaCategory, page: int) -> str:
    base_url = canonical_url(urljoin(f"{job.site_base.rstrip('/')}/", category.url_path.lstrip("/")))
    if page <= 1:
        return base_url
    separator = "&" if "?" in base_url else "?"
    return f"{base_url}{separator}page={page}"


def fetch_category_page(
    job: DrogariaRaiaJobConfig,
    session: requests.Session,
    category: DrogariaRaiaCategory,
    page: int,
) -> Dict[str, Any]:
    page_url = build_category_page_url(job, category, page)
    if job.request_interval_seconds > 0:
        time.sleep(job.request_interval_seconds)
    response = request_with_retry(session, "GET", page_url, attempts=6, timeout=60)
    payload = extract_next_data(response.text)
    page_props = ((payload.get("props") or {}).get("pageProps") or {})
    page_type = norm_text(page_props.get("type")).lower()
    if page_type != "category":
        raise ValueError(f"Drogaria Raia category route returned type={page_type or 'unknown'}")
    page_data = page_props.get("pageData")
    if not isinstance(page_data, dict):
        raise ValueError("Drogaria Raia category payload missing pageData")
    page_info = page_data.get("page_info")
    if not isinstance(page_info, dict):
        raise ValueError("Drogaria Raia category payload missing page_info")
    items = page_data.get("items")
    if not isinstance(items, list):
        items = []
    return {
        "pageUrl": page_url,
        "pageInfo": page_info,
        "items": [item for item in items if isinstance(item, dict)],
    }


def find_custom_attribute(item: Dict[str, Any], attribute_code: str) -> Dict[str, Any]:
    attributes = item.get("custom_attributes")
    if not isinstance(attributes, list):
        return {}
    expected = normalize_key(attribute_code)
    for attribute in attributes:
        if not isinstance(attribute, dict):
            continue
        if normalize_key(attribute.get("attribute_code")) == expected:
            return attribute
    return {}


def first_attribute_string(item: Dict[str, Any], attribute_code: str) -> str:
    attribute = find_custom_attribute(item, attribute_code)
    values = attribute.get("value_string")
    if isinstance(values, list):
        for value in values:
            text = norm_text(value)
            if text:
                return text
    return norm_text(attribute.get("value"))


def first_attribute_label(item: Dict[str, Any], attribute_code: str) -> str:
    attribute = find_custom_attribute(item, attribute_code)
    values = attribute.get("value")
    if isinstance(values, list):
        for value in values:
            if not isinstance(value, dict):
                continue
            label = norm_text(value.get("label"))
            if label:
                return label
    return norm_text(attribute.get("label"))


def extract_image_url(item: Dict[str, Any]) -> str:
    image_url = first_attribute_string(item, "image")
    if image_url:
        return canonical_url(image_url)
    gallery = item.get("media_gallery_entries")
    if isinstance(gallery, list):
        for entry in gallery:
            if not isinstance(entry, dict):
                continue
            candidate = canonical_url(entry.get("file") or entry.get("url"))
            if candidate:
                return candidate
    return ""


def parse_price(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        parsed = float(str(value).replace(",", "."))
    except Exception:
        return None
    return parsed if parsed > 0 else None


def build_page_hash(category: DrogariaRaiaCategory, page: int, items: List[Dict[str, Any]], page_info: Dict[str, Any]) -> str:
    codes: List[str] = []
    for item in items:
        ean = norm_gtin(first_attribute_string(item, "ean"))
        sku = norm_text(item.get("sku") or item.get("skuMkt"))
        codes.append(ean or sku)
    return stable_hash(
        {
            "schemaVersion": EXTRACTION_SCHEMA_VERSION,
            "categoryPath": category.url_path,
            "page": page,
            "totalCount": int(page_info.get("total_count") or 0),
            "codes": codes,
        }
    )


def item_to_record(
    job: DrogariaRaiaJobConfig,
    category: DrogariaRaiaCategory,
    page_url: str,
    item: Dict[str, Any],
) -> Dict[str, Any]:
    provider_product_id = norm_text(item.get("sku") or item.get("skuMkt"))
    gtin = norm_gtin(first_attribute_string(item, "ean"))
    code = gtin or provider_product_id
    if not code:
        raise ValueError("missing code")
    brand = first_attribute_label(item, "marca")
    manufacturer = first_attribute_label(item, "fabricante") or brand
    url_key = first_attribute_string(item, "url_key")
    source_url = canonical_url(urljoin(f"{job.site_base.rstrip('/')}/", f"{url_key}.html")) if url_key else canonical_url(page_url)
    category_label = category.label
    description = plain_text(first_attribute_string(item, "description") or first_attribute_string(item, "short_description"))[:2048]
    package_description = first_attribute_string(item, "quantidade")[:255]
    attributes = {
        "schemaVersion": EXTRACTION_SCHEMA_VERSION,
        "categoryPath": category_label,
        "categoryUrlPath": category.url_path,
        "tarja": first_attribute_string(item, "descricaotarja"),
        "therapeuticGroup": first_attribute_string(item, "grupo"),
        "subGroup": first_attribute_string(item, "subgruponome"),
        "seller": item.get("seller") or {},
        "labels": item.get("labels") or [],
        "skuMarketplace": item.get("skuMkt"),
    }
    return {
        "code": code,
        "name": norm_text(item.get("name"))[:255],
        "brand": brand[:120],
        "category": category_label[:255],
        "description": description,
        "manufacturer": manufacturer[:255],
        "packageDescription": package_description,
        "unit": "",
        "imageUrl": extract_image_url(item),
        "imageStorageKey": "",
        "sourceUrl": source_url,
        "currency": "BRL",
        "price": parse_price(item.get("price")),
        "providerProductId": provider_product_id[:128],
        "attributesJson": json.dumps(attributes, ensure_ascii=False),
        "rawPayload": {
            "categoryPath": category_label,
            "pageUrl": page_url,
            "item": item,
        },
    }


def run_drogaraia_catalog_job(
    job: DrogariaRaiaJobConfig,
    options: ImportOptions,
    max_pages_per_category: int = 0,
    cancel_check: Optional[Callable[[], bool]] = None,
) -> Dict[str, Any]:
    session = build_session()
    menu_items = fetch_home_menu(job, session)
    category_leaves = iter_category_leaves(menu_items)
    selected_categories = [leaf for leaf in category_leaves if category_matches(job, leaf.label)]
    session_import = MarketImportSession(options, cancel_check=cancel_check)
    checkpoint_store = RemoteCheckpointStore(options)
    completed_pages = checkpoint_store.list_completed("RAIA_CATEGORY_PAGE")
    pages_fetched = 0
    page_errors = 0
    record_errors = 0
    skipped_unmatched = max(0, len(category_leaves) - len(selected_categories))
    skipped_cached_pages = 0
    products_discovered = 0
    cancelled = False

    def build_result(status: str, message: str) -> Dict[str, Any]:
        totals, manifest_path = session_import.finalize(
            {
                "source": "RAIA_NEXT_CATEGORY_PAGES",
                "categoryLeavesDiscovered": len(category_leaves),
                "categoryLeavesSelected": len(selected_categories),
                "selectedCategories": list(job.selected_categories),
                "pagesFetched": pages_fetched,
                "productsDiscovered": products_discovered,
                "skippedCategoryLeaves": skipped_unmatched,
                "skippedCachedPages": skipped_cached_pages,
            },
            flush_pending=not cancelled,
        )
        total_errors = page_errors + record_errors + int(totals.get("errors", 0))
        final_status = status if status != "SUCCESS" or total_errors == 0 else "FAILED"
        return {
            "status": final_status,
            "message": message,
            "summary": [
                {
                    "source": job.name,
                    "provider": job.provider,
                    "capturedProducts": session_import.captured,
                    "pagesFetched": pages_fetched,
                    "productsDiscovered": products_discovered,
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

    for category_index, category in enumerate(selected_categories, start=1):
        if cancel_check and cancel_check():
            cancelled = True
            break
        page = 1
        total_pages = 1
        while page <= total_pages:
            if cancel_check and cancel_check():
                cancelled = True
                break
            scope_key = f"{category.url_path}|page={page}"
            try:
                payload = fetch_category_page(job, session, category, page)
            except Exception as exc:
                page_errors += 1
                checkpoint_store.mark(
                    "RAIA_CATEGORY_PAGE",
                    scope_key,
                    "",
                    "FAILED",
                    metadata={"category": category.label, "page": page, "urlPath": category.url_path},
                    error_message=str(exc),
                )
                print(
                    f"[{job.provider}] category page error category={category_index}/{len(selected_categories)} "
                    f"page={page} path={category.url_path} error={exc}",
                    file=sys.stderr,
                )
                if page >= total_pages:
                    break
                page += 1
                continue

            page_info = payload["pageInfo"]
            items = payload["items"]
            page_url = payload["pageUrl"]
            total_pages = max(1, int(page_info.get("total_pages") or 1))
            if max_pages_per_category and max_pages_per_category > 0:
                total_pages = min(total_pages, max_pages_per_category)
            page_hash = build_page_hash(category, page, items, page_info)
            cached_page = completed_pages.get(scope_key)
            if cached_page and norm_text(cached_page.get("scopeHash")) == page_hash:
                metadata = cached_page.get("metadata") or {}
                cached_gtins = metadata.get("gtins") if isinstance(metadata, dict) else []
                if not isinstance(cached_gtins, list):
                    cached_gtins = []
                missing_images = checkpoint_store.codes_needing_image_refresh(cached_gtins) if cached_gtins else set()
                if not missing_images:
                    skipped_cached_pages += 1
                    print(
                        f"[{job.provider}] skip cached category={category_index}/{len(selected_categories)} "
                        f"page={page}/{total_pages} path={category.url_path}"
                    )
                    page += 1
                    continue
                print(
                    f"[{job.provider}] reprocess category={category_index}/{len(selected_categories)} "
                    f"page={page}/{total_pages} path={category.url_path} missing_images={len(missing_images)}"
                )

            products_discovered += len(items)
            pages_fetched += 1
            page_gtins: List[str] = []
            session_import.publish_progress(
                force=True,
                stage="SCANNING",
                message=(
                    f"{job.provider}: categoria={category_index}/{len(selected_categories)} "
                    f"pagina={page}/{total_pages} capturados={session_import.captured}"
                ),
            )
            for item in items:
                try:
                    record = item_to_record(job, category, page_url, item)
                except Exception as exc:
                    record_errors += 1
                    print(
                        f"[{job.provider}] item mapping error category={category.url_path} "
                        f"page={page} sku={norm_text(item.get('sku') or item.get('skuMkt'))} error={exc}",
                        file=sys.stderr,
                    )
                    continue
                gtin = norm_gtin(record.get("code"))
                if gtin and gtin not in page_gtins:
                    page_gtins.append(gtin)
                try:
                    session_import.push(record)
                except RunCancelled:
                    cancelled = True
                    break
            if cancelled:
                break

            checkpoint_store.mark(
                "RAIA_CATEGORY_PAGE",
                scope_key,
                page_hash,
                "COMPLETED",
                item_count=len(items),
                metadata={
                    "gtins": page_gtins,
                    "category": category.label,
                    "page": page,
                    "totalPages": total_pages,
                    "urlPath": category.url_path,
                },
            )
            page += 1
        if cancelled:
            break

    if cancelled:
        return build_result("CANCELLED", f"{job.name}: execucao cancelada durante a varredura das categorias.")
    return build_result(
        "SUCCESS",
        (
            f"{job.name}: capturados={session_import.captured} "
            f"paginas={pages_fetched} produtos={products_discovered} "
            f"erros={page_errors + record_errors}"
        ),
    )
