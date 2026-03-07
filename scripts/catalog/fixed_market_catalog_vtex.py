#!/usr/bin/env python3
from __future__ import annotations

import json
import time
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional, Tuple
from urllib.parse import urlparse

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
    stable_hash,
)


@dataclass(frozen=True)
class VtexJobConfig:
    name: str
    provider: str
    source_license: str
    output: str
    site_base: str
    catalog_api_base: str
    mode: str
    sitemap_index_url: str = ""
    allowed_category_keywords: Tuple[str, ...] = ()
    selected_categories: Tuple[str, ...] = ()


def build_session() -> requests.Session:
    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": "Mozilla/5.0 (compatible; MercadoFlowCatalogHarvester/1.0)",
            "Accept": "application/json, text/plain, */*",
        }
    )
    return session


def parse_resources_total(response: requests.Response) -> int:
    header = norm_text(response.headers.get("Resources"))
    if "/" not in header:
        return 0
    try:
        return int(header.split("/", 1)[1])
    except Exception:
        return 0


def build_source_url(site_base: str, link_text: str) -> str:
    clean = norm_text(link_text).strip("/")
    if not clean:
        return ""
    return f"{site_base.rstrip('/')}/{clean}/p"


def normalize_category(categories: Any) -> str:
    if not isinstance(categories, list):
        return ""
    for category in categories:
        text = norm_text(category)
        if not text:
            continue
        parts = [norm_text(piece) for piece in text.split("/") if norm_text(piece)]
        if parts:
            return " > ".join(parts[:4])[:255]
    return ""


def extract_reference_id(item: Dict[str, Any]) -> str:
    value = item.get("referenceId")
    if isinstance(value, list):
        for entry in value:
            if isinstance(entry, dict):
                candidate = norm_text(entry.get("Value"))
                if candidate:
                    return candidate
            else:
                candidate = norm_text(entry)
                if candidate:
                    return candidate
    return norm_text(value)


def pick_primary_item(product: Dict[str, Any]) -> Dict[str, Any]:
    items = product.get("items") or []
    if not isinstance(items, list) or not items:
        return {}
    for item in items:
        if isinstance(item, dict) and norm_gtin(item.get("ean")):
            return item
    return items[0] if isinstance(items[0], dict) else {}


def product_to_record(job: VtexJobConfig, product: Dict[str, Any]) -> Dict[str, Any]:
    item = pick_primary_item(product)
    sellers = item.get("sellers") or []
    commercial_offer = sellers[0].get("commertialOffer") if sellers and isinstance(sellers[0], dict) else {}
    if not isinstance(commercial_offer, dict):
        commercial_offer = {}
    images = item.get("images") or []
    image_url = ""
    if images and isinstance(images[0], dict):
        image_url = canonical_url(images[0].get("imageUrl"))

    package_bits = [
        norm_text(item.get("nameComplete")),
        norm_text(item.get("measurementUnit")),
    ]
    category = normalize_category(product.get("categories"))
    provider_product_id = norm_text(product.get("productId") or item.get("itemId") or extract_reference_id(item))
    code = norm_gtin(item.get("ean")) or provider_product_id

    return {
        "code": code,
        "name": norm_text(product.get("productName"))[:255],
        "brand": norm_text(product.get("brand"))[:120],
        "category": category,
        "description": norm_text(product.get("description") or product.get("metaTagDescription"))[:2048],
        "manufacturer": norm_text(product.get("brand"))[:255],
        "packageDescription": " ".join([piece for piece in package_bits if piece])[:255],
        "imageUrl": image_url,
        "imageStorageKey": "",
        "sourceUrl": build_source_url(job.site_base, norm_text(product.get("linkText"))),
        "currency": "BRL",
        "price": commercial_offer.get("Price"),
        "providerProductId": provider_product_id,
        "attributesJson": json.dumps(
            {
                "categoryId": product.get("categoryId"),
                "brandId": product.get("brandId"),
                "referenceId": extract_reference_id(item),
                "measurementUnit": item.get("measurementUnit"),
                "unitMultiplier": item.get("unitMultiplier"),
            },
            ensure_ascii=False,
        ),
        "rawPayload": product,
    }


