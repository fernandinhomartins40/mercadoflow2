#!/usr/bin/env python3
from __future__ import annotations

import io
import re
from pathlib import Path
from typing import Any, Dict

import requests
from PIL import Image, ImageFile, ImageOps

ImageFile.LOAD_TRUNCATED_IMAGES = True

GTIN_RE = re.compile(r"^\d{8,14}$")


def norm_text(value: Any) -> str:
    if value is None:
        return ""
    return " ".join(str(value).split()).strip()


def canonical_url(value: Any) -> str:
    text = norm_text(value)
    if text.startswith("http://") or text.startswith("https://"):
        return text
    return ""


def safe_slug(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_-]+", "-", value).strip("-")[:120] or "item"


def normalize_identity(value: Any) -> str:
    text = norm_text(value)
    digits = "".join(ch for ch in text if ch.isdigit())
    if GTIN_RE.match(digits) and set(digits) != {"0"}:
        return digits
    return safe_slug(text)


class OptimizedImageStore:
    def __init__(self, base_dir: Path, max_bytes: int, user_agent: str):
        self.base_dir = base_dir
        self.max_bytes = max(256_000, int(max_bytes))
        self.base_dir.mkdir(parents=True, exist_ok=True)
        self.cache: Dict[str, str] = {}
        self.session = requests.Session()
        self.session.headers.update(
            {
                "User-Agent": user_agent,
                "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
            }
        )

    def save(self, identity: Any, image_url: Any, timeout_sec: int = 25) -> str:
        url = canonical_url(image_url)
        if not url:
            return ""
        cached = self.cache.get(url)
        if cached:
            return cached

        key = self._build_storage_key(identity)
        target = self.base_dir / key
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists() and target.is_file() and target.stat().st_size > 0:
            normalized = key.replace("\\", "/")
            self.cache[url] = normalized
            return normalized

        response = self.session.get(url, stream=True, timeout=timeout_sec, allow_redirects=True)
        response.raise_for_status()
        content_type = (response.headers.get("content-type") or "").lower()
        if content_type and not content_type.startswith("image/") and "octet-stream" not in content_type:
            raise RuntimeError("content is not an image")

        payload = io.BytesIO()
        written = 0
        for chunk in response.iter_content(chunk_size=16_384):
            if not chunk:
                continue
            written += len(chunk)
            if written > self.max_bytes:
                raise RuntimeError("image too large")
            payload.write(chunk)

        payload.seek(0)
        normalized_image = self._normalize_image(payload)
        with target.open("wb") as handle:
            normalized_image.save(handle, format="JPEG", quality=82, optimize=True, progressive=True)

        normalized = key.replace("\\", "/")
        self.cache[url] = normalized
        return normalized

    def _build_storage_key(self, identity: Any) -> str:
        return f"products/{normalize_identity(identity)}.jpg"

    def _normalize_image(self, payload: io.BytesIO) -> Image.Image:
        with Image.open(payload) as source:
            image = ImageOps.exif_transpose(source)
            if image.mode in {"RGBA", "LA"} or (image.mode == "P" and "transparency" in image.info):
                background = Image.new("RGBA", image.size, (255, 255, 255, 255))
                background.alpha_composite(image.convert("RGBA"))
                image = background.convert("RGB")
            else:
                image = image.convert("RGB")

            max_side = max(image.size)
            if max_side > 1600:
                image.thumbnail((1600, 1600), Image.Resampling.LANCZOS)
            return image.copy()
