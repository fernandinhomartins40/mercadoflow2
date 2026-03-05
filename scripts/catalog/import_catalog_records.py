#!/usr/bin/env python3
"""Import extracted catalog records into MercadoFlow admin API.

Usage example:
python scripts/catalog/import_catalog_records.py \
  --input data/catalog/infoprice_products.json \
  --api-base http://localhost:8080/api \
  --email admin@mercadoflow.com \
  --password <senha-admin> \
  --provider INFOPRICE_ISA
"""

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any, Dict, Iterable, List

import requests

GTIN_REGEX = re.compile(r"^\d{8,14}$")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import catalog records through admin API")
    parser.add_argument("--input", required=True, help="Path to extracted JSON file")
    parser.add_argument("--api-base", default="http://localhost:8080/api", help="API base URL")
    parser.add_argument("--token", default="", help="Bearer token (optional if email/password is provided)")
    parser.add_argument("--email", default="", help="Admin email for login")
    parser.add_argument("--password", default="", help="Admin password for login")
    parser.add_argument("--provider", default="INFOPRICE_ISA", help="Provider label")
    parser.add_argument("--source-license", default="InfoPrice ISA - uso autorizado pelo cliente", help="Source license string")
    parser.add_argument("--confidence", type=float, default=0.93, help="Confidence score [0,1]")
    parser.add_argument(
        "--skip-medication",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Skip potential medications (use --no-skip-medication to disable)",
    )
    parser.add_argument("--batch-size", type=int, default=300, help="Records per request")
    return parser.parse_args()


