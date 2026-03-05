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
PRICE_META_RE = re.compile(
    r"""<meta[^>]+(?:property|name)=["']product:price:amount["'][^>]+content=["']([^"']+)["']""",
    re.I,
)
GTIN_HINT_RE = re.compile(
    r"(?:ean|gtin|c[o\u00f3]digo\s*de\s*barras|codigo\s*de\s*barras)[^0-9]{0,12}([0-9]{8,14})",
    re.I,
)
URL_CODE_RE = re.compile(r"([0-9]{8,14})")


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
        return Source(
            name=str(obj.get("name") or "").strip(),
            provider=str(obj.get("provider") or "").strip(),
            source_license=str(obj.get("sourceLicense") or "").strip() or "Public website data",
            seeds=[str(v).strip() for v in obj.get("seeds", []) if str(v).strip()],
            allowed_domains=[str(v).strip().lower() for v in obj.get("allowedDomains", []) if str(v).strip()],
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
    package_description: str
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
            "packageDescription": self.package_description or None,
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
    parser.add_argument("--email", default="")
    parser.add_argument("--password", default="")
    parser.add_argument("--confidence", type=float, default=0.9)
    parser.add_argument("--batch-size", type=int, default=300)
    parser.add_argument("--skip-medication", action=argparse.BooleanOptionalAction, default=True)
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
                package_description=package,
                price=price,
                currency=currency,
                source_url=page_url,
                provider_product_id=provider_id[:128],
                raw_payload=node,
            )

    title = TITLE_META_RE.search(body)
    if not title:
        return None
    name = norm_text(title.group(1))
    if not name:
        return None
    gtin_m = GTIN_HINT_RE.search(body)
    gtin = norm_gtin(gtin_m.group(1) if gtin_m else "")
    url_m = URL_CODE_RE.search(page_url)
    provider_id = gtin or (url_m.group(1) if url_m else f"url-{hashlib.sha1(page_url.encode('utf-8')).hexdigest()[:16]}")
    price_m = PRICE_META_RE.search(body)
    return Record(
        provider=source.provider,
        source_license=source.source_license,
        code=gtin or provider_id,
        name=name[:255],
        brand="",
        category="",
        package_description="",
        price=parse_price(price_m.group(1)) if price_m else None,
        currency="BRL",
        source_url=page_url,
        provider_product_id=provider_id[:128],
        raw_payload={"fallback": True, "title": name},
    )


class Crawler:
    def __init__(self, user_agent: str, ignore_robots: bool):
        self.user_agent = user_agent
        self.ignore_robots = ignore_robots
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

    def crawl(self, source: Source, max_pages_override: int, max_records_override: int) -> Tuple[List[Record], Dict[str, int]]:
        max_pages = max_pages_override or source.max_pages
        max_records = max_records_override or source.max_records
        queue: deque[str] = deque([u for u in [canonical_url(s) for s in source.seeds] if u and same_domain(u, source.allowed_domains)])
        seen: set[str] = set()
        records: Dict[str, Record] = {}
        stats = {"scannedPages": 0, "discoveredLinks": 0, "extractedRecords": 0, "skippedDisallowed": 0, "errors": 0}

        while queue and stats["scannedPages"] < max_pages and len(records) < max_records:
            url = canonical_url(queue.popleft())
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
                        if node.tag.lower().endswith("loc") and node.text:
                            loc = canonical_url(node.text.strip())
                            if loc and same_domain(loc, source.allowed_domains) and loc not in seen:
                                queue.append(loc)
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
                    if link and same_domain(link, source.allowed_domains) and likely_link(source, link) and link not in seen:
                        queue.append(link)
                        stats["discoveredLinks"] += 1

        stats["extractedRecords"] = len(records)
        return list(records.values()), stats


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
                "packageDescription": r.package_description,
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
        w.writerow(["provider", "code", "name", "brand", "category", "price", "currency", "source_url", "provider_product_id"])
        for r in records:
            w.writerow([r.provider, r.code, r.name, r.brand, r.category, r.price if r.price is not None else "", r.currency, r.source_url, r.provider_product_id])
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


