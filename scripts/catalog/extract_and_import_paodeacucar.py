#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json

from fixed_market_catalog_common import ImportOptions
from fixed_market_catalog_gpa import GpaJobConfig, run_gpa_catalog_job


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Extract + import Pao de Acucar catalog")
    parser.add_argument("--store-id", type=int, default=461)
    parser.add_argument("--max-workers-list", type=int, default=8)
    parser.add_argument("--max-workers-detail", type=int, default=16)
    parser.add_argument("--pause-ms", type=int, default=0)
    parser.add_argument("--output", default="data/catalog/paodeacucar_web_br_catalog")
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
    job = GpaJobConfig(
        name="Pao de Acucar",
        brand="pa",
        store_id=args.store_id,
        provider="PAODEACUCAR_WEB_BR",
        source_license="Public website/API data (respect provider terms and robots)",
        output=args.output,
        site_base="https://www.paodeacucar.com",
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
    result = run_gpa_catalog_job(
        job,
        options,
        max_workers_list=args.max_workers_list,
        max_workers_detail=args.max_workers_detail,
        pause_ms=args.pause_ms,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result.get("status") != "FAILED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
