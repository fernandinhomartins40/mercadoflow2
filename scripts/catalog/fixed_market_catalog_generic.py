#!/usr/bin/env python3
from __future__ import annotations

import argparse
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Sequence

from optimized_image_store import OptimizedImageStore
from supermarket_catalog_service import Crawler, DEFAULT_UA, Source, run_cycle

from fixed_market_catalog_common import ImportOptions


@dataclass(frozen=True)
class GenericCatalogJobConfig:
    name: str
    provider: str
    source_license: str
    output: str
    site_base: str
    seeds: Sequence[str]
    allowed_domains: Sequence[str]
    product_path_hints: Sequence[str] = field(default_factory=lambda: ("/produto/", "/product/", "/p/"))
    max_pages: int = 400
    max_records: int = 12_000
    rate_limit_ms: int = 900
    timeout_sec: int = 25
    ignore_robots: bool = False
    enable_browser_simulation: bool = True


class GenericImageStore:
    def __init__(self, images_dir: Path, max_bytes: int, user_agent: str):
        self._store = OptimizedImageStore(
            base_dir=images_dir,
            max_bytes=max_bytes,
            user_agent=user_agent,
        )

    def store(self, record, timeout_sec: int = 20) -> str:
        try:
            return self._store.save(record.code, record.image_url, timeout_sec=timeout_sec)
        except Exception:
            return ""


def build_generic_args(
    job: GenericCatalogJobConfig,
    options: ImportOptions,
    max_pages_override: int = 0,
    max_records_override: int = 0,
) -> argparse.Namespace:
    return argparse.Namespace(
        output=job.output,
        max_pages_per_source=max_pages_override,
        max_records_per_source=max_records_override,
        skip_api_import=not options.do_import,
        api_base=options.api_base,
        token="",
        login_endpoint=options.login_endpoint,
        import_endpoint=options.import_endpoint,
        email=options.email,
        password=options.password,
        confidence=options.confidence,
        batch_size=options.batch_size,
        skip_medication=options.skip_medication,
        download_images=options.download_images,
        ignore_robots=job.ignore_robots,
        enable_browser_simulation=job.enable_browser_simulation,
    )


def run_generic_catalog_job(
    job: GenericCatalogJobConfig,
    options: ImportOptions,
    max_pages_override: int = 0,
    max_records_override: int = 0,
) -> Dict[str, int | str | List[dict]]:
    args = build_generic_args(job, options, max_pages_override=max_pages_override, max_records_override=max_records_override)
    source = Source(
        name=job.name,
        provider=job.provider,
        source_license=job.source_license,
        seeds=list(job.seeds),
        allowed_domains=list(job.allowed_domains),
        hints=[hint.lower() for hint in job.product_path_hints],
        max_pages=job.max_pages,
        max_records=job.max_records,
        rate_limit_ms=job.rate_limit_ms,
        timeout_sec=job.timeout_sec,
    )
    crawler = Crawler(
        user_agent=DEFAULT_UA,
        ignore_robots=job.ignore_robots,
        enable_browser_simulation=job.enable_browser_simulation,
    )
    output_path = Path(job.output).resolve()
    image_store = (
        GenericImageStore(Path(options.images_dir).resolve(), options.max_image_bytes, DEFAULT_UA)
        if options.download_images
        else None
    )
    return run_cycle(args, crawler, [source], output_path, image_store)
