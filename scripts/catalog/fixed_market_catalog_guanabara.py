#!/usr/bin/env python3
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict

from fixed_market_catalog_common import ImportOptions
from fixed_market_catalog_generic import GenericCatalogJobConfig, run_generic_catalog_job


@dataclass(frozen=True)
class GuanabaraJobConfig:
    name: str
    provider: str
    source_license: str
    output: str
    site_base: str
    sitemap_url: str
    product_example_url: str = ""


def run_guanabara_catalog_job(
    job: GuanabaraJobConfig,
    options: ImportOptions,
    max_pages_override: int = 0,
    max_records_override: int = 0,
) -> Dict[str, int | str | list[dict]]:
    seeds = [job.site_base, job.sitemap_url]
    if job.product_example_url:
        seeds.append(job.product_example_url)
    generic_job = GenericCatalogJobConfig(
        name=job.name,
        provider=job.provider,
        source_license=job.source_license,
        output=job.output,
        site_base=job.site_base,
        seeds=seeds,
        allowed_domains=["smguanabaraonline.com.br", "www.smguanabaraonline.com.br", "api.smguanabaraonline.com.br"],
        # O site usa /produtos/ e /categorias/ (plural). Com os hints no singular
        # nenhuma das 16.6k URLs do sitemap era reconhecida como pagina de produto.
        product_path_hints=("/produtos/", "/produto/", "/categorias/", "/categoria/", "/departamento/", "/busca"),
        max_pages=25_000,
        max_records=20_000,
        rate_limit_ms=250,
        timeout_sec=25,
        enable_browser_simulation=True,
    )
    return run_generic_catalog_job(
        generic_job,
        options,
        max_pages_override=max_pages_override,
        max_records_override=max_records_override,
    )
