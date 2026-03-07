#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Set, Tuple
from urllib.parse import urlparse

import requests

GTIN_RE = re.compile(r"^\d{8,14}$")


def norm_text(value: Any) -> str:
    if value is None:
        return ""
    return " ".join(str(value).split()).strip()


def norm_gtin(value: Any) -> str:
    digits = "".join(ch for ch in str(value or "") if ch.isdigit())
    if not GTIN_RE.match(digits):
        return ""
    if set(digits) == {"0"}:
        return ""
    return digits


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


def safe_slug(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_-]+", "-", value).strip("-")[:120] or "item"


def normalize_key(value: Any) -> str:
    text = norm_text(value).lower()
    if not text:
        return ""
    normalized = unicodedata.normalize("NFKD", text)
    ascii_only = "".join(ch for ch in normalized if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9]+", " ", ascii_only).strip()


def provider_output_base(provider: str, output: str = "") -> Path:
    if output:
        return Path(output).resolve()
    return Path("data/catalog").joinpath(f"{safe_slug(provider.lower())}_catalog").resolve()


def empty_totals() -> Dict[str, int]:
    return {
        "scannedProducts": 0,
        "importedProducts": 0,
        "skippedInvalidGtin": 0,
        "skippedMissingName": 0,
        "skippedMedication": 0,
        "skippedDuplicateGtin": 0,
        "errors": 0,
    }


@dataclass
class ImportOptions:
    provider: str
    source_license: str
    api_base: str = "https://mercadoflow.com/api"
    login_endpoint: str = "/v1/super-admin/auth/login"
    import_endpoint: str = "/v1/admin/catalog/import/records"
    email: str = ""
    password: str = ""
    confidence: float = 0.96
    batch_size: int = 300
    skip_medication: bool = False
    do_import: bool = True
    download_images: bool = True
    images_dir: str = "data/catalog/images"
    max_image_bytes: int = 3_000_000
    output: str = ""


class RunCancelled(Exception):
    pass


class LocalImageStorage:
    def __init__(self, base_dir: Path, max_bytes: int):
        self.base_dir = base_dir
        self.max_bytes = max(256_000, int(max_bytes))
        self.base_dir.mkdir(parents=True, exist_ok=True)
        self.cache: Dict[str, str] = {}
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": "Mozilla/5.0 (compatible; MercadoFlowCatalogHarvester/1.0)"})

    def save(self, provider: str, code: str, image_url: str) -> str:
        url = canonical_url(image_url)
        if not url:
            return ""
        cached = self.cache.get(url)
        if cached:
            return cached

        response = self.session.get(url, stream=True, timeout=25)
        response.raise_for_status()

        provider_part = safe_slug(provider.lower())
        code_part = safe_slug(code)
        digest = hashlib.sha1(url.encode("utf-8")).hexdigest()[:10]
        extension = infer_extension(response.headers.get("content-type", ""), url)
        relative = f"{provider_part}/{code_part}-{digest}{extension}"
        target = self.base_dir / relative
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

        key = relative.replace("\\", "/")
        self.cache[url] = key
        return key


class AuditWriter:
    def __init__(self, base_path: Path):
        self.base_path = base_path
        self.records_path = base_path.with_suffix(".jsonl")
        self.manifest_path = base_path.with_suffix(".manifest.json")
        self.records_path.parent.mkdir(parents=True, exist_ok=True)
        self.handle = self.records_path.open("w", encoding="utf-8")
        self.count = 0

    def write(self, record: Dict[str, Any]) -> None:
        self.handle.write(json.dumps(record, ensure_ascii=False) + "\n")
        self.count += 1

    def finalize(self, payload: Dict[str, Any]) -> Path:
        self.handle.flush()
        self.handle.close()
        manifest = {
            **payload,
            "count": self.count,
            "recordsFile": str(self.records_path),
        }
        self.manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
        return self.manifest_path


def normalize_record(record: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "code": norm_text(record.get("code")),
        "name": norm_text(record.get("name"))[:255],
        "brand": norm_text(record.get("brand"))[:120],
        "category": norm_text(record.get("category"))[:255],
        "ncm": norm_text(record.get("ncm"))[:32],
        "unit": norm_text(record.get("unit"))[:32],
        "description": norm_text(record.get("description"))[:2048],
        "manufacturer": norm_text(record.get("manufacturer"))[:255],
        "packageDescription": norm_text(record.get("packageDescription"))[:255],
        "imageUrl": canonical_url(record.get("imageUrl")),
        "imageStorageKey": norm_text(record.get("imageStorageKey"))[:255],
        "attributesJson": record.get("attributesJson") or "",
        "price": record.get("price"),
        "currency": norm_text(record.get("currency") or "BRL")[:16] or "BRL",
        "sourceUrl": canonical_url(record.get("sourceUrl")),
        "providerProductId": norm_text(record.get("providerProductId"))[:128],
        "rawPayload": record.get("rawPayload") or "",
    }