def import_api(
    api_base: str,
    token: str,
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

    for (provider, source_license), items in grouped.items():
        for batch in chunks(items, max(1, min(batch_size, 2000))):
            body = {
                "provider": provider,
                "sourceLicense": source_license,
                "confidenceScore": confidence,
                "skipMedication": skip_medication,
                "items": [r.as_import_item() for r in batch],
            }
            resp = requests.post(
                f"{api_base.rstrip('/')}/v1/admin/catalog/import/records",
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


def run_cycle(args: argparse.Namespace, crawler: Crawler, sources: Sequence[Source], output_path: Path) -> int:
    all_records: Dict[str, Record] = {}
    summary: List[Dict[str, Any]] = []

    for source in sources:
        print(f"source={source.name} provider={source.provider} started_at={now_iso()}")
        recs, stats = crawler.crawl(source, args.max_pages_per_source, args.max_records_per_source)
        for r in recs:
            all_records[f"{r.provider}:{r.code}"] = r
        summary.append({"source": source.name, "provider": source.provider, **stats})
        print(
            f"source={source.name} scanned={stats['scannedPages']} "
            f"found={stats['extractedRecords']} links={stats['discoveredLinks']} errors={stats['errors']}"
        )

    records = list(all_records.values())
    write_output(output_path, records, summary)
    print(f"cycle summary: records={len(records)} sources={len(sources)}")

    if args.skip_api_import or not args.api_base:
        if not args.skip_api_import and not args.api_base:
            print("api import skipped: --api-base not provided")
        return 0

    token = norm_text(args.token)
    if not token:
        if not args.email or not args.password:
            print("api import skipped: provide --token or --email/--password")
            return 0
        token = login(args.api_base, args.login_endpoint, args.email, args.password)

    totals = import_api(
        api_base=args.api_base,
        token=token,
        confidence=args.confidence,
        skip_medication=args.skip_medication,
        batch_size=args.batch_size,
        records=records,
    )
    print("api import summary")
    print(json.dumps(totals, ensure_ascii=False, indent=2))
    return 0


def main() -> int:
    args = parse_args()
    output_path = Path(args.output).resolve()
    config_path = Path(args.config).resolve()

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
            return Crawler(user_agent=user_agent, ignore_robots=args.ignore_robots), dynamic_sources, cycle_token, dynamic_interval

        if not config_path.exists():
            raise ValueError(f"config file not found: {config_path}")
        user_agent, local_sources = load_config(config_path)
        return Crawler(user_agent=user_agent, ignore_robots=args.ignore_robots), local_sources, None, args.interval_minutes

    if not args.watch:
        try:
            crawler, sources, cycle_token, _ = resolve_cycle_inputs()
            if cycle_token:
                args.token = cycle_token
            return run_cycle(args, crawler, sources, output_path)
        except Exception as exc:
            print(f"cycle failed: {exc}", file=sys.stderr)
            return 1

    print(f"watch mode enabled interval={args.interval_minutes}m")
    while True:
        try:
            crawler, sources, cycle_token, dynamic_interval = resolve_cycle_inputs()
            if cycle_token:
                args.token = cycle_token
            code = run_cycle(args, crawler, sources, output_path)
            if code != 0:
                return code
            wait = max(60, int(dynamic_interval) * 60)
        except KeyboardInterrupt:
            print("stopped by user")
            return 0
        except Exception as exc:
            print(f"cycle failed: {exc}", file=sys.stderr)
            wait = max(60, int(args.interval_minutes) * 60)
        print(f"sleeping {max(1, wait // 60)} minutes")
        time.sleep(wait)


if __name__ == "__main__":
    raise SystemExit(main())