def category_matches(job: VtexJobConfig, product: Dict[str, Any]) -> bool:
    keywords = [normalize_key(value) for value in job.allowed_category_keywords if normalize_key(value)]
    categories = product.get("categories") if isinstance(product, dict) else None
    normalized_categories = normalize_key(" ".join(categories)) if isinstance(categories, list) else ""
    if keywords and not normalized_categories:
        return False
    if keywords and not any(keyword in normalized_categories for keyword in keywords):
        return False
    selected = [normalize_key(value) for value in job.selected_categories if normalize_key(value)]
    if not selected:
        return True
    if not normalized_categories:
        return False
    return any(category in normalized_categories for category in selected)


def fetch_search_page(job: VtexJobConfig, start: int, end: int) -> Tuple[List[Dict[str, Any]], int]:
    last_error: Optional[Exception] = None
    for attempt in range(1, 4):
        try:
            response = build_session().get(
                f"{job.catalog_api_base.rstrip('/')}/api/catalog_system/pub/products/search",
                params={"_from": start, "_to": end},
                timeout=45,
            )
            response.raise_for_status()
            payload = response.json()
            return (payload if isinstance(payload, list) else []), parse_resources_total(response)
        except requests.HTTPError as exc:
            status_code = exc.response.status_code if exc.response is not None else 0
            if status_code < 500 or attempt >= 3:
                raise
            last_error = exc
        except requests.RequestException as exc:
            last_error = exc
        time.sleep(min(2.0, 0.35 * attempt))
    if last_error is not None:
        raise last_error
    raise RuntimeError("search page request failed without explicit error")


def fetch_product_by_url(job: VtexJobConfig, product_url: str) -> Optional[Dict[str, Any]]:
    path = urlparse(product_url).path or ""
    if not path:
        return None
    last_error: Optional[Exception] = None
    for attempt in range(1, 4):
        try:
            response = build_session().get(
                f"{job.catalog_api_base.rstrip('/')}/api/catalog_system/pub/products/search{path}",
                timeout=45,
            )
            if response.status_code in {404, 410}:
                return None
            response.raise_for_status()
            payload = response.json()
            if not isinstance(payload, list) or not payload:
                return None
            return payload[0] if isinstance(payload[0], dict) else None
        except requests.HTTPError as exc:
            status_code = exc.response.status_code if exc.response is not None else 0
            if status_code in {404, 410}:
                return None
            if status_code < 500 or attempt >= 3:
                raise
            last_error = exc
        except requests.RequestException as exc:
            last_error = exc
        time.sleep(min(2.5, 0.4 * attempt))
    if last_error is not None:
        raise last_error
    return None


def fetch_sitemap_product_urls(sitemap_url: str) -> List[str]:
    last_error: Optional[Exception] = None
    response: Optional[requests.Response] = None
    for attempt in range(1, 4):
        try:
            response = build_session().get(sitemap_url, timeout=45)
            response.raise_for_status()
            break
        except requests.RequestException as exc:
            last_error = exc
            if attempt >= 3:
                raise
            time.sleep(min(2.0, 0.35 * attempt))
    if response is None:
        if last_error is not None:
            raise last_error
        raise RuntimeError("sitemap request failed without response")
    root = ET.fromstring(response.text)
    namespace = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    return [
        loc.text.strip()
        for loc in root.findall(".//sm:loc", namespace)
        if loc.text and norm_text(loc.text)
    ]


