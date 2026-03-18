#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json

from fixed_market_catalog_common import ImportOptions
from fixed_market_catalog_vtex import VtexJobConfig, run_vtex_category_tree_job


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Extract + import Festval catalog")
    parser.add_argument("--page-size", type=int, default=50)
    parser.add_argument("--max-pages", type=int, default=0)
    parser.add_argument("--output", default="data/catalog/festval_web_br_catalog")
    parser.add_argument("--do-import", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--api-base", default="https://mercadoflow.com/api")
    parser.add_argument("--login-endpoint", default="/v1/super-admin/auth/login")
    parser.add_argument("--import-endpoint", default="/v1/admin/catalog/import/records")
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--confidence", type=float, default=0.96)
    parser.add_argument("--batch-size", type=int, default=300)
    parser.add_argument("--download-images", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--images-dir", default="data/catalog/images")
    parser.add_argument("--max-image-bytes", type=int, default=3_000_000)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    job = VtexJobConfig(
        name="Festval",
        provider="FESTVAL_WEB_BR",
        source_license="Public website/API data (respect provider terms and robots)",
        output=args.output,
        site_base="https://www.festval.com",
        catalog_api_base="https://www.festval.com",
        mode="category-tree",
        category_tree_url="https://www.festval.com/api/catalog_system/pub/category/tree/20",
        sitemap_index_url="https://www.festval.com/sitemap.xml",
        catalog_retry_attempts=6,
        catalog_min_interval_seconds=0.2,
        brand_resolve_workers=3,
    )
    options = ImportOptions(
        provider=job.provider,
        source_license=job.source_license,
        api_base=args.api_base,
        login_endpoint=args.login_endpoint,
        import_endpoint=args.import_endpoint,
        email=args.email,
        password=args.password,
        confidence=args.confidence,
        batch_size=args.batch_size,
        skip_medication=False,
        do_import=args.do_import,
        download_images=args.download_images,
        images_dir=args.images_dir,
        max_image_bytes=args.max_image_bytes,
        output=job.output,
    )
    result = run_vtex_category_tree_job(
        job,
        options,
        page_size=max(10, min(50, args.page_size)),
        max_pages_per_leaf=max(0, args.max_pages),
        residual_product_workers=4,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result.get("status") != "FAILED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
