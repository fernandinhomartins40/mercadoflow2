#!/usr/bin/env python3
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict

from fixed_market_catalog_common import ImportOptions
from fixed_market_catalog_generic import GenericCatalogJobConfig, run_generic_catalog_job


@dataclass(frozen=True)
class SupermercadosOnlineJobConfig:
    name: str
    provider: str
    source_license: str
    output: str
    site_base: str
    sitemap_url: str
    product_example_url: str
    categories_url: str = ""


def run_supermercados_online_catalog_job(
    job: SupermercadosOnlineJobConfig,
    options: ImportOptions,
    max_pages_override: int = 0,
    max_records_override: int = 0,
) -> Dict[str, int | str | list[dict]]:
    seeds = [job.site_base, job.sitemap_url, job.product_example_url]
    if job.categories_url:
        seeds.append(job.categories_url)
    seeds = [seed for seed in seeds if seed]
    generic_job = GenericCatalogJobConfig(
        name=job.name,
        provider=job.provider,
        source_license=job.source_license,
        output=job.output,
        site_base=job.site_base,
        seeds=seeds,
        allowed_domains=[
            job.site_base.replace("https://", "").replace("http://", "").rstrip("/"),
            f"www.{job.site_base.replace('https://', '').replace('http://', '').replace('www.', '').rstrip('/')}",
        ],
        product_path_hints=("/produto/", "/categoria/", "/busca", "/departamento/"),
        max_pages=450,
        max_records=15_000,
        rate_limit_ms=850,
        timeout_sec=25,
        enable_browser_simulation=True,
    )
    return run_generic_catalog_job(
        generic_job,
        options,
        max_pages_override=max_pages_override,
        max_records_override=max_records_override,
    )
