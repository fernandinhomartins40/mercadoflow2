#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import re
import time
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


PRODUCT_PATH_RE = re.compile(r"/produtos/(\d+)/([^/?#]+)")
STORE_ID_RE = re.compile(r'"selectedStore"\s*:\s*\{.*?"id":"?(\d+)"?', re.S)
STORE_ID_FALLBACK_RE = re.compile(r'"storeId":"?(\d+)"?')
EXTRACTION_SCHEMA_VERSION = "2026-03-08-rich-metadata-v1"


@dataclass(frozen=True)
class KochJobConfig:
    name: str
    provider: str
    source_license: str
    output: str
    site_base: str
    sitemap_url: str
    graphql_url: str
    categories_url: str
    graphql_versioning: str = "Apollo Client Frontend Production SP72"
    selected_categories: Tuple[str, ...] = ()
    default_store_id: str = ""


def build_headers(referer: str) -> Dict[str, str]:
    return {
        "User-Agent": "Mozilla/5.0 (compatible; MercadoFlowCatalogHarvester/1.0)",
        "Accept": "application/json, text/plain, */*",
        "Content-Type": "application/json",
        "Origin": "https://www.superkoch.com.br",
        "Referer": referer,
        "Versioning": "Apollo Client Frontend Production SP72",
    }


def build_html_headers() -> Dict[str, str]:
    return {
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
    }


def extract_store_id(html: str) -> str:
    for pattern in (STORE_ID_RE, STORE_ID_FALLBACK_RE):
        match = pattern.search(html or "")
        if match:
            return match.group(1)
    return ""


def fetch_default_store_id(job: KochJobConfig) -> str:
    configured_store_id = norm_text(job.default_store_id) or norm_text(os.getenv("SUPERKOCH_STORE_ID"))
    if configured_store_id:
        return configured_store_id

    candidate_urls: List[str] = []
    for candidate in (
        job.site_base,
        f"{job.site_base.rstrip('/')}/",
        job.categories_url,
        f"{job.site_base.rstrip('/')}/categorias",
    ):
        normalized = norm_text(candidate)
        if normalized and normalized not in candidate_urls:
            candidate_urls.append(normalized)

    errors: List[str] = []
    session = requests.Session()
    session.headers.update(build_html_headers())
    for url in candidate_urls:
        last_error: Optional[Exception] = None
        for attempt in range(1, 3):
            try:
                response = session.get(url, timeout=(12, 30))
                response.raise_for_status()
                store_id = extract_store_id(response.text)
                if store_id:
                    return store_id
                last_error = RuntimeError("storeId padrao nao encontrado no HTML")
            except requests.RequestException as exc:
                last_error = exc
            if attempt < 3:
                time.sleep(min(1.5 * attempt, 4.0))
        if last_error is not None:
            errors.append(f"{url}: {last_error}")

    error_suffix = " | ".join(errors) if errors else "sem detalhes adicionais"
    raise RuntimeError(
        "Super Koch: falha ao descobrir storeId padrao. "
        "Defina SUPERKOCH_STORE_ID ou use --koch-store-id/--store-id para executar sem depender do HTML. "
        f"Seeds testadas: {error_suffix}"
    )


def fetch_product_urls(job: KochJobConfig) -> List[Tuple[str, str]]:
    response = requests.get(job.sitemap_url, timeout=60, headers={"User-Agent": "Mozilla/5.0"})
    response.raise_for_status()
    root = ET.fromstring(response.text)
    namespace = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    items: List[Tuple[str, str]] = []
    seen: set[str] = set()
    for loc in root.findall(".//sm:loc", namespace):
        if not loc.text:
            continue
        url = loc.text.strip()
        match = PRODUCT_PATH_RE.search(url)
        if not match:
            continue
        product_id = match.group(1)
        if product_id in seen:
            continue
        seen.add(product_id)
        items.append((product_id, url))
    return items


