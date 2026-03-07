#!/usr/bin/env python3
from __future__ import annotations

import json
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse

import requests

from fixed_market_catalog_common import ImportOptions, MarketImportSession, canonical_url, norm_gtin, norm_text, normalize_key


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
    if not keywords:
        return True
    categories = product.get("categories") if isinstance(product, dict) else None
    normalized_categories = normalize_key(" ".join(categories)) if isinstance(categories, list) else ""
    if not normalized_categories:
        return False
    return any(keyword in normalized_categories for keyword in keywords)


def fetch_search_page(job: VtexJobConfig, start: int, end: int) -> Tuple[List[Dict[str, Any]], int]:
    response = build_session().get(
        f"{job.catalog_api_base.rstrip('/')}/api/catalog_system/pub/products/search",
        params={"_from": start, "_to": end},
        timeout=45,
    )
    response.raise_for_status()
    payload = response.json()
    return (payload if isinstance(payload, list) else []), parse_resources_total(response)


def fetch_product_by_url(job: VtexJobConfig, product_url: str) -> Optional[Dict[str, Any]]:
    path = urlparse(product_url).path or ""
    if not path:
        return None
    response = build_session().get(
        f"{job.catalog_api_base.rstrip('/')}/api/catalog_system/pub/products/search{path}",
        timeout=45,
    )
    if response.status_code != 200:
        return None
    payload = response.json()
    if not isinstance(payload, list) or not payload:
        return None
    return payload[0] if isinstance(payload[0], dict) else None


def fetch_sitemap_product_urls(sitemap_url: str) -> List[str]:
    response = build_session().get(sitemap_url, timeout=45)
    response.raise_for_status()
    root = ET.fromstring(response.text)
    namespace = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    return [
        loc.text.strip()
        for loc in root.findall(".//sm:loc", namespace)
        if loc.text and norm_text(loc.text)
    ]


def fetch_sitemap_index(job: VtexJobConfig) -> List[str]:
    response = build_session().get(job.sitemap_index_url, timeout=45)
    response.raise_for_status()
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
) -> Dict[str, Any]:
    start = 0
    pages = 0
    total_hint = 0
    page_errors = 0
    skipped_unmatched = 0
    session_import = MarketImportSession(options)

    while True:
        try:
            products, total_hint = fetch_search_page(job, start, start + page_size - 1)
        except Exception as exc:
            page_errors += 1
            print(f"[{job.provider}] page error offset={start} error={exc}")
            break

        if not products:
            break

        for product in products:
            if not category_matches(job, product):
                skipped_unmatched += 1
                continue
            record = product_to_record(job, product)
            if slug_fallback and not norm_gtin(record.get("code")):
                detail = fetch_product_by_url(job, build_source_url(job.site_base, norm_text(product.get("linkText"))))
                if detail:
                    record = product_to_record(job, detail)
            session_import.push(record)

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
            "selectedCategoryKeywords": list(job.allowed_category_keywords),
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
) -> Dict[str, Any]:
    sitemap_errors = 0
    detail_errors = 0
    skipped_unmatched = 0
    sitemap_urls = fetch_sitemap_index(job)
    session_import = MarketImportSession(options)
    discovered_products = 0

    for sitemap_index, sitemap_url in enumerate(sitemap_urls, start=1):
        try:
            product_urls = fetch_sitemap_product_urls(sitemap_url)
        except Exception as exc:
            sitemap_errors += 1
            print(f"[{job.provider}] sitemap error index={sitemap_index} url={sitemap_url} error={exc}")
            continue

        discovered_products += len(product_urls)
        with ThreadPoolExecutor(max_workers=max(1, product_workers)) as executor:
            future_to_url = {
                executor.submit(fetch_product_by_url, job, product_url): product_url
                for product_url in product_urls
            }
            for index, future in enumerate(as_completed(future_to_url), start=1):
                product_url = future_to_url[future]
                try:
                    product = future.result()
                except Exception as exc:
                    detail_errors += 1
                    print(f"[{job.provider}] detail error url={product_url} error={exc}")
                    continue
                if not product:
                    detail_errors += 1
                    continue
                if not category_matches(job, product):
                    skipped_unmatched += 1
                    continue
                session_import.push(product_to_record(job, product))
                if index % 200 == 0 or index == len(future_to_url):
                    print(
                        f"[{job.provider}] sitemap={sitemap_index}/{len(sitemap_urls)} "
                        f"products={index}/{len(future_to_url)} captured={session_import.captured}"
                    )

    totals, manifest_path = session_import.finalize(
        {
            "source": "VTEX_SITEMAP_PRODUCT_API",
            "sitemapsFetched": len(sitemap_urls),
            "productsDiscovered": discovered_products,
            "skippedCategoryMismatch": skipped_unmatched,
            "selectedCategoryKeywords": list(job.allowed_category_keywords),
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
