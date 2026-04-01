#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional
from urllib.parse import urljoin

import requests

JSON_LD_RE = re.compile(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', re.I | re.S)
DATA_CARD_RE = re.compile(
    r'(?P<tag><[^>]*(?:data-(?:name|title|product-name|price|gtin|ean|barcode|brand|category)[^>]*>))',
    re.I | re.S,
)
PRICE_RE = re.compile(r'R\$\s*([\d\.\,]+)')
TAG_ATTR_RE = re.compile(r'data-([a-z0-9_-]+)=["\']([^"\']+)["\']', re.I)
TITLE_RE = re.compile(r'title=["\']([^"\']+)["\']', re.I)
GTIN_RE = re.compile(r"\b\d{8,14}\b")


@dataclass
class CollectorRecord:
    productName: str
    gtin: str = ""
    brand: str = ""
    category: str = ""
    packageDescription: str = ""
    unit: str = ""
    observedState: str = ""
    observedCity: str = ""
    observedStore: str = ""
    observedStoreId: str = ""
    providerProductId: str = ""
    sourceUrl: str = ""
    price: str = ""
    currency: str = "BRL"
    observedAt: str = ""
    rawPayload: str = ""

    def as_dict(self) -> Dict[str, Any]:
        payload = self.__dict__.copy()
        payload["price"] = self.price
        return payload


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Collect or import state price records")
    parser.add_argument("--input", help="JSON or HTML file containing source data")
    parser.add_argument("--url", help="Fetch a raw HTML page and parse product cards")
    parser.add_argument("--base-url", help="Base URL used to resolve relative links")
    parser.add_argument("--query", default="", help="Search term appended to the URL template")
    parser.add_argument("--url-template", help="Template with {query} placeholder")
    parser.add_argument("--provider", required=True, help="Provider code")
    parser.add_argument("--name", default="", help="Display name for the source")
    parser.add_argument("--state-code", default="", help="Primary state code")
    parser.add_argument("--service-name", default="", help="Service name")
    parser.add_argument("--service-url", default="", help="Service URL")
    parser.add_argument("--coverage-states", default="", help="Comma separated coverage states")
    parser.add_argument("--notes", default="", help="Source notes")
    parser.add_argument("--currency", default="BRL", help="Currency code")
    parser.add_argument("--api-base", default="http://localhost:8080/api", help="MercadoFlow API base URL")
    parser.add_argument("--login-endpoint", default="/v1/super-admin/auth/login", help="Login endpoint")
    parser.add_argument("--import-endpoint", default="/v1/state-prices/import", help="State price import endpoint")
    parser.add_argument("--email", default="", help="Admin email")
    parser.add_argument("--password", default="", help="Admin password")
    parser.add_argument("--token", default="", help="Bearer token")
    parser.add_argument("--import", dest="do_import", action="store_true", help="Send the collected payload directly to the API")
    parser.add_argument("--output", default="", help="Write collected payload to this JSON file")
    parser.add_argument("--timeout", type=int, default=30, help="HTTP timeout for the source page")
    return parser.parse_args()


def norm_text(value: Any) -> str:
    if value is None:
        return ""
    return " ".join(str(value).split()).strip()


def norm_gtin(value: Any) -> str:
    digits = "".join(ch for ch in str(value or "") if ch.isdigit())
    if GTIN_RE.fullmatch(digits or "") and set(digits) != {"0"}:
        return digits
    return ""


def normalize_price(value: Any) -> str:
    text = norm_text(value)
    if not text:
        return ""
    if text.startswith("R$"):
        text = text[2:].strip()
    text = text.replace(" ", "")
    if "," in text and "." in text:
        if text.rfind(",") > text.rfind("."):
            text = text.replace(".", "").replace(",", ".")
        else:
            text = text.replace(",", "")
    elif "," in text:
        text = text.replace(".", "").replace(",", ".")
    try:
        return f"{float(text):.2f}"
    except Exception:
        return ""


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def fetch_text(url: str, timeout: int) -> str:
    response = requests.get(url, timeout=timeout, headers={"User-Agent": "Mozilla/5.0"})
    response.raise_for_status()
    return response.text


def load_input(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def extract_jsonld_records(html: str, base_url: str, default_state: str, source_url: str) -> List[CollectorRecord]:
    records: List[CollectorRecord] = []
    for match in JSON_LD_RE.finditer(html):
        raw = match.group(1).strip()
        if not raw:
            continue
        try:
            payload = json.loads(raw)
        except Exception:
            continue

        nodes: List[Dict[str, Any]] = []
        if isinstance(payload, dict):
            if "@graph" in payload and isinstance(payload["@graph"], list):
                nodes.extend([node for node in payload["@graph"] if isinstance(node, dict)])
            else:
                nodes.append(payload)
        elif isinstance(payload, list):
            nodes.extend([node for node in payload if isinstance(node, dict)])

        for node in nodes:
            node_type = norm_text(node.get("@type") or node.get("type")).lower()
            if node_type not in {"product", "offer", "productgroup", "productmodel"}:
                continue
            name = norm_text(node.get("name") or node.get("title"))
            if not name:
                continue
            offers = node.get("offers")
            price = ""
            currency = "BRL"
            if isinstance(offers, dict):
                price = normalize_price(offers.get("price") or offers.get("lowPrice") or offers.get("highPrice"))
                currency = norm_text(offers.get("priceCurrency") or currency) or "BRL"
            elif isinstance(offers, list) and offers:
                first_offer = next((offer for offer in offers if isinstance(offer, dict)), None)
                if first_offer:
                    price = normalize_price(first_offer.get("price"))
                    currency = norm_text(first_offer.get("priceCurrency") or currency) or "BRL"
            if not price:
                continue
            record = CollectorRecord(
                productName=name,
                gtin=norm_gtin(node.get("gtin") or node.get("sku") or node.get("barcode")),
                brand=norm_text(node.get("brand") if not isinstance(node.get("brand"), dict) else node.get("brand", {}).get("name")),
                category=norm_text(node.get("category")),
                packageDescription=norm_text(node.get("description")),
                unit=norm_text(node.get("unitText") or node.get("unit")),
                observedState=default_state,
                observedCity="",
                observedStore="",
                observedStoreId="",
                providerProductId=norm_text(node.get("sku") or node.get("productID") or node.get("identifier") or name),
                sourceUrl=urljoin(base_url, source_url) if source_url else base_url,
                price=price,
                currency=currency,
                observedAt=utc_now_iso(),
                rawPayload=json.dumps(node, ensure_ascii=False),
            )
            records.append(record)
    return records


def extract_data_card_records(html: str, base_url: str, default_state: str, source_url: str) -> List[CollectorRecord]:
    records: List[CollectorRecord] = []
    for card in DATA_CARD_RE.finditer(html):
        tag = card.group("tag")
        attrs = {match.group(1).lower(): norm_text(match.group(2)) for match in TAG_ATTR_RE.finditer(tag)}
        title = attrs.get("name") or attrs.get("title") or attrs.get("product-name")
        if not title:
            title_match = TITLE_RE.search(tag)
            title = norm_text(title_match.group(1)) if title_match else ""
        if not title:
            continue
        price = normalize_price(attrs.get("price"))
        if not price:
            price_match = PRICE_RE.search(tag)
            price = normalize_price(price_match.group(1)) if price_match else ""
        if not price:
            continue
        record = CollectorRecord(
            productName=title,
            gtin=norm_gtin(attrs.get("gtin") or attrs.get("ean") or attrs.get("barcode")),
            brand=attrs.get("brand", ""),
            category=attrs.get("category", ""),
            packageDescription=attrs.get("description", ""),
            unit=attrs.get("unit", ""),
            observedState=default_state,
            observedCity=attrs.get("city", ""),
            observedStore=attrs.get("store", ""),
            observedStoreId=attrs.get("store-id", ""),
            providerProductId=attrs.get("product-id") or attrs.get("id") or title,
            sourceUrl=urljoin(base_url, source_url) if source_url else base_url,
            price=price,
            currency=attrs.get("currency", "BRL") or "BRL",
            observedAt=attrs.get("observed-at", utc_now_iso()) or utc_now_iso(),
            rawPayload=tag,
        )
        records.append(record)
    return records


def extract_generic_records(html: str, base_url: str, default_state: str, source_url: str) -> List[CollectorRecord]:
    records = extract_jsonld_records(html, base_url, default_state, source_url)
    if records:
        return dedupe(records)
    records = extract_data_card_records(html, base_url, default_state, source_url)
    if records:
        return dedupe(records)
    return []


def dedupe(records: List[CollectorRecord]) -> List[CollectorRecord]:
    seen: set[tuple[str, str, str, str]] = set()
    unique: List[CollectorRecord] = []
    for record in records:
        key = (
            norm_text(record.productName).lower(),
            norm_gtin(record.gtin),
            norm_text(record.observedState).upper(),
            norm_text(record.providerProductId).lower(),
        )
        if key in seen:
            continue
        seen.add(key)
        unique.append(record)
    return unique


def login(api_base: str, login_endpoint: str, email: str, password: str) -> str:
    path = login_endpoint if login_endpoint.startswith("/") else f"/{login_endpoint}"
    response = requests.post(
        f"{api_base.rstrip('/')}{path}",
        json={"email": email, "password": password, "keepConnected": True},
        timeout=60,
    )
    response.raise_for_status()
    token = response.json().get("token")
    if not token:
        raise RuntimeError("Login succeeded without a token")
    return str(token)


def import_payload(
    api_base: str,
    import_endpoint: str,
    token: str,
    provider: str,
    name: str,
    state_code: str,
    service_name: str,
    service_url: str,
    coverage_states: str,
    notes: str,
    records: List[CollectorRecord],
) -> Dict[str, Any]:
    path = import_endpoint if import_endpoint.startswith("/") else f"/{import_endpoint}"
    response = requests.post(
        f"{api_base.rstrip('/')}{path}",
        json={
            "provider": provider,
            "name": name or provider,
            "stateCode": state_code or None,
            "serviceName": service_name or None,
            "serviceUrl": service_url or None,
            "coverageStates": coverage_states or None,
            "notes": notes or None,
            "observations": [
                {
                    "productName": record.productName,
                    "gtin": record.gtin or None,
                    "brand": record.brand or None,
                    "category": record.category or None,
                    "packageDescription": record.packageDescription or None,
                    "unit": record.unit or None,
                    "observedState": record.observedState or state_code or "",
                    "observedCity": record.observedCity or None,
                    "observedStore": record.observedStore or None,
                    "observedStoreId": record.observedStoreId or None,
                    "providerProductId": record.providerProductId or None,
                    "sourceUrl": record.sourceUrl or service_url or None,
                    "price": record.price,
                    "currency": record.currency or "BRL",
                    "observedAt": record.observedAt or None,
                    "rawPayload": record.rawPayload or None,
                }
                for record in records
            ],
        },
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        timeout=240,
    )
    response.raise_for_status()
    return response.json()


def main() -> int:
    args = parse_args()

    html = ""
    source_url = norm_text(args.service_url)
    if args.input:
        html = load_input(Path(args.input).resolve())
        source_url = source_url or args.input
    elif args.url_template:
        query = requests.utils.quote(args.query or "")
        url = args.url_template.format(query=query)
        html = fetch_text(url, args.timeout)
        source_url = source_url or url
    elif args.url:
        html = fetch_text(args.url, args.timeout)
        source_url = source_url or args.url
    else:
        print("Provide --input, --url or --url-template", file=sys.stderr)
        return 1

    records = extract_generic_records(html, source_url, norm_text(args.state_code).upper(), source_url)
    if not records:
        print("No product records found in the provided source.", file=sys.stderr)
        return 1

    payload = {
        "provider": args.provider,
        "name": args.name or args.provider,
        "stateCode": norm_text(args.state_code).upper() or None,
        "serviceName": args.service_name or None,
        "serviceUrl": args.service_url or source_url or None,
        "coverageStates": args.coverage_states or None,
        "notes": args.notes or None,
        "observations": [record.as_dict() for record in records],
    }

    if args.output:
        Path(args.output).resolve().write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    if not args.do_import:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return 0

    token = args.token.strip()
    if not token:
        if not args.email or not args.password:
            print("Provide --token or both --email and --password to import the payload.", file=sys.stderr)
            return 1
        token = login(args.api_base, args.login_endpoint, args.email, args.password)

    result = import_payload(
        args.api_base,
        args.import_endpoint,
        token,
        args.provider,
        args.name,
        args.state_code,
        args.service_name,
        args.service_url or source_url,
        args.coverage_states,
        args.notes,
        records,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
