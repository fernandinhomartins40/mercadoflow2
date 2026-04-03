#!/usr/bin/env python3
"""Harvest product data from public supermarket websites.

Main goals:
- crawl configured public sources (sitemaps + html pages)
- extract product data (GTIN/EAN, name, brand, category, price)
- save JSON/CSV output for auditing
- optionally import records into MercadoFlow admin API
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import html
import json
import os
import re
import sys
import time
import xml.etree.ElementTree as ET
from collections import defaultdict, deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple
from urllib.parse import urldefrag, urljoin, urlparse

import requests
from optimized_image_store import OptimizedImageStore

DEFAULT_CONFIG = "scripts/catalog/supermarket_sources.json"
DEFAULT_OUTPUT = "data/catalog/supermarket_products.json"
DEFAULT_UA = "MercadoFlowCatalogBot/1.0 (+https://mercadoflow.com)"

GTIN_RE = re.compile(r"^\d{8,14}$")
JSONLD_RE = re.compile(r"<script[^>]*application/ld\+json[^>]*>(.*?)</script>", re.I | re.S)
HREF_RE = re.compile(r"""<a[^>]+href=["']([^"']+)["']""", re.I)
TITLE_META_RE = re.compile(
    r"""<meta[^>]+(?:property|name)=["']og:title["'][^>]+content=["']([^"']+)["']""",
    re.I,
)
TITLE_TAG_RE = re.compile(r"""<title[^>]*>(.*?)</title>""", re.I | re.S)
PRICE_META_RE = re.compile(
    r"""<meta[^>]+(?:property|name)=["']product:price:amount["'][^>]+content=["']([^"']+)["']""",
    re.I,
)
GTIN_HINT_RE = re.compile(
    r"(?:ean|gtin|c[o\u00f3]digo\s*de\s*barras|codigo\s*de\s*barras)[^0-9]{0,12}([0-9]{8,14})",
    re.I,
)
URL_CODE_RE = re.compile(r"([0-9]{8,14})")
META_ITEMPROP_RE = re.compile(
    r"""<meta[^>]+itemprop=["']([^"']+)["'][^>]+content=["']([^"']+)["']""",
    re.I,
)
GPA_BRAND_BY_PROVIDER = {
    "PAODEACUCAR_WEB_BR": "pa",
    "PAO_DE_ACUCAR_WEB_BR": "pa",
    "EXTRA_WEB_BR": "ex",
    "CLUBEEXTRA_WEB_BR": "ex",
}
GPA_STORE_BY_BRAND = {
    "pa": 461,
    "ex": 483,
}
GPA_SITE_BY_BRAND = {
    "pa": "https://www.paodeacucar.com",
    "ex": "https://www.extramercado.com.br",
}


@dataclass
class Source:
    name: str
    provider: str
    source_license: str
    seeds: List[str]
    allowed_domains: List[str]
    hints: List[str] = field(default_factory=lambda: ["/produto", "/product", "/p/"])
    max_pages: int = 250
    max_records: int = 2500
    rate_limit_ms: int = 1000
    timeout_sec: int = 20

    @staticmethod
    def from_json(obj: Dict[str, Any]) -> "Source":
        provider = str(obj.get("provider") or "").strip().upper()
        allowed_domains = [str(v).strip().lower() for v in obj.get("allowedDomains", []) if str(v).strip()]
        if provider in {"EXTRA_WEB_BR", "CLUBEEXTRA_WEB_BR"}:
            add_if_absent(allowed_domains, "www.extramercado.com.br")
            add_if_absent(allowed_domains, "extramercado.com.br")
            add_if_absent(allowed_domains, "www.clubeextra.com.br")
            add_if_absent(allowed_domains, "clubeextra.com.br")
        if provider in {"PAODEACUCAR_WEB_BR", "PAO_DE_ACUCAR_WEB_BR"}:
            add_if_absent(allowed_domains, "www.paodeacucar.com")
            add_if_absent(allowed_domains, "paodeacucar.com")
        return Source(
            name=str(obj.get("name") or "").strip(),
            provider=provider,
            source_license=str(obj.get("sourceLicense") or "").strip() or "Public website data",
            seeds=[str(v).strip() for v in obj.get("seeds", []) if str(v).strip()],
            allowed_domains=allowed_domains,
            hints=[str(v).strip().lower() for v in obj.get("productPathHints", ["/produto", "/product", "/p/"]) if str(v).strip()],
            max_pages=int(obj.get("maxPages", 250)),
            max_records=int(obj.get("maxRecords", 2500)),
            rate_limit_ms=int(obj.get("rateLimitMs", 1000)),
            timeout_sec=int(obj.get("requestTimeoutSec", 20)),
        )


@dataclass
class Record:
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
    price: Optional[float]
    currency: str
    source_url: str
    provider_product_id: str
    raw_payload: Dict[str, Any]

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
            "rawPayload": json.dumps(
                {
                    "providerProductId": self.provider_product_id,
                    "price": self.price,
                    "currency": self.currency,
                    "sourceUrl": self.source_url,
                    "payload": self.raw_payload,
                },
                ensure_ascii=False,
            ),
        }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Harvest supermarket websites and update global catalog")
    parser.add_argument("--config", default=DEFAULT_CONFIG)
    parser.add_argument("--output", default=DEFAULT_OUTPUT)
    parser.add_argument("--config-api-endpoint", default="", help="Optional endpoint path for dynamic config (example: /v1/super-admin/catalog/crawler/export-config)")
    parser.add_argument("--watch", action="store_true")
    parser.add_argument("--interval-minutes", type=int, default=360)
    parser.add_argument("--ignore-robots", action="store_true")
    parser.add_argument("--max-pages-per-source", type=int, default=0)
    parser.add_argument("--max-records-per-source", type=int, default=0)
    parser.add_argument("--skip-api-import", action="store_true")
    parser.add_argument("--api-base", default="")
    parser.add_argument("--token", default="")
    parser.add_argument("--login-endpoint", default="/v1/auth/login")
    parser.add_argument("--import-endpoint", default="/v1/admin/catalog/import/records")
    parser.add_argument("--email", default="")
    parser.add_argument("--password", default="")
    parser.add_argument("--confidence", type=float, default=0.9)
    parser.add_argument("--batch-size", type=int, default=300)
    parser.add_argument("--skip-medication", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--download-images", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--enable-browser-simulation", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--images-dir", default="data/catalog/images")
    parser.add_argument("--max-image-bytes", type=int, default=3_000_000)
    parser.add_argument("--worker-name", default="MERCADOFLOW_CATALOG_HARVESTER")
    parser.add_argument("--runs-start-endpoint", default="/v1/super-admin/catalog/crawler/runs/start")
    parser.add_argument("--runs-claim-endpoint", default="/v1/super-admin/catalog/crawler/runs/claim")
    parser.add_argument("--runs-finish-endpoint", default="/v1/super-admin/catalog/crawler/runs/{runId}/finish")
    parser.add_argument("--manual-poll-seconds", type=int, default=30)
    return parser.parse_args()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def norm_text(v: Any) -> str:
    if v is None:
        return ""
    return html.unescape(" ".join(str(v).split())).strip()


def norm_gtin(v: Any) -> str:
    if v is None:
        return ""
    d = "".join(ch for ch in str(v) if ch.isdigit())
    if GTIN_RE.match(d) and set(d) != {"0"}:
        return d
    return ""


def norm_code(v: Any) -> str:
    value = norm_text(v)
    return re.sub(r"\s+", "-", value)[:128] if value else ""


def parse_price(v: Any) -> Optional[float]:
    if v is None:
        return None
    text = norm_text(v).replace("R$", "").replace(" ", "")
    if not text:
        return None
    if "," in text and "." in text:
        text = text.replace(".", "").replace(",", ".") if text.rfind(",") > text.rfind(".") else text.replace(",", "")
    else:
        text = text.replace(",", ".")
    try:
        p = float(text)
    except Exception:
        return None
    return round(p, 4) if p >= 0 else None


def to_json_text(value: Any) -> str:
    if value is None:
        return ""
    try:
        return json.dumps(value, ensure_ascii=False)
    except Exception:
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


def canonical_url(url: str) -> str:
    if not url:
        return ""
    clean, _ = urldefrag(url.strip())
    parsed = urlparse(clean)
    return clean if parsed.scheme in {"http", "https"} else ""


def same_domain(url: str, allowed: Sequence[str]) -> bool:
    host = (urlparse(url).hostname or "").lower()
    if not host:
        return False
    return any(host == d or host.endswith("." + d) for d in [x.lower() for x in allowed])


def parse_robots(content: str, user_agent: str) -> Tuple[List[str], List[str]]:
    allow_by: Dict[str, List[str]] = defaultdict(list)
    deny_by: Dict[str, List[str]] = defaultdict(list)
    agents: List[str] = []
    seen_rule = False
    for line in content.splitlines():
        clean = line.split("#", 1)[0].strip()
        if not clean or ":" not in clean:
            continue
        key, value = clean.split(":", 1)
        key, value = key.strip().lower(), value.strip()
        if key == "user-agent":
            if seen_rule:
                agents = []
                seen_rule = False
            agents.append(value.lower())
            continue
        if key not in {"allow", "disallow"}:
            continue
        if not agents:
            agents = ["*"]
        seen_rule = True
        for a in agents:
            if key == "allow":
                allow_by[a].append(value)
            else:
                deny_by[a].append(value)
    ua = user_agent.split("/", 1)[0].lower()
    allows = allow_by.get("*", []) + allow_by.get(ua, [])
    denies = deny_by.get("*", []) + deny_by.get(ua, [])
    return allows, denies


def robots_allowed(path: str, allows: Sequence[str], denies: Sequence[str]) -> bool:
    best = ""
    best_type = "allow"
    for r in allows:
        if r and path.startswith(r) and len(r) > len(best):
            best, best_type = r, "allow"
    for r in denies:
        if r and path.startswith(r) and len(r) > len(best):
            best, best_type = r, "deny"
    return best_type == "allow"


def likely_link(source: Source, url: str) -> bool:
    p = urlparse(url)
    path = (p.path or "").lower()
    q = (p.query or "").lower()
    if "sitemap" in path or path.endswith(".xml"):
        return True
    if any(h in path for h in source.hints):
        return True
    if any(x in q for x in ("produto", "product", "sku", "ean")):
        return True
    return bool(URL_CODE_RE.search(path))


def provider_kind(source: Source) -> str:
    provider = source.provider.strip().upper()
    if provider in GPA_BRAND_BY_PROVIDER:
        return "gpa"
    if provider in {
        "CARREFOUR_WEB_BR",
        "DROGARIASP_WEB_BR",
        "DROGARIA_SP_WEB_BR",
        "GUANABARA_WEB_BR",
        "REDETOPONLINE_WEB_BR",
        "NORDESTAO_WEB_BR",
    }:
        return "sitemap_product_first"
    return "generic"


def normalize_gpa_brand(source: Source) -> str:
    provider = source.provider.strip().upper()
    brand = GPA_BRAND_BY_PROVIDER.get(provider)
    if brand:
        return brand
    domains = ",".join(source.allowed_domains).lower()
    if "paodeacucar" in domains:
        return "pa"
    if "extramercado" in domains or "clubeextra" in domains:
        return "ex"
    return ""


def gpa_default_store_id(brand: str) -> int:
    return GPA_STORE_BY_BRAND.get(brand, 461)


def gpa_site_base(brand: str) -> str:
    return GPA_SITE_BY_BRAND.get(brand, "")


def add_if_absent(items: List[str], value: str) -> None:
    clean = value.strip().lower()
    if not clean:
        return
    if clean not in items:
        items.append(clean)


def is_product_sitemap_url(url: str) -> bool:
    path = (urlparse(url).path or "").lower()
    return (
        "/sitemap/product-" in path
        or "product-" in path and path.endswith(".xml")
        or "/produto/" in path
        or path.endswith("/p")
    )


def walk_dict_for_gtin(node: Any) -> str:
    if isinstance(node, dict):
        for key, value in node.items():
            key_lower = str(key).lower()
            if any(token in key_lower for token in ("gtin", "ean", "barcode", "codigo", "codbarras", "plu")):
                gtin = norm_gtin(value)
                if gtin:
                    return gtin
            value_digits = norm_gtin(value) if isinstance(value, (str, int, float)) else ""
            if value_digits and len(value_digits) >= 12:
                return value_digits
            nested = walk_dict_for_gtin(value)
            if nested:
                return nested
    elif isinstance(node, list):
        for item in node:
            value_digits = norm_gtin(item) if isinstance(item, (str, int, float)) else ""
            if value_digits and len(value_digits) >= 12:
                return value_digits
            nested = walk_dict_for_gtin(item)
            if nested:
                return nested
    return ""


def json_or_none(text: str) -> Optional[Any]:
    try:
        return json.loads(text)
    except Exception:
        return None


def iter_products(node: Any) -> Iterable[Dict[str, Any]]:
    if isinstance(node, dict):
        t = node.get("@type")
        is_product = any(str(x).lower() == "product" for x in t) if isinstance(t, list) else str(t).lower() == "product"
        if is_product:
            yield node
        for v in node.values():
            yield from iter_products(v)
    elif isinstance(node, list):
        for it in node:
            yield from iter_products(it)


def pick_code(node: Dict[str, Any], page_url: str) -> Tuple[str, str]:
    for k in ("gtin14", "gtin13", "gtin12", "gtin8", "gtin", "ean", "barcode", "productID", "sku", "mpn"):
        gtin = norm_gtin(node.get(k))
        if gtin:
            return gtin, gtin
    provider_id = norm_code(node.get("sku") or node.get("productID") or node.get("mpn"))
    if not provider_id:
        m = URL_CODE_RE.search(page_url)
        provider_id = m.group(1) if m else f"url-{hashlib.sha1(page_url.encode('utf-8')).hexdigest()[:16]}"
    return provider_id, provider_id


def has_meaningful_fallback_signals(itemprops: Dict[str, str], gtin: str, price: Optional[float]) -> bool:
    if gtin or price is not None:
        return True
    for key in ("brand", "image", "sku", "productid", "mpn", "price", "pricecurrency", "availability"):
        if itemprops.get(key):
            return True
    return False


def extract_record(source: Source, page_url: str, body: str) -> Optional[Record]:
    for script in JSONLD_RE.findall(body):
        payload = json_or_none(script.strip().strip(";"))
        if payload is None:
            continue
        for node in iter_products(payload):
            name = norm_text(node.get("name"))
            if not name:
                continue
            code, provider_id = pick_code(node, page_url)
            brand = norm_text(node.get("brand", {}).get("name") if isinstance(node.get("brand"), dict) else node.get("brand"))[:120]
            category = norm_text(node.get("category"))[:120]
            package = norm_text(node.get("size") or node.get("weight") or node.get("description"))[:255]
            description = norm_text(node.get("description"))[:1024]
            manufacturer = norm_text(node.get("manufacturer", {}).get("name") if isinstance(node.get("manufacturer"), dict) else node.get("manufacturer"))[:255]
            image_candidate = node.get("image")
            if isinstance(image_candidate, list):
                image_url = canonical_url(norm_text(image_candidate[0])) if image_candidate else ""
            else:
                image_url = canonical_url(norm_text(image_candidate))
            offers = node.get("offers")
            price, currency = None, ""
            if isinstance(offers, dict):
                price = parse_price(offers.get("price") or offers.get("lowPrice"))
                currency = norm_text(offers.get("priceCurrency"))[:16]
            elif isinstance(offers, list):
                for offer in offers:
                    if isinstance(offer, dict):
                        p = parse_price(offer.get("price") or offer.get("lowPrice"))
                        if p is not None:
                            price = p
                            currency = norm_text(offer.get("priceCurrency"))[:16]
                            break
            return Record(
                provider=source.provider,
                source_license=source.source_license,
                code=code,
                name=name[:255],
                brand=brand,
                category=category,
                ncm=norm_text(node.get("ncm"))[:32],
                unit=norm_text(node.get("unitCode") or node.get("unitText") or node.get("unit"))[:32],
                description=description,
                manufacturer=manufacturer,
                package_description=package,
                image_url=image_url,
                image_storage_key="",
                attributes_json=to_json_text(node.get("additionalProperty") or node.get("additionalProperties")),
                price=price,
                currency=currency,
                source_url=page_url,
                provider_product_id=provider_id[:128],
                raw_payload=node,
            )

    title = TITLE_META_RE.search(body)
    title_tag = TITLE_TAG_RE.search(body)
    name = norm_text(title.group(1) if title else (title_tag.group(1) if title_tag else ""))
    if not name:
        return None

    itemprops: Dict[str, str] = {}
    for key, value in META_ITEMPROP_RE.findall(body):
        key_norm = norm_text(key).lower()
        value_norm = norm_text(value)
        if key_norm and value_norm and key_norm not in itemprops:
            itemprops[key_norm] = value_norm

    gtin = ""
    for key in ("gtin14", "gtin13", "gtin12", "gtin8", "gtin", "ean", "barcode"):
        gtin = norm_gtin(itemprops.get(key))
        if gtin:
            break
    if not gtin:
        gtin_m = GTIN_HINT_RE.search(body)
        gtin = norm_gtin(gtin_m.group(1) if gtin_m else "")
    if not gtin:
        ean_from_script = re.search(r'''"productEans"\s*:\s*\[\s*"([0-9]{8,14})"''', body, re.I)
        gtin = norm_gtin(ean_from_script.group(1) if ean_from_script else "")

    provider_id = norm_code(itemprops.get("sku"))
    if not provider_id:
        script_product_id = re.search(r'''"productId"\s*:\s*"([0-9A-Za-z_-]+)"''', body, re.I)
        provider_id = norm_code(script_product_id.group(1) if script_product_id else "")
    if not provider_id:
        url_m = URL_CODE_RE.search(page_url)
        provider_id = url_m.group(1) if url_m else f"url-{hashlib.sha1(page_url.encode('utf-8')).hexdigest()[:16]}"

    price_m = PRICE_META_RE.search(body)
    if not price_m:
        item_price = itemprops.get("price")
        price = parse_price(item_price)
    else:
        price = parse_price(price_m.group(1))

    if not has_meaningful_fallback_signals(itemprops, gtin, price):
        return None

    image_match = re.search(r"""<meta[^>]+(?:property|name)=["']og:image["'][^>]+content=["']([^"']+)["']""", body, re.I)
    image_url = canonical_url(norm_text(image_match.group(1))) if image_match else canonical_url(itemprops.get("image", ""))
    brand = norm_text(itemprops.get("brand"))[:120]
    category = norm_text(itemprops.get("category"))[:120]
    currency = norm_text(itemprops.get("pricecurrency") or itemprops.get("priceCurrency") or "BRL")[:16] or "BRL"

    return Record(
        provider=source.provider,
        source_license=source.source_license,
        code=gtin or provider_id,
        name=name[:255],
        brand=brand,
        category=category,
        ncm="",
        unit="",
        description="",
        manufacturer="",
        package_description="",
        image_url=image_url,
        image_storage_key="",
        attributes_json=to_json_text({"itemprops": itemprops}) if itemprops else "",
        price=price,
        currency=currency,
        source_url=page_url,
        provider_product_id=provider_id[:128],
        raw_payload={"fallback": True, "title": name, "itemprops": itemprops},
    )


class Crawler:
    def __init__(self, user_agent: str, ignore_robots: bool, enable_browser_simulation: bool = True):
        self.user_agent = user_agent
        self.ignore_robots = ignore_robots
        self.enable_browser_simulation = enable_browser_simulation
        self.sess = requests.Session()
        self.sess.headers.update(
            {
                "User-Agent": user_agent,
                "Accept": "text/html,application/xhtml+xml,application/xml,text/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
            }
        )
        self.last_hit: Dict[str, float] = {}
        self.robots_cache: Dict[str, Tuple[List[str], List[str]]] = {}

    def _allowed(self, url: str, timeout: int) -> bool:
        if self.ignore_robots:
            return True
        parsed = urlparse(url)
        host = (parsed.hostname or "").lower()
        if not host:
            return False
        if host not in self.robots_cache:
            robots_url = f"{parsed.scheme}://{host}/robots.txt"
            try:
                r = self.sess.get(robots_url, timeout=timeout)
                self.robots_cache[host] = parse_robots(r.text if r.ok else "", self.user_agent)
            except Exception:
                self.robots_cache[host] = ([], [])
        allow, deny = self.robots_cache[host]
        return robots_allowed(parsed.path or "/", allow, deny)

    def _get(self, url: str, timeout: int, rate_limit_ms: int) -> Tuple[str, str, str]:
        host = (urlparse(url).hostname or "").lower()
        prev = self.last_hit.get(host)
        if prev is not None:
            wait = rate_limit_ms - ((time.time() - prev) * 1000.0)
            if wait > 0:
                time.sleep(wait / 1000.0)
        r = self.sess.get(url, timeout=timeout, allow_redirects=True)
        self.last_hit[host] = time.time()
        r.raise_for_status()
        return r.url, (r.headers.get("content-type") or ""), r.text

    def _get_json(self, url: str, params: Dict[str, Any], timeout: int, rate_limit_ms: int) -> Dict[str, Any]:
        host = (urlparse(url).hostname or "").lower()
        prev = self.last_hit.get(host)
        if prev is not None:
            wait = rate_limit_ms - ((time.time() - prev) * 1000.0)
            if wait > 0:
                time.sleep(wait / 1000.0)
        response = self.sess.get(
            url,
            params=params,
            timeout=timeout,
            headers={"Accept": "application/json, text/plain, */*"},
        )
        self.last_hit[host] = time.time()
        response.raise_for_status()
        data = response.json()
        return data if isinstance(data, dict) else {}

    def _record_from_gpa_item(self, source: Source, brand: str, item: Dict[str, Any]) -> Record:
        raw_code = walk_dict_for_gtin(item)
        sku = norm_text(item.get("sku"))
        product_id = norm_text(item.get("id"))
        provider_id = norm_code(product_id or sku)
        if not provider_id:
            provider_id = f"gpa-{hashlib.sha1(json.dumps(item, ensure_ascii=False).encode('utf-8')).hexdigest()[:16]}"
        code = raw_code or provider_id

        departments = item.get("departments")
        category = ""
        if isinstance(departments, list):
            names = []
            for dep in departments:
                if isinstance(dep, dict):
                    names.append(norm_text(dep.get("name")))
                else:
                    names.append(norm_text(dep))
            names = [n for n in names if n]
            if names:
                category = " > ".join(names[:2])[:120]

        url_details = norm_text(item.get("urlDetails"))
        site_base = gpa_site_base(brand)
        source_url = canonical_url(urljoin(site_base, url_details)) if site_base and url_details else ""

        image_url = ""
        image_map = item.get("mapOfImages")
        if isinstance(image_map, dict):
            for image_entry in image_map.values():
                if not isinstance(image_entry, dict):
                    continue
                for key in ("BIG", "MEDIUM", "SMALL"):
                    value = canonical_url(norm_text(image_entry.get(key)))
                    if value:
                        image_url = value
                        break
                if image_url:
                    break
        if not image_url:
            thumb = norm_text(item.get("thumbPath"))
            if thumb:
                image_url = canonical_url(thumb) if thumb.startswith("http") else canonical_url(
                    urljoin("https://static.extramercado.com.br" if brand == "ex" else "https://static.paodeacucar.com", thumb)
                )

        brand_name = norm_text(item.get("brand"))[:120]
        name = norm_text(item.get("name"))[:255]
        price = parse_price(item.get("sellPrice") or item.get("currentPrice"))

        return Record(
            provider=source.provider,
            source_license=source.source_license,
            code=code[:128],
            name=name,
            brand=brand_name,
            category=category,
            ncm="",
            unit=norm_text((item.get("commercialStructure") or {}).get("unitType"))[:32] if isinstance(item.get("commercialStructure"), dict) else "",
            description=norm_text(item.get("shortDescription"))[:1024],
            manufacturer="",
            package_description=norm_text(item.get("quantityStock") or item.get("dimensions"))[:255],
            image_url=image_url,
            image_storage_key="",
            attributes_json=to_json_text(item.get("attributes") or item.get("itemMap")),
            price=price,
            currency="BRL",
            source_url=source_url,
            provider_product_id=provider_id[:128],
            raw_payload=item,
        )

    def _merge_record(self, base: Record, enriched: Record) -> Record:
        if GTIN_RE.match(enriched.code or ""):
            base.code = enriched.code
        if not base.name and enriched.name:
            base.name = enriched.name
        if not base.brand and enriched.brand:
            base.brand = enriched.brand
        if not base.category and enriched.category:
            base.category = enriched.category
        if not base.ncm and enriched.ncm:
            base.ncm = enriched.ncm
        if not base.unit and enriched.unit:
            base.unit = enriched.unit
        if not base.description and enriched.description:
            base.description = enriched.description
        if not base.manufacturer and enriched.manufacturer:
            base.manufacturer = enriched.manufacturer
        if not base.package_description and enriched.package_description:
            base.package_description = enriched.package_description
        if not base.image_url and enriched.image_url:
            base.image_url = enriched.image_url
        if base.price is None and enriched.price is not None:
            base.price = enriched.price
        if not base.currency and enriched.currency:
            base.currency = enriched.currency
        if not base.source_url and enriched.source_url:
            base.source_url = enriched.source_url
        if not base.attributes_json and enriched.attributes_json:
            base.attributes_json = enriched.attributes_json
        base.raw_payload = {
            "apiItem": base.raw_payload,
            "pageItem": enriched.raw_payload,
        }
        return base

    def _browser_collect_product_pages(self, source: Source, seeds: Sequence[str], max_urls: int) -> List[str]:
        if not self.enable_browser_simulation or max_urls <= 0:
            return []
        try:
            from playwright.sync_api import sync_playwright
        except Exception:
            return []

        found: List[str] = []
        found_set: set[str] = set()
        timeout_ms = max(15_000, source.timeout_sec * 1000)
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            context = browser.new_context(user_agent=self.user_agent, viewport={"width": 1400, "height": 2000})
            page = context.new_page()

            def collect(url: str) -> None:
                clean = canonical_url(url)
                if not clean or clean in found_set or not same_domain(clean, source.allowed_domains):
                    return
                if "/produto/" not in clean and "/p" not in clean:
                    return
                found_set.add(clean)
                found.append(clean)

            def on_response(resp: Any) -> None:
                try:
                    collect(str(resp.url))
                except Exception:
                    return

            page.on("response", on_response)
            for seed in seeds:
                if len(found) >= max_urls:
                    break
                target = canonical_url(seed)
                if not target:
                    continue
                try:
                    page.goto(target, wait_until="domcontentloaded", timeout=timeout_ms)
                    for _ in range(3):
                        page.mouse.wheel(0, 1800)
                        page.wait_for_timeout(700)
                    links = page.eval_on_selector_all("a[href]", "elements => elements.map(e => e.href)")
                    for href in links:
                        collect(str(href))
                        if len(found) >= max_urls:
                            break
                except Exception:
                    continue
            context.close()
            browser.close()
        return found[:max_urls]

    def _crawl_gpa(self, source: Source, max_pages_override: int, max_records_override: int) -> Tuple[List[Record], Dict[str, int]]:
        max_pages = max_pages_override or source.max_pages
        max_records = max_records_override or source.max_records
        listing_budget = max(1, int(max_pages * 0.65))
        if listing_budget >= max_pages:
            listing_budget = max(1, max_pages - 1)
        stats = {"scannedPages": 0, "discoveredLinks": 0, "extractedRecords": 0, "skippedDisallowed": 0, "errors": 0}
        records: Dict[str, Record] = {}
        visited_product_pages: set[str] = set()

        brand = normalize_gpa_brand(source)
        if not brand:
            stats["errors"] = 1
            return [], stats
        store_id_env_key = f"GPA_{brand.upper()}_STORE_ID"
        store_id = int(os.getenv(store_id_env_key, str(gpa_default_store_id(brand))))
        site_base = gpa_site_base(brand)

        categories_url = f"https://api.vendas.gpa.digital/{brand}/v4/products/categories/ecom"
        try:
            categories_payload = self._get_json(
                categories_url,
                {"storeId": store_id},
                timeout=source.timeout_sec,
                rate_limit_ms=source.rate_limit_ms,
            )
            stats["scannedPages"] += 1
        except Exception:
            stats["errors"] += 1
            return [], stats

        def iter_shelf_ids(nodes: Any) -> Iterable[int]:
            if isinstance(nodes, list):
                for node in nodes:
                    yield from iter_shelf_ids(node)
            elif isinstance(nodes, dict):
                node_id = nodes.get("id")
                if isinstance(node_id, int) and node_id > 0:
                    yield node_id
                yield from iter_shelf_ids(nodes.get("subCategories"))

        shelf_ids: List[int] = []
        seen_shelf_ids: set[int] = set()
        for shelf_id in iter_shelf_ids(categories_payload.get("content")):
            if shelf_id in seen_shelf_ids:
                continue
            seen_shelf_ids.add(shelf_id)
            shelf_ids.append(shelf_id)
        stats["discoveredLinks"] += len(shelf_ids)

        for shelf_id in shelf_ids:
            if len(records) >= max_records or stats["scannedPages"] >= listing_budget:
                break
            try:
                payload = self._get_json(
                    f"https://api.vendas.gpa.digital/{brand}/v2/products/ecom/seeMore",
                    {"storeId": store_id, "isClienteMais": "true", "shelfId": shelf_id},
                    timeout=source.timeout_sec,
                    rate_limit_ms=source.rate_limit_ms,
                )
                stats["scannedPages"] += 1
            except Exception:
                stats["errors"] += 1
                continue

            content = payload.get("content")
            if not isinstance(content, list):
                continue
            for item in content:
                if not isinstance(item, dict):
                    continue
                record = self._record_from_gpa_item(source, brand, item)
                key = f"{record.provider}:{record.provider_product_id}"
                records[key] = record
                if len(records) >= max_records:
                    break

        # Enrich collected records by visiting product pages and extracting GTIN/metadata.
        for key, record in list(records.items()):
            if stats["scannedPages"] >= max_pages:
                break
            if not record.source_url or record.source_url in visited_product_pages:
                continue
            if not self._allowed(record.source_url, source.timeout_sec):
                stats["skippedDisallowed"] += 1
                continue
            visited_product_pages.add(record.source_url)
            try:
                final_url, content_type, body = self._get(record.source_url, source.timeout_sec, source.rate_limit_ms)
                stats["scannedPages"] += 1
                if "html" not in content_type.lower() and "<html" not in body.lower():
                    continue
                extracted = extract_record(source, final_url, body)
                if extracted:
                    records[key] = self._merge_record(record, extracted)
            except Exception:
                stats["errors"] += 1
                continue

        # Browser simulation fallback for dynamic pages when extracted set is still very small.
        if len(records) < min(25, max_records):
            fallback_seeds = [s for s in source.seeds if canonical_url(s)]
            if not fallback_seeds and site_base:
                fallback_seeds = [f"{site_base}/categoria/alimentos"]
            discovered = self._browser_collect_product_pages(
                source=source,
                seeds=fallback_seeds,
                max_urls=max(10, min(100, max_records - len(records))),
            )
            stats["discoveredLinks"] += len(discovered)
            for page_url in discovered:
                if stats["scannedPages"] >= max_pages or len(records) >= max_records:
                    break
                if page_url in visited_product_pages or not self._allowed(page_url, source.timeout_sec):
                    continue
                visited_product_pages.add(page_url)
                try:
                    final_url, content_type, body = self._get(page_url, source.timeout_sec, source.rate_limit_ms)
                    stats["scannedPages"] += 1
                    if "html" not in content_type.lower() and "<html" not in body.lower():
                        continue
                    extracted = extract_record(source, final_url, body)
                    if extracted:
                        key = f"{extracted.provider}:{extracted.provider_product_id}"
                        if key in records:
                            records[key] = self._merge_record(records[key], extracted)
                        else:
                            records[key] = extracted
                except Exception:
                    stats["errors"] += 1

        stats["extractedRecords"] = len(records)
        return list(records.values())[:max_records], stats

    def _crawl_generic(
        self,
        source: Source,
        max_pages_override: int,
        max_records_override: int,
        product_sitemap_priority: bool = False,
    ) -> Tuple[List[Record], Dict[str, int]]:
        max_pages = max_pages_override or source.max_pages
        max_records = max_records_override or source.max_records
        queue: deque[str] = deque([u for u in [canonical_url(s) for s in source.seeds] if u and same_domain(u, source.allowed_domains)])
        queued: set[str] = set(queue)
        seen: set[str] = set()
        records: Dict[str, Record] = {}
        stats = {"scannedPages": 0, "discoveredLinks": 0, "extractedRecords": 0, "skippedDisallowed": 0, "errors": 0}

        while queue and stats["scannedPages"] < max_pages and len(records) < max_records:
            url = canonical_url(queue.popleft())
            queued.discard(url)
            if not url or url in seen or not same_domain(url, source.allowed_domains):
                continue
            if not self._allowed(url, source.timeout_sec):
                stats["skippedDisallowed"] += 1
                continue
            seen.add(url)
            try:
                final_url, content_type, body = self._get(url, source.timeout_sec, source.rate_limit_ms)
            except Exception:
                stats["errors"] += 1
                stats["scannedPages"] += 1
                continue
            stats["scannedPages"] += 1

            lower = (content_type or "").lower()
            if "xml" in lower or final_url.lower().endswith(".xml") or "sitemap" in final_url.lower():
                try:
                    root = ET.fromstring(body)
                    for node in root.iter():
                        if not node.tag.lower().endswith("loc") or not node.text:
                            continue
                        loc = canonical_url(node.text.strip())
                        if not loc or not same_domain(loc, source.allowed_domains):
                            continue
                        if loc in seen or loc in queued:
                            continue
                        if product_sitemap_priority and "sitemap" in loc.lower() and loc.lower().endswith(".xml") and not is_product_sitemap_url(loc):
                            continue
                        if product_sitemap_priority and is_product_sitemap_url(loc):
                            queue.appendleft(loc)
                        else:
                            queue.append(loc)
                        queued.add(loc)
                        stats["discoveredLinks"] += 1
                except Exception:
                    pass
                continue

            if "html" in lower or "<html" in body.lower():
                record = extract_record(source, final_url, body)
                if record:
                    records[f"{record.provider}:{record.code}"] = record
                for href in HREF_RE.findall(body):
                    link = canonical_url(urljoin(final_url, href))
                    if (
                        link
                        and same_domain(link, source.allowed_domains)
                        and likely_link(source, link)
                        and link not in seen
                        and link not in queued
                    ):
                        if product_sitemap_priority and is_product_sitemap_url(link):
                            queue.appendleft(link)
                        else:
                            queue.append(link)
                        queued.add(link)
                        stats["discoveredLinks"] += 1

        stats["extractedRecords"] = len(records)
        return list(records.values())[:max_records], stats

    def crawl(self, source: Source, max_pages_override: int, max_records_override: int) -> Tuple[List[Record], Dict[str, int]]:
        kind = provider_kind(source)
        if kind == "gpa":
            return self._crawl_gpa(source, max_pages_override, max_records_override)
        return self._crawl_generic(
            source=source,
            max_pages_override=max_pages_override,
            max_records_override=max_records_override,
            product_sitemap_priority=(kind == "sitemap_product_first"),
        )


class ImageStore:
    def __init__(self, images_dir: Path, max_bytes: int, user_agent: str):
        self._store = OptimizedImageStore(
            base_dir=images_dir,
            max_bytes=max_bytes,
            user_agent=user_agent,
        )

    def store(self, record: Record, timeout_sec: int = 20) -> str:
        try:
            return self._store.save(record.code, record.image_url, timeout_sec=timeout_sec)
        except Exception:
            return ""


def api_post(
    api_base: str,
    endpoint: str,
    token: str,
    payload: Dict[str, Any],
    timeout: int = 60,
    accept_no_content: bool = False,
) -> Optional[Dict[str, Any]]:
    if not api_base or not endpoint or not token:
        return None
    path = endpoint if endpoint.startswith("/") else f"/{endpoint}"
    response = requests.post(
        f"{api_base.rstrip('/')}{path}",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json=payload,
        timeout=timeout,
    )
    if accept_no_content and response.status_code == 204:
        return None
    response.raise_for_status()
    if not response.text:
        return None
    return response.json()


def load_config(path: Path) -> Tuple[str, List[Source]]:
    cfg = json.loads(path.read_text(encoding="utf-8"))
    user_agent = norm_text(cfg.get("userAgent")) or DEFAULT_UA
    sources = [Source.from_json(s) for s in cfg.get("sources", [])]
    sources = [s for s in sources if s.name and s.provider and s.seeds and s.allowed_domains]
    if not sources:
        raise ValueError("No valid sources in config")
    return user_agent, sources


def load_config_from_api(api_base: str, endpoint: str, token: str) -> Tuple[str, List[Source], int]:
    path = endpoint if endpoint.startswith("/") else f"/{endpoint}"
    response = requests.get(
        f"{api_base.rstrip('/')}{path}",
        headers={"Authorization": f"Bearer {token}"},
        timeout=60,
    )
    response.raise_for_status()
    payload = response.json()
    user_agent = norm_text(payload.get("userAgent")) or DEFAULT_UA
    interval_minutes = int(payload.get("intervalMinutes") or 360)
    if payload.get("enabled") is False:
        return user_agent, [], interval_minutes
    sources = [Source.from_json(item) for item in payload.get("sources", [])]
    sources = [source for source in sources if source.name and source.provider and source.seeds and source.allowed_domains]
    return user_agent, sources, interval_minutes


def write_output(path: Path, records: Sequence[Record], summary: Sequence[Dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "source": "SUPERMARKET_WEB_CRAWLER",
        "capturedAt": now_iso(),
        "count": len(records),
        "summary": summary,
        "items": [
            {
                "provider": r.provider,
                "sourceLicense": r.source_license,
                "code": r.code,
                "name": r.name,
                "brand": r.brand,
                "category": r.category,
                "ncm": r.ncm,
                "unit": r.unit,
                "description": r.description,
                "manufacturer": r.manufacturer,
                "packageDescription": r.package_description,
                "imageUrl": r.image_url,
                "imageStorageKey": r.image_storage_key,
                "attributesJson": r.attributes_json,
                "price": r.price,
                "currency": r.currency,
                "sourceUrl": r.source_url,
                "providerProductId": r.provider_product_id,
                "rawPayload": r.raw_payload,
            }
            for r in records
        ],
    }
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    csv_path = path.with_suffix(".csv")
    with csv_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow([
            "provider",
            "code",
            "name",
            "brand",
            "category",
            "ncm",
            "unit",
            "manufacturer",
            "description",
            "package_description",
            "image_url",
            "image_storage_key",
            "price",
            "currency",
            "source_url",
            "provider_product_id",
        ])
        for r in records:
            w.writerow([
                r.provider,
                r.code,
                r.name,
                r.brand,
                r.category,
                r.ncm,
                r.unit,
                r.manufacturer,
                r.description,
                r.package_description,
                r.image_url,
                r.image_storage_key,
                r.price if r.price is not None else "",
                r.currency,
                r.source_url,
                r.provider_product_id,
            ])
    print(f"saved JSON: {path}")
    print(f"saved CSV:  {csv_path}")


def login(api_base: str, login_endpoint: str, email: str, password: str) -> str:
    endpoint = login_endpoint if login_endpoint.startswith("/") else f"/{login_endpoint}"
    resp = requests.post(
        f"{api_base.rstrip('/')}{endpoint}",
        json={"email": email, "password": password, "keepConnected": True},
        timeout=60,
    )
    resp.raise_for_status()
    token = resp.json().get("token")
    if not token:
        raise RuntimeError("Login succeeded but no token returned")
    return str(token)


def chunks(items: Sequence[Record], size: int) -> Iterable[List[Record]]:
    for i in range(0, len(items), size):
        yield list(items[i:i + size])


def unique_records_by_gtin(records: Sequence[Record]) -> Tuple[List[Record], int]:
    unique: List[Record] = []
    seen_gtins: set[str] = set()
    duplicates = 0
    for record in records:
        gtin = norm_gtin(record.code)
        if gtin:
            if gtin in seen_gtins:
                duplicates += 1
                continue
            seen_gtins.add(gtin)
        unique.append(record)
    return unique, duplicates


def import_api(
    api_base: str,
    token: str,
    import_endpoint: str,
    confidence: float,
    skip_medication: bool,
    batch_size: int,
    records: Sequence[Record],
) -> Dict[str, int]:
    grouped: Dict[Tuple[str, str], List[Record]] = defaultdict(list)
    for r in records:
        grouped[(r.provider, r.source_license)].append(r)

    totals = {
        "scannedProducts": 0,
        "importedProducts": 0,
        "skippedInvalidGtin": 0,
        "skippedMissingName": 0,
        "skippedMedication": 0,
        "skippedDuplicateGtin": 0,
        "errors": 0,
    }
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    path = import_endpoint if import_endpoint.startswith("/") else f"/{import_endpoint}"

    for (provider, source_license), items in grouped.items():
        unique_items, local_duplicates = unique_records_by_gtin(items)
        totals["skippedDuplicateGtin"] += local_duplicates
        for batch in chunks(unique_items, max(1, min(batch_size, 2000))):
            body = {
                "provider": provider,
                "sourceLicense": source_license,
                "confidenceScore": confidence,
                "skipMedication": skip_medication,
                "items": [r.as_import_item() for r in batch],
            }
            resp = requests.post(
                f"{api_base.rstrip('/')}{path}",
                headers=headers,
                json=body,
                timeout=180,
            )
            resp.raise_for_status()
            result = resp.json()
            for k in totals:
                totals[k] += int(result.get(k, 0))
            print(f"provider={provider} batch={len(batch)} imported={result.get('importedProducts', 0)} errors={result.get('errors', 0)}")
    return totals


def claim_remote_run(api_base: str, endpoint: str, token: str, worker_name: str) -> Optional[Dict[str, Any]]:
    try:
        return api_post(
            api_base=api_base,
            endpoint=endpoint,
            token=token,
            payload={"workerName": worker_name},
            timeout=60,
            accept_no_content=True,
        )
    except Exception as exc:
        print(f"claim run failed: {exc}", file=sys.stderr)
        return None


def start_remote_run(
    api_base: str,
    endpoint: str,
    token: str,
    worker_name: str,
    sources: Sequence[Source],
    message: str,
) -> Optional[str]:
    try:
        payload = {
            "triggeredBy": worker_name,
            "message": message,
            "sources": [s.provider for s in sources],
        }
        response = api_post(api_base, endpoint, token, payload, timeout=60)
        if not response:
            return None
        return str(response.get("id") or "")
    except Exception as exc:
        print(f"start run failed: {exc}", file=sys.stderr)
        return None


def finish_remote_run(
    api_base: str,
    endpoint_template: str,
    token: str,
    run_id: str,
    result: Dict[str, Any],
) -> None:
    if not run_id:
        return
    endpoint = endpoint_template.replace("{runId}", run_id)
    payload = {
        "status": result.get("status", "SUCCESS"),
        "scannedProducts": int(result.get("scannedProducts", 0)),
        "importedProducts": int(result.get("importedProducts", 0)),
        "skippedInvalidGtin": int(result.get("skippedInvalidGtin", 0)),
        "skippedMissingName": int(result.get("skippedMissingName", 0)),
        "skippedMedication": int(result.get("skippedMedication", 0)),
        "skippedDuplicateGtin": int(result.get("skippedDuplicateGtin", 0)),
        "errors": int(result.get("errors", 0)),
        "message": str(result.get("message") or ""),
        "sources": [str(s.get("provider")) for s in result.get("summary", []) if s.get("provider")],
    }
    try:
        api_post(api_base, endpoint, token, payload, timeout=120)
    except Exception as exc:
        print(f"finish run failed: {exc}", file=sys.stderr)


def run_cycle(
    args: argparse.Namespace,
    crawler: Crawler,
    sources: Sequence[Source],
    output_path: Path,
    image_store: Optional[ImageStore],
) -> Dict[str, Any]:
    all_records: Dict[str, Record] = {}
    summary: List[Dict[str, Any]] = []
    total_page_errors = 0

    for source in sources:
        print(f"source={source.name} provider={source.provider} started_at={now_iso()}")
        recs, stats = crawler.crawl(source, args.max_pages_per_source, args.max_records_per_source)
        for r in recs:
            all_records[f"{r.provider}:{r.code}"] = r
        total_page_errors += int(stats.get("errors", 0))
        summary.append({"source": source.name, "provider": source.provider, **stats})
        print(
            f"source={source.name} scanned={stats['scannedPages']} "
            f"found={stats['extractedRecords']} links={stats['discoveredLinks']} errors={stats['errors']}"
        )

    records = list(all_records.values())
    image_saved = 0
    if image_store is not None:
        for record in records:
            if not record.image_url:
                continue
            key = image_store.store(record)
            if key:
                record.image_storage_key = key
                image_saved += 1

    write_output(output_path, records, summary)
    print(f"cycle summary: records={len(records)} sources={len(sources)} images_saved={image_saved}")

    if args.skip_api_import or not args.api_base:
        if not args.skip_api_import and not args.api_base:
            print("api import skipped: --api-base not provided")
        return {
            "status": "SUCCESS",
            "message": "Coleta concluida sem importacao por API.",
            "summary": summary,
            "scannedProducts": len(records),
            "importedProducts": 0,
            "skippedInvalidGtin": 0,
            "skippedMissingName": 0,
            "skippedMedication": 0,
            "skippedDuplicateGtin": 0,
            "errors": total_page_errors,
        }

    token = norm_text(args.token)
    if not token:
        if not args.email or not args.password:
            print("api import skipped: provide --token or --email/--password")
            return {
                "status": "FAILED",
                "message": "Coleta executada, mas sem token para importacao.",
                "summary": summary,
                "scannedProducts": len(records),
                "importedProducts": 0,
                "skippedInvalidGtin": 0,
                "skippedMissingName": 0,
                "skippedMedication": 0,
                "skippedDuplicateGtin": 0,
                "errors": total_page_errors + 1,
            }
        token = login(args.api_base, args.login_endpoint, args.email, args.password)
        args.token = token

    totals = import_api(
        api_base=args.api_base,
        token=token,
        import_endpoint=args.import_endpoint,
        confidence=args.confidence,
        skip_medication=args.skip_medication,
        batch_size=args.batch_size,
        records=records,
    )
    print("api import summary")
    print(json.dumps(totals, ensure_ascii=False, indent=2))

    return {
        "status": "SUCCESS" if int(totals.get("errors", 0)) == 0 else "FAILED",
        "message": "Ciclo concluido com importacao via API.",
        "summary": summary,
        "scannedProducts": int(totals.get("scannedProducts", len(records))),
        "importedProducts": int(totals.get("importedProducts", 0)),
        "skippedInvalidGtin": int(totals.get("skippedInvalidGtin", 0)),
        "skippedMissingName": int(totals.get("skippedMissingName", 0)),
        "skippedMedication": int(totals.get("skippedMedication", 0)),
        "skippedDuplicateGtin": int(totals.get("skippedDuplicateGtin", 0)),
        "errors": int(totals.get("errors", 0)) + total_page_errors,
    }


def main() -> int:
    args = parse_args()
    output_path = Path(args.output).resolve()
    config_path = Path(args.config).resolve()
    images_dir = Path(args.images_dir).resolve()

    def resolve_cycle_inputs() -> Tuple[Crawler, List[Source], Optional[str], int]:
        if args.config_api_endpoint:
            if not args.api_base:
                raise ValueError("For --config-api-endpoint you must provide --api-base")
            cycle_token = norm_text(args.token)
            if not cycle_token:
                if not args.email or not args.password:
                    raise ValueError("For API config provide --token or --email/--password")
                cycle_token = login(args.api_base, args.login_endpoint, args.email, args.password)
            user_agent, dynamic_sources, dynamic_interval = load_config_from_api(
                args.api_base,
                args.config_api_endpoint,
                cycle_token,
            )
            return (
                Crawler(
                    user_agent=user_agent,
                    ignore_robots=args.ignore_robots,
                    enable_browser_simulation=args.enable_browser_simulation,
                ),
                dynamic_sources,
                cycle_token,
                dynamic_interval,
            )

        if not config_path.exists():
            raise ValueError(f"config file not found: {config_path}")
        user_agent, local_sources = load_config(config_path)
        return (
            Crawler(
                user_agent=user_agent,
                ignore_robots=args.ignore_robots,
                enable_browser_simulation=args.enable_browser_simulation,
            ),
            local_sources,
            None,
            args.interval_minutes,
        )

    def run_with_reporting(
        crawler: Crawler,
        sources: Sequence[Source],
        token: str,
        run_id: str,
    ) -> int:
        try:
            image_store = ImageStore(images_dir, args.max_image_bytes, crawler.user_agent) if args.download_images else None
            result = run_cycle(args, crawler, sources, output_path, image_store)
        except Exception as exc:
            result = {
                "status": "FAILED",
                "message": f"cycle failed: {exc}",
                "summary": [{"provider": s.provider, "source": s.name} for s in sources],
                "scannedProducts": 0,
                "importedProducts": 0,
                "skippedInvalidGtin": 0,
                "skippedMissingName": 0,
                "skippedMedication": 0,
                "skippedDuplicateGtin": 0,
                "errors": 1,
            }
            print(result["message"], file=sys.stderr)

        if run_id and token and args.api_base:
            finish_remote_run(args.api_base, args.runs_finish_endpoint, token, run_id, result)

        return 0 if result.get("status") != "FAILED" else 1

    def ensure_token(current_token: Optional[str]) -> str:
        token = norm_text(current_token or args.token)
        if token:
            return token
        if args.api_base and args.email and args.password:
            token = login(args.api_base, args.login_endpoint, args.email, args.password)
            args.token = token
            return token
        return ""

    if not args.watch:
        try:
            crawler, sources, cycle_token, _ = resolve_cycle_inputs()
            token = ensure_token(cycle_token)
            run_id = ""
            if token and args.api_base:
                run_id = start_remote_run(
                    args.api_base,
                    args.runs_start_endpoint,
                    token,
                    args.worker_name,
                    sources,
                    "Execucao iniciada manualmente do servico Python.",
                ) or ""
            return run_with_reporting(crawler, sources, token, run_id)
        except Exception as exc:
            print(f"cycle failed: {exc}", file=sys.stderr)
            return 1

    poll_seconds = max(5, int(args.manual_poll_seconds))
    next_scheduled_at = time.time()
    print(f"watch mode enabled interval={args.interval_minutes}m poll={poll_seconds}s")
    while True:
        try:
            crawler, sources, cycle_token, dynamic_interval = resolve_cycle_inputs()
            token = ensure_token(cycle_token)
            interval_seconds = max(60, int(dynamic_interval) * 60)

            claimed = None
            run_id = ""
            now = time.time()
            if token and args.api_base:
                claimed = claim_remote_run(args.api_base, args.runs_claim_endpoint, token, args.worker_name)

            should_run_scheduled = now >= next_scheduled_at
            if claimed is None and not should_run_scheduled:
                time.sleep(poll_seconds)
                continue

            if should_run_scheduled:
                next_scheduled_at = time.time() + interval_seconds

            if claimed is not None and claimed.get("id"):
                run_id = str(claimed.get("id"))
                print(f"manual run claimed id={run_id}")
            elif token and args.api_base:
                run_id = start_remote_run(
                    args.api_base,
                    args.runs_start_endpoint,
                    token,
                    args.worker_name,
                    sources,
                    "Execucao automatica por intervalo.",
                ) or ""

            code = run_with_reporting(crawler, sources, token, run_id)
            if code != 0 and claimed is None:
                time.sleep(poll_seconds)
                continue
        except KeyboardInterrupt:
            print("stopped by user")
            return 0
        except Exception as exc:
            print(f"cycle failed: {exc}", file=sys.stderr)
            time.sleep(poll_seconds)


if __name__ == "__main__":
    raise SystemExit(main())