def login_super_admin(api_base: str, endpoint: str, email: str, password: str) -> str:
    path = endpoint if endpoint.startswith("/") else f"/{endpoint}"
    response = requests.post(
        f"{api_base.rstrip('/')}{path}",
        json={"email": email, "password": password, "keepConnected": True},
        timeout=60,
    )
    response.raise_for_status()
    token = response.json().get("token")
    if not token:
        raise RuntimeError("Super admin login succeeded without token")
    return str(token)


def import_records(options: ImportOptions, token: str, records: List[Dict[str, Any]]) -> Dict[str, int]:
    path = options.import_endpoint if options.import_endpoint.startswith("/") else f"/{options.import_endpoint}"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    response = requests.post(
        f"{options.api_base.rstrip('/')}{path}",
        headers=headers,
        json={
            "provider": options.provider,
            "sourceLicense": options.source_license,
            "confidenceScore": options.confidence,
            "skipMedication": options.skip_medication,
            "items": [
                {
                    "code": item.get("code"),
                    "name": item.get("name"),
                    "brand": item.get("brand"),
                    "category": item.get("category"),
                    "ncm": item.get("ncm"),
                    "unit": item.get("unit"),
                    "description": item.get("description"),
                    "manufacturer": item.get("manufacturer"),
                    "packageDescription": item.get("packageDescription"),
                    "imageUrl": item.get("imageUrl"),
                    "imageStorageKey": item.get("imageStorageKey"),
                    "attributesJson": item.get("attributesJson"),
                    "rawPayload": item.get("rawPayload"),
                }
                for item in records
            ],
        },
        timeout=240,
    )
    response.raise_for_status()
    payload = response.json()
    return {key: int(payload.get(key, 0)) for key in empty_totals()}


class MarketImportSession:
    def __init__(self, options: ImportOptions, cancel_check: Optional[Callable[[], bool]] = None):
        self.options = options
        self.cancel_check = cancel_check
        self.output_base = provider_output_base(options.provider, options.output)
        self.audit = AuditWriter(self.output_base)
        self.image_store = LocalImageStorage(Path(options.images_dir).resolve(), options.max_image_bytes) if options.download_images else None
        self.pending: List[Dict[str, Any]] = []
        self.totals = empty_totals()
        self.captured = 0
        self.images_saved = 0
        self.token = ""
        self.seen_gtins: Set[str] = set()

    def is_cancelled(self) -> bool:
        return bool(self.cancel_check and self.cancel_check())

    def ensure_not_cancelled(self) -> None:
        if self.is_cancelled():
            raise RunCancelled("run cancelled by super admin")

    def push(self, record: Dict[str, Any]) -> None:
        self.ensure_not_cancelled()
        normalized = normalize_record(record)
        gtin = norm_gtin(normalized.get("code"))
        if gtin:
            if gtin in self.seen_gtins:
                self.totals["skippedDuplicateGtin"] += 1
                return
            self.seen_gtins.add(gtin)
        code = norm_text(normalized.get("code") or normalized.get("providerProductId"))
        if self.image_store is not None and normalized.get("imageUrl") and not normalized.get("imageStorageKey") and code:
            try:
                key = self.image_store.save(self.options.provider, code, str(normalized.get("imageUrl")))
            except Exception:
                key = ""
            if key:
                normalized["imageStorageKey"] = key
                self.images_saved += 1

        if isinstance(normalized.get("rawPayload"), (dict, list)):
            normalized["rawPayload"] = json.dumps(normalized["rawPayload"], ensure_ascii=False)
        self.audit.write(normalized)
        self.pending.append(normalized)
        self.captured += 1

        if len(self.pending) >= max(1, min(int(self.options.batch_size), 1500)):
            self.flush()

    def ensure_token(self) -> str:
        if self.token:
            return self.token
        if not self.options.email or not self.options.password:
            raise RuntimeError("Missing super admin credentials for import")
        self.token = login_super_admin(
            self.options.api_base,
            self.options.login_endpoint,
            self.options.email,
            self.options.password,
        )
        return self.token

    def flush(self) -> None:
        self.ensure_not_cancelled()
        if not self.pending:
            return
        batch = list(self.pending)
        self.pending.clear()
        if not self.options.do_import:
            self.totals["scannedProducts"] += len(batch)
            return
        token = self.ensure_token()
        result = import_records(self.options, token, batch)
        for key, value in result.items():
            self.totals[key] += int(value)

    def finalize(self, manifest_extra: Dict[str, Any], flush_pending: bool = True) -> Tuple[Dict[str, int], Path]:
        if flush_pending:
            self.flush()
        if not self.options.do_import:
            self.totals["scannedProducts"] = self.captured
        manifest = self.audit.finalize(
            {
                **manifest_extra,
                "provider": self.options.provider,
                "sourceLicense": self.options.source_license,
                "imagesSaved": self.images_saved,
                "capturedProducts": self.captured,
                "totals": self.totals,
            }
        )
        return self.totals, manifest