def fetch_product_detail(job: KochJobConfig, store_id: str, product_id: str, source_url: str) -> Optional[Dict[str, Any]]:
    query = """
    query ProductDetailQuery($storeId: ID!, $productId: ID!) {
      publicViewer(storeId: $storeId) {
        id
        product(id: $productId, storeId: $storeId, showInactive: true) {
          id
          iid
          name
          description
          content
          saleUnit
          contentUnit
          type
          slug
          gtin
          tags
          brand {
            id
            name
          }
          image {
            id
            name
            url
            thumborized(width: 453, height: 453, fitIn: true)
            thumbLarge: thumborized(width: 1600)
            ogImage: thumborized(width: 600, fitIn: true)
          }
          imagesGallery {
            id
            name
            url
            thumborized(width: 453, height: 453, fitIn: true)
            thumbLarge: thumborized(width: 1600)
          }
          pricing(storeId: $storeId) {
            id
            promotion
            price
            promotionalPrice
            orderBumpPrice
          }
          level1Category(storeId: $storeId) {
            id
            name
            slug
          }
          level2Category(storeId: $storeId) {
            id
            name
            slug
            parent {
              id
              name
              slug
            }
          }
          level3Category(storeId: $storeId) {
            id
            name
            slug
            level2Category: parent {
              level1Category: parent {
                id
                name
                slug
              }
              id
              name
              slug
            }
          }
        }
      }
    }
    """
    response = requests.post(
        job.graphql_url,
        json={
            "query": query,
            "variables": {"storeId": store_id, "productId": product_id},
            "operationName": "ProductDetailQuery",
        },
        headers=build_headers(source_url),
        timeout=60,
    )
    response.raise_for_status()
    payload = response.json()
    return ((payload.get("data") or {}).get("publicViewer") or {}).get("product")


def pick_image_url(product: Dict[str, Any]) -> str:
    image = product.get("image")
    if isinstance(image, dict):
        for key in ("thumbLarge", "ogImage", "thumborized", "url"):
            candidate = canonical_url(image.get(key))
            if candidate:
                return candidate
    gallery = product.get("imagesGallery")
    if isinstance(gallery, list):
        for entry in gallery:
            if not isinstance(entry, dict):
                continue
            for key in ("thumbLarge", "thumborized", "url"):
                candidate = canonical_url(entry.get(key))
                if candidate:
                    return candidate
    return ""


def build_category(product: Dict[str, Any]) -> str:
    parts: List[str] = []
    level1 = product.get("level1Category")
    level2 = product.get("level2Category")
    level3 = product.get("level3Category")
    for entry in (level1, level2, level3):
        if isinstance(entry, dict):
            name = norm_text(entry.get("name"))
            if name and name not in parts:
                parts.append(name)
    if not parts and isinstance(level3, dict):
        level2_parent = level3.get("level2Category")
        if isinstance(level2_parent, dict):
            level1_parent = level2_parent.get("level1Category")
            for entry in (level1_parent, level2_parent, level3):
                if isinstance(entry, dict):
                    name = norm_text(entry.get("name"))
                    if name and name not in parts:
                        parts.append(name)
    return " > ".join(parts)[:255]


