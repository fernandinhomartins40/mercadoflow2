#!/usr/bin/env python3
from __future__ import annotations

import html
import json
import re
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional, Tuple

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
    stable_hash,
)

LD_JSON_RE = re.compile(r'<script type="application/ld\+json">(.*?)</script>', re.S | re.I)
META_OG_IMAGE_RE = re.compile(r'<meta\s+property="og:image"\s+content="([^"]+)"', re.I)
PRODUCT_SITEMAP_RE = re.compile(r"/sitemaps/produtos-(\d+)\.xml$")
EXTRACTION_SCHEMA_VERSION = "2026-03-08-nissei-sitemap-html-v1"


@dataclass(frozen=True)
class NisseiJobConfig:
    name: str
    provider: str
    source_license: str
    output: str
    site_base: str
    sitemap_index_url: str
    categories_sitemap_url: str
    selected_categories: Tuple[str, ...] = ()


def fetch_sitemap_index(job: NisseiJobConfig) -> List[str]:
    response = requests.get(job.sitemap_index_url, timeout=45, headers={"User-Agent": "Mozilla/5.0"})
    response.raise_for_status()
    root = ET.fromstring(response.text)
    namespace = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    urls = []
    for loc in root.findall(".//sm:loc", namespace):
        if not loc.text:
            continue
        url = loc.text.strip()
        if PRODUCT_SITEMAP_RE.search(url):
            urls.append(url)

    def sort_key(value: str) -> int:
        match = PRODUCT_SITEMAP_RE.search(value)
        return int(match.group(1)) if match else 0

    return sorted(urls, key=sort_key)


def fetch_sitemap_product_urls(sitemap_url: str) -> List[str]:
    response = requests.get(sitemap_url, timeout=60, headers={"User-Agent": "Mozilla/5.0"})
    response.raise_for_status()
    root = ET.fromstring(response.text)
    namespace = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    return [
        loc.text.strip()
        for loc in root.findall(".//sm:loc", namespace)
        if loc.text and norm_text(loc.text)
    ]


def parse_ld_json_blocks(text: str) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    for match in LD_JSON_RE.finditer(text):
        payload = match.group(1).strip()
        if not payload:
            continue
        sanitized = payload.replace("\r", "").replace("\n", "")
        try:
            items.append(json.loads(sanitized))
        except Exception:
            continue
    return items


def build_category(breadcrumb: Dict[str, Any]) -> str:
    elements = breadcrumb.get("itemListElement") if isinstance(breadcrumb.get("itemListElement"), list) else []
    names: List[str] = []
    for entry in elements:
        if not isinstance(entry, dict):
            continue
        name = norm_text(entry.get("name"))
        if not name or normalize_key(name) == "pagina inicial":
            continue
        names.append(name)
    if len(names) > 1:
        names = names[:-1]
    return " > ".join(names)[:255]


def category_matches(job: NisseiJobConfig, category: str) -> bool:
    selected = [normalize_key(value) for value in job.selected_categories if normalize_key(value)]
    if not selected:
        return True
    normalized_category = normalize_key(category)
    if not normalized_category:
        return False
    return any(value in normalized_category for value in selected)


def fetch_product_detail(job: NisseiJobConfig, product_url: str) -> Optional[Dict[str, Any]]:
    response = requests.get(product_url, timeout=45, headers={"User-Agent": "Mozilla/5.0"})
    if response.status_code in {404, 410}:
        return None
    response.raise_for_status()
    text = response.text
    scripts = parse_ld_json_blocks(text)
    product = next((item for item in scripts if isinstance(item, dict) and item.get("@type") == "Product"), None)
    breadcrumb = next((item for item in scripts if isinstance(item, dict) and item.get("@type") == "BreadcrumbList"), None)
    if not isinstance(product, dict):
        return None
    image_match = META_OG_IMAGE_RE.search(text)
    image_url = canonical_url(image_match.group(1)) if image_match else ""
    category = build_category(breadcrumb or {})
    return {
        "product": product,
        "breadcrumb": breadcrumb or {},
        "category": category,
        "imageUrl": image_url,
        "sourceUrl": canonical_url(product_url),
    }