def load_items(path: Path) -> List[Dict[str, Any]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(payload, dict) and isinstance(payload.get("items"), list):
        return payload["items"]
    if isinstance(payload, list):
        return payload
    raise ValueError("Input JSON must be an array or an object with an 'items' array")


def chunks(items: List[Dict[str, Any]], size: int) -> Iterable[List[Dict[str, Any]]]:
    for start in range(0, len(items), size):
        yield items[start:start + size]


def login_and_get_token(api_base: str, email: str, password: str) -> str:
    response = requests.post(
        f"{api_base.rstrip('/')}/v1/auth/login",
        json={"email": email, "password": password, "keepConnected": True},
        timeout=60,
    )
    response.raise_for_status()
    token = response.json().get("token")
    if not token:
        raise RuntimeError("Login succeeded but token was not returned")
    return token


def post_import_batch(
    api_base: str,
    token: str,
    provider: str,
    source_license: str,
    confidence: float,
    skip_medication: bool,
    batch: List[Dict[str, Any]],
) -> Dict[str, Any]:
    body = {
        "provider": provider,
        "sourceLicense": source_license,
        "confidenceScore": confidence,
        "skipMedication": skip_medication,
        "items": [
            {
                "code": item.get("code") or item.get("gtin") or item.get("ean"),
                "name": item.get("name") or item.get("canonicalName") or item.get("description"),
                "brand": item.get("brand"),
                "category": item.get("category"),
                "packageDescription": item.get("packageDescription") or item.get("package"),
                "rawPayload": json.dumps(item, ensure_ascii=False),
            }
            for item in batch
        ],
    }

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    batch_url = f"{api_base.rstrip('/')}/v1/admin/catalog/import/records"
    response = requests.post(batch_url, json=body, headers=headers, timeout=120)
    if response.ok:
        return response.json()

    fallback_expected = response.status_code == 404
    if not fallback_expected:
        try:
            payload = response.json()
            message = str(payload.get("message") or "").lower()
            fallback_expected = "no static resource" in message
        except Exception:
            fallback_expected = False

    if not fallback_expected:
        response.raise_for_status()

    print("batch endpoint unavailable, falling back to per-item import (/catalog/enrichments)")
    return import_items_one_by_one(api_base, headers, provider, source_license, confidence, batch)


def normalize_gtin(value: Any) -> str:
    if value is None:
        return ""
    digits = "".join(ch for ch in str(value) if ch.isdigit())
    if not GTIN_REGEX.match(digits):
        return ""
    if set(digits) == {"0"}:
        return ""
    return digits


def import_items_one_by_one(
    api_base: str,
    headers: Dict[str, str],
    provider: str,
    source_license: str,
    confidence: float,
    batch: List[Dict[str, Any]],
) -> Dict[str, Any]:
    scanned = len(batch)
    imported = 0
    skipped_invalid = 0
    skipped_missing_name = 0
    errors = 0

    for item in batch:
        gtin = normalize_gtin(item.get("code") or item.get("gtin") or item.get("ean"))
        name = (item.get("name") or item.get("canonicalName") or item.get("description") or "").strip()

        if not gtin:
            skipped_invalid += 1
            continue
        if not name:
            skipped_missing_name += 1
            continue

        payload = {
            "gtin": gtin,
            "provider": provider,
            "providerProductId": str(item.get("code") or gtin),
            "canonicalName": name,
            "brand": item.get("brand"),
            "category": item.get("category"),
            "packageDescription": item.get("packageDescription") or item.get("package"),
            "rawPayload": json.dumps(item, ensure_ascii=False),
            "sourceLicense": source_license,
            "confidenceScore": confidence,
        }

        try:
            res = requests.post(
                f"{api_base.rstrip('/')}/v1/admin/catalog/enrichments",
                json=payload,
                headers=headers,
                timeout=60,
            )
            if res.ok:
                imported += 1
            else:
                errors += 1
        except Exception:
            errors += 1

    return {
        "scannedProducts": scanned,
        "importedProducts": imported,
        "skippedInvalidGtin": skipped_invalid,
        "skippedMissingName": skipped_missing_name,
        "skippedMedication": 0,
        "skippedDuplicateGtin": 0,
        "errors": errors,
    }


def main() -> int:
    args = parse_args()
    input_path = Path(args.input).resolve()

    if not input_path.exists():
        print(f"input file not found: {input_path}", file=sys.stderr)
        return 1

    try:
        items = load_items(input_path)
    except Exception as exc:
        print(f"failed to read input: {exc}", file=sys.stderr)
        return 1

    if not items:
        print("no items to import")
        return 0

    token = args.token.strip()
    if not token:
        if not args.email or not args.password:
            print("provide --token or both --email and --password", file=sys.stderr)
            return 1
        try:
            token = login_and_get_token(args.api_base, args.email, args.password)
        except Exception as exc:
            print(f"login failed: {exc}", file=sys.stderr)
            return 1

    batch_size = max(1, min(args.batch_size, 2000))
    total_scanned = 0
    total_imported = 0
    total_invalid = 0
    total_missing_name = 0
    total_medication = 0
    total_duplicate = 0
    total_errors = 0

    try:
        for index, batch in enumerate(chunks(items, batch_size), start=1):
            result = post_import_batch(
                args.api_base,
                token,
                args.provider,
                args.source_license,
                args.confidence,
                args.skip_medication,
                batch,
            )
            total_scanned += int(result.get("scannedProducts", 0))
            total_imported += int(result.get("importedProducts", 0))
            total_invalid += int(result.get("skippedInvalidGtin", 0))
            total_missing_name += int(result.get("skippedMissingName", 0))
            total_medication += int(result.get("skippedMedication", 0))
            total_duplicate += int(result.get("skippedDuplicateGtin", 0))
            total_errors += int(result.get("errors", 0))
            print(
                f"batch={index} scanned={result.get('scannedProducts', 0)} "
                f"imported={result.get('importedProducts', 0)} invalid={result.get('skippedInvalidGtin', 0)}"
            )
    except Exception as exc:
        print(f"import failed: {exc}", file=sys.stderr)
        return 1

    print("import summary")
    print(f"  scanned:           {total_scanned}")
    print(f"  imported:          {total_imported}")
    print(f"  skipped invalid:   {total_invalid}")
    print(f"  skipped no name:   {total_missing_name}")
    print(f"  skipped medication:{total_medication}")
    print(f"  skipped duplicate: {total_duplicate}")
    print(f"  errors:            {total_errors}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