def detail_to_record(job: KochJobConfig, detail: Dict[str, Any], source_url: str) -> Dict[str, Any]:
    brand = detail.get("brand") if isinstance(detail.get("brand"), dict) else {}
    pricing = detail.get("pricing") if isinstance(detail.get("pricing"), dict) else {}
    content = norm_text(detail.get("content"))
    content_unit = norm_text(detail.get("contentUnit"))
    sale_unit = norm_text(detail.get("saleUnit"))
    package_bits = [piece for piece in (content, content_unit, sale_unit) if piece]
    gtin = norm_gtin(detail.get("gtin"))
    provider_product_id = norm_text(detail.get("id") or detail.get("iid"))
    code = gtin or provider_product_id
    gallery = detail.get("imagesGallery") if isinstance(detail.get("imagesGallery"), list) else []

    return {
        "code": code,
        "name": norm_text(detail.get("name"))[:255],
        "brand": norm_text(brand.get("name"))[:120],
        "category": build_category(detail),
        "description": plain_text(detail.get("description"))[:2048],
        "manufacturer": norm_text(brand.get("name"))[:255],
        "packageDescription": " ".join(package_bits)[:255],
        "unit": sale_unit[:32],
        "imageUrl": pick_image_url(detail),
        "imageStorageKey": "",
        "sourceUrl": canonical_url(source_url),
        "currency": "BRL",
        "price": pricing.get("promotionalPrice") or pricing.get("price"),
        "providerProductId": provider_product_id,
        "attributesJson": json.dumps(
            {
                "schemaVersion": EXTRACTION_SCHEMA_VERSION,
                "iid": detail.get("iid"),
                "saleUnit": detail.get("saleUnit"),
                "content": detail.get("content"),
                "contentUnit": detail.get("contentUnit"),
                "type": detail.get("type"),
                "tags": detail.get("tags") or [],
                "pricing": pricing,
                "imageGalleryUrls": [
                    canonical_url(entry.get("thumbLarge") or entry.get("thumborized") or entry.get("url"))
                    for entry in gallery
                    if isinstance(entry, dict) and canonical_url(entry.get("thumbLarge") or entry.get("thumborized") or entry.get("url"))
                ],
                "categorySlugs": {
                    "level1": (detail.get("level1Category") or {}).get("slug") if isinstance(detail.get("level1Category"), dict) else "",
                    "level2": (detail.get("level2Category") or {}).get("slug") if isinstance(detail.get("level2Category"), dict) else "",
                    "level3": (detail.get("level3Category") or {}).get("slug") if isinstance(detail.get("level3Category"), dict) else "",
                },
            },
            ensure_ascii=False,
        ),
        "rawPayload": detail,
    }


def category_matches(job: KochJobConfig, detail: Dict[str, Any]) -> bool:
    selected = [normalize_key(value) for value in job.selected_categories if normalize_key(value)]
    if not selected:
        return True
    normalized_category = normalize_key(build_category(detail))
    if not normalized_category:
        return False
    return any(category in normalized_category for category in selected)