def detail_to_record(job: NisseiJobConfig, detail: Dict[str, Any]) -> Dict[str, Any]:
    product = detail.get("product") if isinstance(detail.get("product"), dict) else {}
    brand = product.get("brand") if isinstance(product.get("brand"), dict) else {}
    offers = product.get("offers") if isinstance(product.get("offers"), dict) else {}
    provider_product_id = norm_text(product.get("sku"))
    gtin = norm_gtin(product.get("gtin"))
    code = gtin or provider_product_id

    return {
        "code": code,
        "name": norm_text(product.get("name"))[:255],
        "brand": norm_text(brand.get("name"))[:120],
        "category": norm_text(detail.get("category"))[:255],
        "description": plain_text(html.unescape(str(product.get("description") or "")))[:2048],
        "manufacturer": norm_text(brand.get("name"))[:255],
        "packageDescription": "",
        "unit": "",
        "imageUrl": canonical_url(detail.get("imageUrl")),
        "imageStorageKey": "",
        "sourceUrl": canonical_url(detail.get("sourceUrl")),
        "currency": norm_text(offers.get("priceCurrency") or "BRL")[:16] or "BRL",
        "price": offers.get("price"),
        "providerProductId": provider_product_id,
        "attributesJson": json.dumps(
            {
                "schemaVersion": EXTRACTION_SCHEMA_VERSION,
                "brandUrl": brand.get("url"),
                "breadcrumb": detail.get("breadcrumb") or {},
                "gtin": product.get("gtin"),
            },
            ensure_ascii=False,
        ),
        "rawPayload": detail,
    }