def fetch_sitemap_index(job: VtexJobConfig) -> List[str]:
    last_error: Optional[Exception] = None
    response: Optional[requests.Response] = None
    for attempt in range(1, 4):
        try:
            response = build_session().get(job.sitemap_index_url, timeout=45)
            response.raise_for_status()
            break
        except requests.RequestException as exc:
            last_error = exc
            if attempt >= 3:
                raise
            time.sleep(min(2.0, 0.35 * attempt))
    if response is None:
        if last_error is not None:
            raise last_error
        raise RuntimeError("sitemap index request failed without response")
    root = ET.fromstring(response.text)
    namespace = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    urls = [
        loc.text.strip()
        for loc in root.findall(".//sm:loc", namespace)
        if loc.text and "/sitemap/product-" in loc.text
    ]

    def sort_key(value: str) -> int:
        tail = value.rsplit("product-", 1)[-1].split(".xml", 1)[0]
        try:
            return int(tail)
        except Exception:
            return 0

    return sorted(urls, key=sort_key)


def run_vtex_paged_job(
    job: VtexJobConfig,
    options: ImportOptions,
    page_size: int = 50,
    max_pages: int = 0,
    slug_fallback: bool = True,
    cancel_check: Optional[Callable[[], bool]] = None,
) -> Dict[str, Any]:
    start = 0
    pages = 0
    total_hint = 0
    page_errors = 0
    skipped_unmatched = 0
    skipped_cached_pages = 0
    session_import = MarketImportSession(options, cancel_check=cancel_check)
    checkpoint_store = RemoteCheckpointStore(options)
    completed_pages = checkpoint_store.list_completed("VTEX_PAGE")

    while True:
        if cancel_check and cancel_check():
            totals, manifest_path = session_import.finalize(
                {
                    "source": "VTEX_SEARCH_API",
                    "pagesFetched": pages,
                    "totalHint": total_hint,
                    "skippedCategoryMismatch": skipped_unmatched,
                    "selectedCategoryKeywords": list(job.allowed_category_keywords),
                    "selectedCategories": list(job.selected_categories),
                },
                flush_pending=False,
            )
            return {
                "status": "CANCELLED",
                "message": f"{job.name}: execucao cancelada durante a paginacao.",
                "summary": [
                    {
                        "source": job.name,
                        "provider": job.provider,
                        "capturedProducts": session_import.captured,
                        "pagesFetched": pages,
                        "outputManifest": str(manifest_path),
                    }
                ],
                "scannedProducts": int(totals.get("scannedProducts", 0)),
                "importedProducts": int(totals.get("importedProducts", 0)),
                "skippedInvalidGtin": int(totals.get("skippedInvalidGtin", 0)),
                "skippedMissingName": int(totals.get("skippedMissingName", 0)),
                "skippedMedication": int(totals.get("skippedMedication", 0)),
                "skippedDuplicateGtin": int(totals.get("skippedDuplicateGtin", 0)),
                "errors": page_errors + int(totals.get("errors", 0)),
            }
        try:
            products, total_hint = fetch_search_page(job, start, start + page_size - 1)
        except Exception as exc:
            page_errors += 1
            print(f"[{job.provider}] page error offset={start} error={exc}")
            break

        if not products:
            break

        page_key = f"offset:{start}-{start + page_size - 1}"
        page_hash = stable_hash([norm_text(product.get("productId") or product.get("linkText")) for product in products])
        cached_page = completed_pages.get(page_key)
        if cached_page and norm_text(cached_page.get("scopeHash")) == page_hash:
            metadata = cached_page.get("metadata") or {}
            page_gtins = metadata.get("gtins") if isinstance(metadata, dict) else []
            if isinstance(page_gtins, list) and page_gtins:
                missing_images = checkpoint_store.codes_needing_image_refresh(page_gtins)
                if not missing_images:
                    skipped_cached_pages += 1
                    pages += 1
                    start += page_size
                    print(f"[{job.provider}] skip cached page={page_key} total_hint={total_hint or 'n/a'}")
                    if max_pages and pages >= max_pages:
                        break
                    if total_hint and start >= total_hint:
                        break
                    continue
                print(f"[{job.provider}] reprocess cached page={page_key} missing_images={len(missing_images)}")
            else:
                print(f"[{job.provider}] reprocess cached page={page_key} reason=missing-gtin-metadata")

        page_detail_errors = 0
        page_gtins: List[str] = []
        for product in products:
            if not category_matches(job, product):
                skipped_unmatched += 1
                continue
            record = product_to_record(job, product)
            if slug_fallback and not norm_gtin(record.get("code")):
                try:
                    detail = fetch_product_by_url(job, build_source_url(job.site_base, norm_text(product.get("linkText"))))
                except Exception as exc:
                    page_detail_errors += 1
                    print(f"[{job.provider}] page detail fallback error offset={start} error={exc}")
                    continue
                if detail:
                    record = product_to_record(job, detail)
            gtin = norm_gtin(record.get("code"))
            if gtin and gtin not in page_gtins:
                page_gtins.append(gtin)
            try:
                session_import.push(record)
            except RunCancelled:
                totals, manifest_path = session_import.finalize(
                    {
                        "source": "VTEX_SEARCH_API",
                        "pagesFetched": pages,
                        "totalHint": total_hint,
                        "skippedCategoryMismatch": skipped_unmatched,
                        "selectedCategoryKeywords": list(job.allowed_category_keywords),
                        "selectedCategories": list(job.selected_categories),
                    },
                    flush_pending=False,
                )
                return {
                    "status": "CANCELLED",
                    "message": f"{job.name}: execucao cancelada durante a coleta de itens.",
                    "summary": [
                        {
                            "source": job.name,
                            "provider": job.provider,
                            "capturedProducts": session_import.captured,
                            "pagesFetched": pages,
                            "outputManifest": str(manifest_path),
                        }
                    ],
                    "scannedProducts": int(totals.get("scannedProducts", 0)),
                    "importedProducts": int(totals.get("importedProducts", 0)),
                    "skippedInvalidGtin": int(totals.get("skippedInvalidGtin", 0)),
                    "skippedMissingName": int(totals.get("skippedMissingName", 0)),
                    "skippedMedication": int(totals.get("skippedMedication", 0)),
                    "skippedDuplicateGtin": int(totals.get("skippedDuplicateGtin", 0)),
                    "errors": page_errors + int(totals.get("errors", 0)),
                }

        errors_before_flush = int(session_import.totals.get("errors", 0))
        session_import.flush()
        import_errors = int(session_import.totals.get("errors", 0)) - errors_before_flush
        checkpoint_status = "COMPLETED" if page_detail_errors == 0 and import_errors == 0 else "FAILED"
        checkpoint_store.mark(
            "VTEX_PAGE",
            page_key,
            page_hash,
            checkpoint_status,
            item_count=len(products),
            metadata={
                "page": pages + 1,
                "offsetStart": start,
                "offsetEnd": start + page_size - 1,
                "totalHint": total_hint,
                "provider": job.provider,
                "gtins": page_gtins,
            },
            error_message="" if checkpoint_status == "COMPLETED" else "page detail/import error",
        )

        pages += 1
        start += page_size
        print(f"[{job.provider}] page={pages} captured={session_import.captured} total_hint={total_hint or 'n/a'}")
        if max_pages and pages >= max_pages:
            break
        if total_hint and start >= total_hint:
            break

    totals, manifest_path = session_import.finalize(
        {
            "source": "VTEX_SEARCH_API",
            "pagesFetched": pages,
            "totalHint": total_hint,
            "skippedCategoryMismatch": skipped_unmatched,
            "skippedCachedPages": skipped_cached_pages,
            "selectedCategoryKeywords": list(job.allowed_category_keywords),
            "selectedCategories": list(job.selected_categories),
        }
    )
    total_errors = page_errors + int(totals.get("errors", 0))
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
                "pagesFetched": pages,
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


