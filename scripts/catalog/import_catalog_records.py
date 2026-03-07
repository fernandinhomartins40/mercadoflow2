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
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence
from urllib.parse import urlparse

import requests

GTIN_REGEX = re.compile(r"^\d{8,14}$")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import catalog records through admin API")
    parser.add_argument("--input", required=True, help="Path to extracted JSON file")
    parser.add_argument("--api-base", default="http://localhost:8080/api", help="API base URL")
    parser.add_argument("--token", default="", help="Bearer token (optional if email/password is provided)")
    parser.add_argument("--email", default="", help="Admin email for login")
    parser.add_argument("--password", default="", help="Admin password for login")
    parser.add_argument("--login-endpoint", default="/v1/auth/login", help="Login endpoint path")
    parser.add_argument("--import-endpoint", default="/v1/admin/catalog/import/records", help="Batch import endpoint path")
    parser.add_argument("--enrichment-endpoint", default="/v1/admin/catalog/enrichments", help="Fallback per-item import endpoint path")
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
    parser.add_argument("--download-images", action=argparse.BooleanOptionalAction, default=True, help="Persist images locally before import")
    parser.add_argument("--images-dir", default="data/catalog/images", help="Directory used to store imported catalog images")
    parser.add_argument("--max-image-bytes", type=int, default=3_000_000, help="Maximum allowed image size")
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


def norm_text(value: Any) -> str:
    if value is None:
        return ""
    return " ".join(str(value).split()).strip()


def norm_gtin(value: Any) -> str:
    digits = "".join(ch for ch in str(value or "") if ch.isdigit())
    if GTIN_REGEX.match(digits) and set(digits) != {"0"}:
        return digits
    return ""


def canonical_url(value: Any) -> str:
    text = norm_text(value)
    if text.startswith("http://") or text.startswith("https://"):
        return text
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


class LocalImageStorage:
    def __init__(self, base_dir: Path, max_bytes: int):
        self.base_dir = base_dir
        self.max_bytes = max(256_000, max_bytes)
        self.base_dir.mkdir(parents=True, exist_ok=True)
        self.cache: Dict[str, str] = {}

    def _safe_name(self, value: str) -> str:
        return re.sub(r"[^a-zA-Z0-9_-]+", "-", value).strip("-")[:120] or "item"

    def save(self, provider: str, code: str, image_url: str) -> str:
        url = canonical_url(image_url)
        if not url:
            return ""
        cached = self.cache.get(url)
        if cached:
            return cached

        response = requests.get(url, stream=True, timeout=25)
        response.raise_for_status()

        provider_part = self._safe_name(provider.lower())
        code_part = self._safe_name(code)
        digest = hashlib.sha1(url.encode("utf-8")).hexdigest()[:10]
        extension = infer_extension(response.headers.get("content-type", ""), url)
        rel = f"{provider_part}/{code_part}-{digest}{extension}"
        target = self.base_dir / rel
        target.parent.mkdir(parents=True, exist_ok=True)

        written = 0
        with target.open("wb") as handle:
            for chunk in response.iter_content(chunk_size=16_384):
                if not chunk:
                    continue
                written += len(chunk)
                if written > self.max_bytes:
                    raise RuntimeError("image too large")
                handle.write(chunk)

        rel_key = rel.replace("\\", "/")
        self.cache[url] = rel_key
        return rel_key


def persist_item_images(items: Sequence[Dict[str, Any]], provider: str, base_dir: Path, max_bytes: int) -> None:
    image_store = LocalImageStorage(base_dir, max_bytes)
    for item in items:
        if not isinstance(item, dict):
            continue
        if norm_text(item.get("imageStorageKey")):
            continue
        image_url = canonical_url(item.get("imageUrl"))
        if not image_url:
            continue
        code = norm_text(item.get("code") or item.get("gtin") or item.get("ean"))
        if not code:
            continue
        try:
            key = image_store.save(provider, code, image_url)
        except Exception:
            key = ""
        if key:
            item["imageStorageKey"] = key


def unique_items_by_gtin(items: Sequence[Dict[str, Any]]) -> tuple[List[Dict[str, Any]], int]:
    unique: List[Dict[str, Any]] = []
    seen_gtins: set[str] = set()
    duplicates = 0
    for item in items:
        if not isinstance(item, dict):
            continue
        gtin = norm_gtin(item.get("code") or item.get("gtin") or item.get("ean"))
        if gtin:
            if gtin in seen_gtins:
                duplicates += 1
                continue
            seen_gtins.add(gtin)
        unique.append(item)
    return unique, duplicates


def login_and_get_token(api_base: str, login_endpoint: str, email: str, password: str) -> str:
    path = login_endpoint if login_endpoint.startswith("/") else f"/{login_endpoint}"
    response = requests.post(
        f"{api_base.rstrip('/')}{path}",
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
    import_endpoint: str,
    enrichment_endpoint: str,
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
                "ncm": item.get("ncm"),
                "unit": item.get("unit"),
                "description": item.get("description"),
                "manufacturer": item.get("manufacturer"),
                "packageDescription": item.get("packageDescription") or item.get("package"),
                "imageUrl": item.get("imageUrl"),
                "imageStorageKey": item.get("imageStorageKey"),
                "attributesJson": item.get("attributesJson"),
                "rawPayload": json.dumps(item, ensure_ascii=False),
            }
            for item in batch
        ],
    }

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    batch_path = import_endpoint if import_endpoint.startswith("/") else f"/{import_endpoint}"
    batch_url = f"{api_base.rstrip('/')}{batch_path}"
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
    return import_items_one_by_one(api_base, headers, provider, source_license, confidence, batch, enrichment_endpoint)


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
    enrichment_endpoint: str,
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
            "ncm": item.get("ncm"),
            "unit": item.get("unit"),
            "description": item.get("description"),
            "manufacturer": item.get("manufacturer"),
            "packageDescription": item.get("packageDescription") or item.get("package"),
            "imageUrl": item.get("imageUrl"),
            "imageStorageKey": item.get("imageStorageKey"),
            "attributesJson": item.get("attributesJson"),
            "rawPayload": json.dumps(item, ensure_ascii=False),
            "sourceLicense": source_license,
            "confidenceScore": confidence,
        }

        try:
            path = enrichment_endpoint if enrichment_endpoint.startswith("/") else f"/{enrichment_endpoint}"
            res = requests.post(
                f"{api_base.rstrip('/')}{path}",
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

    items, local_duplicates = unique_items_by_gtin(items)

    if args.download_images:
        persist_item_images(
            items,
            args.provider,
            Path(args.images_dir).resolve(),
            int(args.max_image_bytes),
        )

    token = args.token.strip()
    if not token:
        if not args.email or not args.password:
            print("provide --token or both --email and --password", file=sys.stderr)
            return 1
        try:
            token = login_and_get_token(args.api_base, args.login_endpoint, args.email, args.password)
        except Exception as exc:
            print(f"login failed: {exc}", file=sys.stderr)
            return 1

    batch_size = max(1, min(args.batch_size, 2000))
    total_scanned = 0
    total_imported = 0
    total_invalid = 0
    total_missing_name = 0
    total_medication = 0
    total_duplicate = local_duplicates
    total_errors = 0

    try:
        for index, batch in enumerate(chunks(items, batch_size), start=1):
            result = post_import_batch(
                args.api_base,
                token,
                args.import_endpoint,
                args.enrichment_endpoint,
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