def run_koch_catalog_job(
    job: KochJobConfig,
    options: ImportOptions,
    product_workers: int = 12,
    max_products: int = 0,
    cancel_check: Optional[Callable[[], bool]] = None,
) -> Dict[str, Any]:
    store_id = fetch_default_store_id(job)
    discovered = fetch_product_urls(job)
    if max_products and max_products > 0:
        discovered = discovered[:max_products]

    detail_errors = 0
    skipped_unmatched = 0
    skipped_cached_batches = 0
    session_import = MarketImportSession(options, cancel_check=cancel_check)
    checkpoint_store = RemoteCheckpointStore(options)
    completed_batches = checkpoint_store.list_completed("KOCH_BATCH")
    cancelled = False
    batch_size = 200

    for batch_index, batch_start in enumerate(range(0, len(discovered), batch_size), start=1):
        if cancel_check and cancel_check():
            cancelled = True
            break
        batch = discovered[batch_start:batch_start + batch_size]
        batch_key = f"batch:{batch_index}"
        batch_hash = stable_hash({"schemaVersion": EXTRACTION_SCHEMA_VERSION, "batch": batch})
        cached_batch = completed_batches.get(batch_key)
        if cached_batch and norm_text(cached_batch.get("scopeHash")) == batch_hash:
            metadata = cached_batch.get("metadata") or {}
            cached_gtins = metadata.get("gtins") if isinstance(metadata, dict) else []
            if not isinstance(cached_gtins, list):
                cached_gtins = []
            # Checkpoint com hash igual ja foi importado: sem lista de gtins ainda
            # e valido para pular, senao todo checkpoint legado era reprocessado.
            missing_images = (
                checkpoint_store.codes_needing_image_refresh(cached_gtins) if cached_gtins else set()
            )
            if not missing_images:
                skipped_cached_batches += 1
                print(f"[{job.provider}] skip cached batch={batch_index} size={len(batch)}")
                continue
            print(f"[{job.provider}] reprocess batch={batch_index} missing_images={len(missing_images)}")

        batch_errors = 0
        batch_captured_before = session_import.captured
        batch_gtins: List[str] = []
        executor = ThreadPoolExecutor(max_workers=max(1, product_workers))
        future_to_item = {
            executor.submit(fetch_product_detail, job, store_id, product_id, source_url): (product_id, source_url)
            for product_id, source_url in batch
        }

        try:
            for index, future in enumerate(as_completed(future_to_item), start=1):
                if cancel_check and cancel_check():
                    cancelled = True
                    break
                product_id, source_url = future_to_item[future]
                try:
                    detail = future.result()
                except Exception as exc:
                    detail_errors += 1
                    batch_errors += 1
                    print(f"[{job.provider}] detail error product_id={product_id} error={exc}")
                    continue
                if not isinstance(detail, dict):
                    detail_errors += 1
                    batch_errors += 1
                    continue
                if not category_matches(job, detail):
                    skipped_unmatched += 1
                    continue
                gtin = norm_gtin(detail.get("gtin"))
                if gtin and gtin not in batch_gtins:
                    batch_gtins.append(gtin)
                try:
                    session_import.push(detail_to_record(job, detail, source_url))
                except RunCancelled:
                    cancelled = True
                    break
                if index % 100 == 0 or index == len(future_to_item):
                    print(
                        f"[{job.provider}] batch={batch_index} products={index}/{len(future_to_item)} "
                        f"captured={session_import.captured} store_id={store_id}"
                    )
        finally:
            executor.shutdown(wait=not cancelled, cancel_futures=cancelled)

        if cancelled:
            break

        errors_before_flush = int(session_import.totals.get("errors", 0))
        session_import.flush()
        checkpoint_store.mark(
            "KOCH_BATCH",
            batch_key,
            batch_hash,
            "COMPLETED" if batch_errors == 0 and (int(session_import.totals.get("errors", 0)) - errors_before_flush) == 0 else "FAILED",
            item_count=len(batch),
            metadata={
                "batchIndex": batch_index,
                "productsDiscovered": len(batch),
                "capturedProducts": session_import.captured - batch_captured_before,
                "gtins": batch_gtins,
            },
            error_message="" if batch_errors == 0 else "detail errors during batch processing",
        )

    totals, manifest_path = session_import.finalize(
        {
            "source": "SUPERKOCH_SITEMAP_GRAPHQL",
            "productsDiscovered": len(discovered),
            "storeId": store_id,
            "sitemapUrl": job.sitemap_url,
            "selectedCategories": list(job.selected_categories),
            "skippedCategoryMismatch": skipped_unmatched,
            "skippedCachedBatches": skipped_cached_batches,
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
                    "productsDiscovered": len(discovered),
                    "outputManifest": str(manifest_path),
                }
            ],
            "scannedProducts": int(totals.get("scannedProducts", 0)),
            "importedProducts": int(totals.get("importedProducts", 0)),
            "skippedInvalidGtin": int(totals.get("skippedInvalidGtin", 0)),
            "skippedMissingName": int(totals.get("skippedMissingName", 0)),
            "skippedMedication": int(totals.get("skippedMedication", 0)),
            "skippedDuplicateGtin": int(totals.get("skippedDuplicateGtin", 0)),
            "errors": detail_errors + int(totals.get("errors", 0)),
        }

    total_errors = detail_errors + int(totals.get("errors", 0))
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
                "productsDiscovered": len(discovered),
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
