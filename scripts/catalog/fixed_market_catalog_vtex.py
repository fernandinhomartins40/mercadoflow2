#!/usr/bin/env python3
from __future__ import annotations

import json
import time
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple
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
    category_tree_url: str = ""
    allowed_category_keywords: Tuple[str, ...] = ()
    selected_categories: Tuple[str, ...] = ()


@dataclass(frozen=True)
class VtexCategoryLeaf:
    ids: Tuple[str, ...]
    names: Tuple[str, ...]
    fq: str
    label: str
    url: str


@dataclass(frozen=True)
class VtexBrandFacet:
    name: str
    quantity: int


@dataclass(frozen=True)
class VtexSearchPartition:
    key: str
    label: str
    fqs: Tuple[str, ...]
    total_hint: int
    leaf_label: str
    leaf_fq: str
    leaf_ids: Tuple[str, ...]
    kind: str


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


def normalize_fqs(value: Sequence[str] | str | None) -> Tuple[str, ...]:
    if value is None:
        return ()
    if isinstance(value, str):
        normalized = norm_text(value)
        return (normalized,) if normalized else ()
    items = [norm_text(item) for item in value if norm_text(item)]
    return tuple(items)


def fetch_search_page(
    job: VtexJobConfig,
    start: int,
    end: int,
    fqs: Sequence[str] | str | None = None,
    ft: str = "",
) -> Tuple[List[Dict[str, Any]], int]:
    normalized_fqs = normalize_fqs(fqs)
    last_error: Optional[Exception] = None
    for attempt in range(1, 4):
        try:
            params: List[Tuple[str, Any]] = [("_from", start), ("_to", end)]
            if norm_text(ft):
                params.append(("ft", norm_text(ft)))
            for fq in normalized_fqs:
                params.append(("fq", fq))
            response = build_session().get(
                f"{job.catalog_api_base.rstrip('/')}/api/catalog_system/pub/products/search",
                params=params,
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


def fetch_facets(job: VtexJobConfig, fqs: Sequence[str] | str | None = None) -> Dict[str, Any]:
    normalized_fqs = normalize_fqs(fqs)
    last_error: Optional[Exception] = None
    for attempt in range(1, 4):
        try:
            params: List[Tuple[str, Any]] = []
            for fq in normalized_fqs:
                params.append(("fq", fq))
            response = build_session().get(
                f"{job.catalog_api_base.rstrip('/')}/api/catalog_system/pub/facets/search",
                params=params,
                timeout=45,
            )
            response.raise_for_status()
            payload = response.json()
            return payload if isinstance(payload, dict) else {}
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
    raise RuntimeError("facets request failed without explicit error")


def extract_brand_facets(payload: Dict[str, Any]) -> List[VtexBrandFacet]:
    raw_items = payload.get("Brands") if isinstance(payload, dict) else None
    if not isinstance(raw_items, list):
        return []
    brands: List[VtexBrandFacet] = []
    for item in raw_items:
        if not isinstance(item, dict):
            continue
        name = norm_text(item.get("Name") or item.get("Value"))
        quantity = item.get("Quantity")
        try:
            safe_quantity = int(quantity)
        except Exception:
            safe_quantity = 0
        if not name or safe_quantity <= 0:
            continue
        brands.append(VtexBrandFacet(name=name, quantity=safe_quantity))
    return sorted(brands, key=lambda item: item.quantity, reverse=True)


def resolve_brand_id(
    job: VtexJobConfig,
    category_fq: str,
    brand_name: str,
    brand_id_cache: Dict[Tuple[str, str], Optional[int]],
) -> Optional[int]:
    normalized_brand = normalize_key(brand_name)
    cache_key = (category_fq, normalized_brand)
    if cache_key in brand_id_cache:
        return brand_id_cache[cache_key]

    products, _ = fetch_search_page(job, 0, 49, fqs=(category_fq,), ft=brand_name)
    matches: Dict[int, int] = {}
    for product in products:
        product_brand = normalize_key(product.get("brand"))
        brand_id = product.get("brandId")
        try:
            safe_brand_id = int(brand_id)
        except Exception:
            safe_brand_id = 0
        if safe_brand_id <= 0 or product_brand != normalized_brand:
            continue
        matches[safe_brand_id] = matches.get(safe_brand_id, 0) + 1

    resolved: Optional[int] = None
    if len(matches) == 1:
        resolved = next(iter(matches.keys()))
    elif matches:
        ordered = sorted(matches.items(), key=lambda item: item[1], reverse=True)
        if len(ordered) == 1 or ordered[0][1] > ordered[1][1]:
            resolved = ordered[0][0]

    brand_id_cache[cache_key] = resolved
    return resolved


def build_leaf_partitions(
    job: VtexJobConfig,
    leaf: VtexCategoryLeaf,
    brand_id_cache: Dict[Tuple[str, str], Optional[int]],
) -> List[VtexSearchPartition]:
    _, total_hint = fetch_search_page(job, 0, 0, fqs=(leaf.fq,))
    if total_hint <= 2500:
        return [
            VtexSearchPartition(
                key=leaf.fq,
                label=leaf.label,
                fqs=(leaf.fq,),
                total_hint=total_hint,
                leaf_label=leaf.label,
                leaf_fq=leaf.fq,
                leaf_ids=leaf.ids,
                kind="LEAF",
            )
        ]

    facets = fetch_facets(job, (leaf.fq,))
    brand_facets = extract_brand_facets(facets)
    partitions: List[VtexSearchPartition] = []
    covered_total = 0
    resolved_brand_ids: Dict[str, Optional[int]] = {}
    with ThreadPoolExecutor(max_workers=max(1, min(12, len(brand_facets) or 1))) as executor:
        future_to_facet = {
            executor.submit(resolve_brand_id, job, leaf.fq, facet.name, brand_id_cache): facet
            for facet in brand_facets
        }
        for future in as_completed(future_to_facet):
            facet = future_to_facet[future]
            try:
                resolved_brand_ids[facet.name] = future.result()
            except Exception:
                resolved_brand_ids[facet.name] = None

    for facet in brand_facets:
        brand_id = resolved_brand_ids.get(facet.name)
        if brand_id is None:
            continue
        partition_fqs = (leaf.fq, f"B:{brand_id}")
        partitions.append(
            VtexSearchPartition(
                key="|".join(partition_fqs),
                label=f"{leaf.label} | Marca {facet.name}",
                fqs=partition_fqs,
                total_hint=facet.quantity,
                leaf_label=leaf.label,
                leaf_fq=leaf.fq,
                leaf_ids=leaf.ids,
                kind="BRAND",
            )
        )
        covered_total += max(facet.quantity, 0)

    if not partitions:
        return [
            VtexSearchPartition(
                key=leaf.fq,
                label=leaf.label,
                fqs=(leaf.fq,),
                total_hint=total_hint,
                leaf_label=leaf.label,
                leaf_fq=leaf.fq,
                leaf_ids=leaf.ids,
                kind="UNSPLITTABLE_LEAF",
            )
        ]

    if covered_total < total_hint:
        partitions.append(
            VtexSearchPartition(
                key=leaf.fq,
                label=f"{leaf.label} | Folha completa",
                fqs=(leaf.fq,),
                total_hint=total_hint,
                leaf_label=leaf.label,
                leaf_fq=leaf.fq,
                leaf_ids=leaf.ids,
                kind="UNRESOLVED_LEAF",
            )
        )

    return partitions


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


def fetch_category_tree(job: VtexJobConfig) -> List[Dict[str, Any]]:
    if not norm_text(job.category_tree_url):
        return []
    last_error: Optional[Exception] = None
    response: Optional[requests.Response] = None
    for attempt in range(1, 4):
        try:
            response = build_session().get(job.category_tree_url, timeout=45)
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
        raise RuntimeError("category tree request failed without response")
    payload = response.json()
    return payload if isinstance(payload, list) else []


def iter_category_leaves(tree: List[Dict[str, Any]]) -> List[VtexCategoryLeaf]:
    leaves: List[VtexCategoryLeaf] = []

    def walk(node: Dict[str, Any], ids: List[str], names: List[str]) -> None:
        node_id = norm_text(node.get("id"))
        node_name = norm_text(node.get("name"))
        if not node_id or not node_name:
            return
        next_ids = ids + [node_id]
        next_names = names + [node_name]
        children = node.get("children") or []
        valid_children = [child for child in children if isinstance(child, dict)]
        if valid_children:
            for child in valid_children:
                walk(child, next_ids, next_names)
            return
        leaves.append(
            VtexCategoryLeaf(
                ids=tuple(next_ids),
                names=tuple(next_names),
                fq="C:/" + "/".join(next_ids) + "/",
                label=" > ".join(next_names),
                url=norm_text(node.get("url")),
            )
        )

    for node in tree:
        if isinstance(node, dict):
            walk(node, [], [])
    return leaves


def leaf_matches(job: VtexJobConfig, leaf: VtexCategoryLeaf) -> bool:
    normalized_leaf = normalize_key(leaf.label)
    if not normalized_leaf:
        return False
    keywords = [normalize_key(value) for value in job.allowed_category_keywords if normalize_key(value)]
    if keywords and not any(keyword in normalized_leaf for keyword in keywords):
        return False
    selected = [normalize_key(value) for value in job.selected_categories if normalize_key(value)]
    if not selected:
        return True
    return any(category in normalized_leaf for category in selected)


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


def run_vtex_category_tree_job(
    job: VtexJobConfig,
    options: ImportOptions,
    page_size: int = 50,
    max_pages_per_leaf: int = 0,
    slug_fallback: bool = True,
    cancel_check: Optional[Callable[[], bool]] = None,
) -> Dict[str, Any]:
    page_errors = 0
    detail_errors = 0
    skipped_unmatched = 0
    skipped_overflow_pages = 0
    skipped_cached_pages = 0
    leaves_discovered = 0
    partitions_built = 0
    brand_partitions = 0
    pages_fetched = 0
    products_discovered = 0
    session_import = MarketImportSession(options, cancel_check=cancel_check)
    checkpoint_store = RemoteCheckpointStore(options)
    completed_pages = checkpoint_store.list_completed("VTEX_CATEGORY_PAGE")
    brand_id_cache: Dict[Tuple[str, str], Optional[int]] = {}

    category_tree = fetch_category_tree(job)
    category_leaves = iter_category_leaves(category_tree)
    leaves_discovered = len(category_leaves)
    selected_leaves = [leaf for leaf in category_leaves if leaf_matches(job, leaf)]
    skipped_unmatched = max(0, leaves_discovered - len(selected_leaves))

    for leaf_index, leaf in enumerate(selected_leaves, start=1):
        start = 0
        leaf_pages = 0
        total_hint = 0
        while True:
            if cancel_check and cancel_check():
                totals, manifest_path = session_import.finalize(
                    {
                        "source": "VTEX_CATEGORY_TREE_SEARCH_API",
                        "categoryLeavesDiscovered": leaves_discovered,
                        "categoryLeavesSelected": len(selected_leaves),
                        "partitionsBuilt": partitions_built,
                        "brandPartitionsBuilt": brand_partitions,
                        "pagesFetched": pages_fetched,
                        "productsDiscovered": products_discovered,
                        "skippedCategoryLeaves": skipped_unmatched,
                        "skippedOverflowPages": skipped_overflow_pages,
                        "selectedCategoryKeywords": list(job.allowed_category_keywords),
                        "selectedCategories": list(job.selected_categories),
                    },
                    flush_pending=False,
                )
                return {
                    "status": "CANCELLED",
                    "message": f"{job.name}: execucao cancelada durante a leitura por categoria.",
                    "summary": [
                        {
                            "source": job.name,
                            "provider": job.provider,
                            "capturedProducts": session_import.captured,
                            "categoryLeavesSelected": len(selected_leaves),
                            "partitionsBuilt": partitions_built,
                            "pagesFetched": pages_fetched,
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
                    "errors": page_errors + detail_errors + int(totals.get("errors", 0)),
                }

            try:
                partitions = build_leaf_partitions(job, leaf, brand_id_cache)
            except Exception as exc:
                page_errors += 1
                print(f"[{job.provider}] partition build error leaf={leaf.label} error={exc}")
                break

            partitions_built += len(partitions)
            brand_partitions += sum(1 for partition in partitions if partition.kind == "BRAND")

            for partition_index, partition in enumerate(partitions, start=1):
                if partition.total_hint > 2500:
                    skipped_overflow_pages += 1
                    print(
                        f"[{job.provider}] skip unsplittable partition leaf={leaf.label} "
                        f"partition={partition.label[:80]} total_hint={partition.total_hint}"
                    )
                    continue

                start = 0
                leaf_pages = 0
                total_hint = partition.total_hint
                while True:
                    if cancel_check and cancel_check():
                        totals, manifest_path = session_import.finalize(
                            {
                                "source": "VTEX_CATEGORY_TREE_SEARCH_API",
                                "categoryLeavesDiscovered": leaves_discovered,
                                "categoryLeavesSelected": len(selected_leaves),
                                "partitionsBuilt": partitions_built,
                                "brandPartitionsBuilt": brand_partitions,
                                "pagesFetched": pages_fetched,
                                "productsDiscovered": products_discovered,
                                "skippedCategoryLeaves": skipped_unmatched,
                                "skippedOverflowPages": skipped_overflow_pages,
                                "selectedCategoryKeywords": list(job.allowed_category_keywords),
                                "selectedCategories": list(job.selected_categories),
                            },
                            flush_pending=False,
                        )
                        return {
                            "status": "CANCELLED",
                            "message": f"{job.name}: execucao cancelada durante a coleta por categoria.",
                            "summary": [
                                {
                                    "source": job.name,
                                    "provider": job.provider,
                                    "capturedProducts": session_import.captured,
                                    "categoryLeavesSelected": len(selected_leaves),
                                    "partitionsBuilt": partitions_built,
                                    "pagesFetched": pages_fetched,
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
                            "errors": page_errors + detail_errors + int(totals.get("errors", 0)),
                        }

                    end = start + page_size - 1
                    if end >= 2500:
                        skipped_overflow_pages += 1
                        print(
                            f"[{job.provider}] skip overflow partition leaf={leaf.label} "
                            f"partition={partition.label[:80]} offset={start}-{end} total_hint={total_hint or 'n/a'}"
                        )
                        break
                    try:
                        products, total_hint = fetch_search_page(job, start, end, fqs=partition.fqs)
                    except Exception as exc:
                        page_errors += 1
                        checkpoint_store.mark(
                            "VTEX_CATEGORY_PAGE",
                            f"{partition.key}|{start}-{end}",
                            "",
                            "FAILED",
                            error_message=str(exc),
                            metadata={
                                "leafLabel": partition.leaf_label,
                                "leafFq": partition.leaf_fq,
                                "leafIds": list(partition.leaf_ids),
                                "partitionLabel": partition.label,
                                "partitionFqs": list(partition.fqs),
                                "partitionKind": partition.kind,
                            },
                        )
                        print(
                            f"[{job.provider}] category page error leaf={leaf.label} "
                            f"partition={partition.label[:80]} offset={start} error={exc}"
                        )
                        break

                    if total_hint:
                        products_discovered += max(0, min(len(products), max(total_hint - start, 0)))
                    if not products:
                        break

                    page_key = f"{partition.key}|{start}-{end}"
                    page_hash = stable_hash([norm_text(product.get('productId') or product.get('linkText')) for product in products])
                    cached_page = completed_pages.get(page_key)
                    if cached_page and norm_text(cached_page.get("scopeHash")) == page_hash:
                        metadata = cached_page.get("metadata") or {}
                        page_gtins = metadata.get("gtins") if isinstance(metadata, dict) else []
                        if isinstance(page_gtins, list) and page_gtins:
                            missing_images = checkpoint_store.codes_needing_image_refresh(page_gtins)
                            if not missing_images:
                                skipped_cached_pages += 1
                                leaf_pages += 1
                                pages_fetched += 1
                                start += page_size
                                if max_pages_per_leaf and leaf_pages >= max_pages_per_leaf:
                                    break
                                if total_hint and start >= total_hint:
                                    break
                                continue

                    page_detail_errors = 0
                    page_gtins: List[str] = []
                    for product in products:
                        record = product_to_record(job, product)
                        if slug_fallback and not norm_gtin(record.get("code")):
                            try:
                                detail = fetch_product_by_url(job, build_source_url(job.site_base, norm_text(product.get("linkText"))))
                            except Exception as exc:
                                page_detail_errors += 1
                                detail_errors += 1
                                print(
                                    f"[{job.provider}] detail fallback error leaf={leaf.label} "
                                    f"partition={partition.label[:80]} offset={start} error={exc}"
                                )
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
                                    "source": "VTEX_CATEGORY_TREE_SEARCH_API",
                                    "categoryLeavesDiscovered": leaves_discovered,
                                    "categoryLeavesSelected": len(selected_leaves),
                                    "partitionsBuilt": partitions_built,
                                    "brandPartitionsBuilt": brand_partitions,
                                    "pagesFetched": pages_fetched,
                                    "productsDiscovered": products_discovered,
                                    "skippedCategoryLeaves": skipped_unmatched,
                                    "skippedOverflowPages": skipped_overflow_pages,
                                    "selectedCategoryKeywords": list(job.allowed_category_keywords),
                                    "selectedCategories": list(job.selected_categories),
                                },
                                flush_pending=False,
                            )
                            return {
                                "status": "CANCELLED",
                                "message": f"{job.name}: execucao cancelada durante a coleta por categoria.",
                                "summary": [
                                    {
                                        "source": job.name,
                                        "provider": job.provider,
                                        "capturedProducts": session_import.captured,
                                        "categoryLeavesSelected": len(selected_leaves),
                                        "partitionsBuilt": partitions_built,
                                        "pagesFetched": pages_fetched,
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
                                "errors": page_errors + detail_errors + int(totals.get("errors", 0)),
                            }

                    errors_before_flush = int(session_import.totals.get("errors", 0))
                    session_import.flush()
                    import_errors = int(session_import.totals.get("errors", 0)) - errors_before_flush
                    checkpoint_status = "COMPLETED" if page_detail_errors == 0 and import_errors == 0 else "FAILED"
                    checkpoint_store.mark(
                        "VTEX_CATEGORY_PAGE",
                        page_key,
                        page_hash,
                        checkpoint_status,
                        item_count=len(products),
                        metadata={
                            "leafLabel": partition.leaf_label,
                            "leafFq": partition.leaf_fq,
                            "leafIds": list(partition.leaf_ids),
                            "partitionLabel": partition.label,
                            "partitionFqs": list(partition.fqs),
                            "partitionKind": partition.kind,
                            "page": leaf_pages + 1,
                            "offsetStart": start,
                            "offsetEnd": end,
                            "totalHint": total_hint,
                            "provider": job.provider,
                            "gtins": page_gtins,
                        },
                        error_message="" if checkpoint_status == "COMPLETED" else "page detail/import error",
                    )

                    leaf_pages += 1
                    pages_fetched += 1
                    if leaf_pages % 10 == 0 or (total_hint and start + page_size >= total_hint):
                        print(
                            f"[{job.provider}] leaf={leaf_index}/{len(selected_leaves)} "
                            f"partition={partition_index}/{len(partitions)} "
                            f"page={leaf_pages} captured={session_import.captured} "
                            f"label={partition.label[:80]}"
                        )

                    start += page_size
                    if max_pages_per_leaf and leaf_pages >= max_pages_per_leaf:
                        break
                    if total_hint and start >= total_hint:
                        break
            break

    totals, manifest_path = session_import.finalize(
        {
            "source": "VTEX_CATEGORY_TREE_SEARCH_API",
            "categoryLeavesDiscovered": leaves_discovered,
            "categoryLeavesSelected": len(selected_leaves),
            "partitionsBuilt": partitions_built,
            "brandPartitionsBuilt": brand_partitions,
            "pagesFetched": pages_fetched,
            "productsDiscovered": products_discovered,
            "skippedCategoryLeaves": skipped_unmatched,
            "skippedOverflowPages": skipped_overflow_pages,
            "skippedCachedPages": skipped_cached_pages,
            "selectedCategoryKeywords": list(job.allowed_category_keywords),
            "selectedCategories": list(job.selected_categories),
        }
    )
    total_errors = page_errors + detail_errors + int(totals.get("errors", 0))
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
                "categoryLeavesSelected": len(selected_leaves),
                "partitionsBuilt": partitions_built,
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