def run_nissei_catalog_job(
    job: NisseiJobConfig,
    options: ImportOptions,
    product_workers: int = 12,
    max_products: int = 0,
    cancel_check: Optional[Callable[[], bool]] = None,
) -> Dict[str, Any]:
    sitemap_urls = fetch_sitemap_index(job)
    session_import = MarketImportSession(options, cancel_check=cancel_check)
    checkpoint_store = RemoteCheckpointStore(options)
    completed_sitemaps = checkpoint_store.list_completed("NISSEI_SITEMAP")
    sitemap_errors = 0
    detail_errors = 0
    skipped_unmatched = 0
    skipped_cached_sitemaps = 0
    products_discovered = 0
    cancelled = False

    for sitemap_index, sitemap_url in enumerate(sitemap_urls, start=1):
        if cancel_check and cancel_check():
            cancelled = True
            break
        try:
            product_urls = fetch_sitemap_product_urls(sitemap_url)
        except Exception as exc:
            sitemap_errors += 1
            checkpoint_store.mark("NISSEI_SITEMAP", sitemap_url, "", "FAILED", error_message=str(exc))
            print(f"[{job.provider}] sitemap error index={sitemap_index} url={sitemap_url} error={exc}")
            continue

        if max_products and max_products > 0:
            remaining = max(0, max_products - products_discovered)
            product_urls = product_urls[:remaining]
        products_discovered += len(product_urls)
        if not product_urls:
            if max_products and products_discovered >= max_products:
                break
            continue

        sitemap_hash = stable_hash({"schemaVersion": EXTRACTION_SCHEMA_VERSION, "productUrls": product_urls})
        cached_sitemap = completed_sitemaps.get(sitemap_url)
        if cached_sitemap and norm_text(cached_sitemap.get("scopeHash")) == sitemap_hash:
            metadata = cached_sitemap.get("metadata") or {}
            sitemap_gtins = metadata.get("gtins") if isinstance(metadata, dict) else []
            if isinstance(sitemap_gtins, list) and sitemap_gtins:
                missing_images = checkpoint_store.codes_needing_image_refresh(sitemap_gtins)
                if not missing_images:
                    skipped_cached_sitemaps += 1
                    print(f"[{job.provider}] skip cached sitemap={sitemap_index}/{len(sitemap_urls)} url={sitemap_url}")
                    if max_products and products_discovered >= max_products:
                        break
                    continue
                print(f"[{job.provider}] reprocess sitemap={sitemap_index}/{len(sitemap_urls)} missing_images={len(missing_images)}")

        cancelled_sitemap = False
        sitemap_detail_errors = 0
        sitemap_gtins: List[str] = []
        captured_before = session_import.captured
        executor = ThreadPoolExecutor(max_workers=max(1, product_workers))
        future_to_url = {executor.submit(fetch_product_detail, job, product_url): product_url for product_url in product_urls}
        try:
            for index, future in enumerate(as_completed(future_to_url), start=1):
                if cancel_check and cancel_check():
                    cancelled = True
                    cancelled_sitemap = True
                    break
                product_url = future_to_url[future]
                try:
                    detail = future.result()
                except Exception as exc:
                    detail_errors += 1
                    sitemap_detail_errors += 1
                    print(f"[{job.provider}] detail error url={product_url} error={exc}")
                    continue
                if not isinstance(detail, dict):
                    detail_errors += 1
                    sitemap_detail_errors += 1
                    continue
                category = norm_text(detail.get("category"))
                if not category_matches(job, category):
                    skipped_unmatched += 1
                    continue
                gtin = norm_gtin(((detail.get("product") or {}).get("gtin")))
                if gtin and gtin not in sitemap_gtins:
                    sitemap_gtins.append(gtin)
                try:
                    session_import.push(detail_to_record(job, detail))
                except RunCancelled:
                    cancelled = True
                    cancelled_sitemap = True
                    break
                if index % 200 == 0 or index == len(future_to_url):
                    print(
                        f"[{job.provider}] sitemap={sitemap_index}/{len(sitemap_urls)} "
                        f"products={index}/{len(future_to_url)} captured={session_import.captured}"
                    )
        finally:
            executor.shutdown(wait=not cancelled_sitemap, cancel_futures=cancelled_sitemap)

        if cancelled_sitemap:
            break

        errors_before_flush = int(session_import.totals.get("errors", 0))
        session_import.flush()
        checkpoint_store.mark(
            "NISSEI_SITEMAP",
            sitemap_url,
            sitemap_hash,
            "COMPLETED" if sitemap_detail_errors == 0 and (int(session_import.totals.get("errors", 0)) - errors_before_flush) == 0 else "FAILED",
            item_count=len(product_urls),
            metadata={
                "sitemapIndex": sitemap_index,
                "productsDiscovered": len(product_urls),
                "capturedProducts": session_import.captured - captured_before,
                "gtins": sitemap_gtins,
            },
            error_message="" if sitemap_detail_errors == 0 else "detail/import errors during sitemap processing",
        )

        if max_products and products_discovered >= max_products:
            break

    totals, manifest_path = session_import.finalize(
        {
            "source": "NISSEI_SITEMAP_HTML",
            "sitemapsFetched": len(sitemap_urls),
            "productsDiscovered": products_discovered,
            "selectedCategories": list(job.selected_categories),
            "skippedCategoryMismatch": skipped_unmatched,
            "skippedCachedSitemaps": skipped_cached_sitemaps,
        },
        flush_pending=not cancelled,
    )

    if cancelled:
        return {
            "status": "CANCELLED",
            "message": f"{job.name}: execucao cancelada durante a coleta detalhada.",
            "summary": [
                {
                    "source": job.name,
                    "provider": job.provider,
                    "capturedProducts": session_import.captured,
                    "productsDiscovered": products_discovered,
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

    total_errors = sitemap_errors + detail_errors + int(totals.get("errors", 0))
    return {
        "status": "SUCCESS" if total_errors == 0 else "FAILED",
        "message": (
            f"{job.name}: capturados={session_import.captured} "
            f"importados={totals.get('importedProducts', 0)} erros={total_errors}"
        ),
        "summary": [
            {
                "source": job.name,
                "provider": job.provider,
                "capturedProducts": session_import.captured,
                "productsDiscovered": products_discovered,
                "outputManifest": str(manifest_path),
            }
        ],
        "scannedProducts": int(totals.get("scannedProducts", 0)),
        "importedProducts": int(totals.get("importedProducts", 0)),
        "skippedInvalidGtin": int(totals.get("skippedInvalidGtin", 0)),
        "skippedMissingName": int(totals.get("skippedMissingName", 0)),
        "skippedMedication": int(totals.get("skippedMedication", 0)),
        "skippedDuplicateGtin": int(totals.get("skippedDuplicateGtin", 0)),
        "errors": total_errors,
    }