def run_vtex_sitemap_job(
    job: VtexJobConfig,
    options: ImportOptions,
    product_workers: int = 16,
    cancel_check: Optional[Callable[[], bool]] = None,
) -> Dict[str, Any]:
    sitemap_errors = 0
    detail_errors = 0
    skipped_missing_detail = 0
    skipped_unmatched = 0
    skipped_cached_sitemaps = 0
    sitemap_urls = fetch_sitemap_index(job)
    session_import = MarketImportSession(options, cancel_check=cancel_check)
    checkpoint_store = RemoteCheckpointStore(options)
    completed_sitemaps = checkpoint_store.list_completed("VTEX_SITEMAP")
    discovered_products = 0

    for sitemap_index, sitemap_url in enumerate(sitemap_urls, start=1):
        if cancel_check and cancel_check():
            totals, manifest_path = session_import.finalize(
                {
                    "source": "VTEX_SITEMAP_PRODUCT_API",
                    "sitemapsFetched": len(sitemap_urls),
                    "productsDiscovered": discovered_products,
                    "skippedMissingDetail": skipped_missing_detail,
                    "skippedCategoryMismatch": skipped_unmatched,
                    "selectedCategoryKeywords": list(job.allowed_category_keywords),
                    "selectedCategories": list(job.selected_categories),
                },
                flush_pending=False,
            )
            return {
                "status": "CANCELLED",
                "message": f"{job.name}: execucao cancelada durante a leitura dos sitemaps.",
                "summary": [
                    {
                        "source": job.name,
                        "provider": job.provider,
                        "capturedProducts": session_import.captured,
                        "sitemapsFetched": sitemap_index - 1,
                        "productsDiscovered": discovered_products,
                        "outputManifest": str(manifest_path),
                    }
                ],
                "scannedProducts": int(totals.get("scannedProducts", 0)),
                "importedProducts": int(totals.get("importedProducts", 0)),
                "skippedInvalidGtin": int(totals.get("skippedInvalidGtin", 0)),
                "skippedMissingName": int(totals.get("skippedMissingName", 0)),
                "skippedMedication": int(totals.get("skippedMedication", 0)),
                "skippedDuplicateGtin": int(totals.get("skippedDuplicateGtin", 0)),
                "errors": sitemap_errors + detail_errors + int(totals.get("errors", 0)),
            }
        try:
            product_urls = fetch_sitemap_product_urls(sitemap_url)
        except Exception as exc:
            sitemap_errors += 1
            checkpoint_store.mark("VTEX_SITEMAP", sitemap_url, "", "FAILED", error_message=str(exc))
            print(f"[{job.provider}] sitemap error index={sitemap_index} url={sitemap_url} error={exc}")
            continue

        discovered_products += len(product_urls)
        sitemap_hash = stable_hash(product_urls)
        cached_sitemap = completed_sitemaps.get(sitemap_url)
        if cached_sitemap and norm_text(cached_sitemap.get("scopeHash")) == sitemap_hash:
            metadata = cached_sitemap.get("metadata") or {}
            sitemap_gtins = metadata.get("gtins") if isinstance(metadata, dict) else []
            if isinstance(sitemap_gtins, list) and sitemap_gtins:
                missing_images = checkpoint_store.codes_needing_image_refresh(sitemap_gtins)
                if not missing_images:
                    skipped_cached_sitemaps += 1
                    print(f"[{job.provider}] skip cached sitemap={sitemap_index}/{len(sitemap_urls)} url={sitemap_url}")
                    continue
                print(f"[{job.provider}] reprocess cached sitemap={sitemap_index}/{len(sitemap_urls)} missing_images={len(missing_images)}")
            else:
                print(f"[{job.provider}] reprocess cached sitemap={sitemap_index}/{len(sitemap_urls)} reason=missing-gtin-metadata")

        executor = ThreadPoolExecutor(max_workers=max(1, product_workers))
        cancelled = False
        captured_before = session_import.captured
        sitemap_detail_errors = 0
        sitemap_gtins: List[str] = []
        future_to_url = {
            executor.submit(fetch_product_by_url, job, product_url): product_url
            for product_url in product_urls
        }
        try:
            for index, future in enumerate(as_completed(future_to_url), start=1):
                if cancel_check and cancel_check():
                    cancelled = True
                    break
                product_url = future_to_url[future]
                try:
                    product = future.result()
                except Exception as exc:
                    detail_errors += 1
                    sitemap_detail_errors += 1
                    print(f"[{job.provider}] detail error url={product_url} error={exc}")
                    continue
                if not product:
                    skipped_missing_detail += 1
                    continue
                if not category_matches(job, product):
                    skipped_unmatched += 1
                    continue
                record = product_to_record(job, product)
                gtin = norm_gtin(record.get("code"))
                if gtin and gtin not in sitemap_gtins:
                    sitemap_gtins.append(gtin)
                try:
                    session_import.push(record)
                except RunCancelled:
                    cancelled = True
                    break
                if index % 200 == 0 or index == len(future_to_url):
                    print(
                        f"[{job.provider}] sitemap={sitemap_index}/{len(sitemap_urls)} "
                        f"products={index}/{len(future_to_url)} captured={session_import.captured}"
                    )
        finally:
            executor.shutdown(wait=not cancelled, cancel_futures=cancelled)

        if cancelled:
            totals, manifest_path = session_import.finalize(
                {
                    "source": "VTEX_SITEMAP_PRODUCT_API",
                    "sitemapsFetched": len(sitemap_urls),
                    "productsDiscovered": discovered_products,
                    "skippedMissingDetail": skipped_missing_detail,
                    "skippedCategoryMismatch": skipped_unmatched,
                    "selectedCategoryKeywords": list(job.allowed_category_keywords),
                    "selectedCategories": list(job.selected_categories),
                },
                flush_pending=False,
            )
            return {
                "status": "CANCELLED",
                "message": f"{job.name}: execucao cancelada durante a coleta detalhada.",
                "summary": [
                    {
                        "source": job.name,
                        "provider": job.provider,
                        "capturedProducts": session_import.captured,
                        "sitemapsFetched": sitemap_index,
                        "productsDiscovered": discovered_products,
                        "outputManifest": str(manifest_path),
                    }
                ],
                "scannedProducts": int(totals.get("scannedProducts", 0)),
                "importedProducts": int(totals.get("importedProducts", 0)),
                "skippedInvalidGtin": int(totals.get("skippedInvalidGtin", 0)),
                "skippedMissingName": int(totals.get("skippedMissingName", 0)),
                "skippedMedication": int(totals.get("skippedMedication", 0)),
                "skippedDuplicateGtin": int(totals.get("skippedDuplicateGtin", 0)),
                "errors": sitemap_errors + detail_errors + int(totals.get("errors", 0)),
            }

        errors_before_flush = int(session_import.totals.get("errors", 0))
        session_import.flush()
        checkpoint_store.mark(
            "VTEX_SITEMAP",
            sitemap_url,
            sitemap_hash,
            "COMPLETED" if sitemap_detail_errors == 0 and (int(session_import.totals.get("errors", 0)) - errors_before_flush) == 0 else "FAILED",
            item_count=len(product_urls),
            metadata={
                "sitemapIndex": sitemap_index,
                "productsDiscovered": len(product_urls),
                "capturedProducts": session_import.captured - captured_before,
                "skippedMissingDetail": skipped_missing_detail,
                "skippedCategoryMismatch": skipped_unmatched,
                "gtins": sitemap_gtins,
            },
            error_message="" if sitemap_detail_errors == 0 else "detail/import errors during sitemap processing",
        )

    totals, manifest_path = session_import.finalize(
        {
            "source": "VTEX_SITEMAP_PRODUCT_API",
            "sitemapsFetched": len(sitemap_urls),
            "productsDiscovered": discovered_products,
            "skippedMissingDetail": skipped_missing_detail,
            "skippedCategoryMismatch": skipped_unmatched,
            "skippedCachedSitemaps": skipped_cached_sitemaps,
            "selectedCategoryKeywords": list(job.allowed_category_keywords),
            "selectedCategories": list(job.selected_categories),
        }
    )
    total_errors = sitemap_errors + detail_errors + int(totals.get("errors", 0))
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
                "sitemapsFetched": len(sitemap_urls),
                "productsDiscovered": discovered_products,
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
