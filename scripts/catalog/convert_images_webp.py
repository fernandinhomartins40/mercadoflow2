#!/usr/bin/env python3
"""
Converte as fotos do catálogo de JPG/PNG para WebP, sem mudar endereço.

O cadastro continua apontando para products/X.jpg; o backend entrega X.webp
quando X.jpg não existe mais (CatalogImageStorageService.resolveStoragePath).

Segurança (06/10/2026):
  - o WebP é aberto de novo e conferido antes de qualquer coisa;
  - se não ficar ao menos 10% menor, o original fica e o WebP é descartado;
  - o original NÃO é apagado: vai para data/catalog/originals/ (mesmo disco,
    movimento instantâneo). Só se apaga essa pasta depois de conferir as fotos.

Uso (dentro do contêiner de coletores):
  python /workspace/scripts/catalog/convert_images_webp.py --dry-run --limit 200
  python /workspace/scripts/catalog/convert_images_webp.py
"""
from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path

from PIL import Image, ImageFile, ImageOps

sys.path.insert(0, str(Path(__file__).resolve().parent))
from optimized_image_store import MAX_SIDE, WEBP_QUALITY  # noqa: E402

ImageFile.LOAD_TRUNCATED_IMAGES = True
SOURCE_EXT = {".jpg", ".jpeg", ".png"}
MIN_GAIN = 0.10


def convert(src: Path, originals: Path, dry_run: bool) -> tuple[str, int, int]:
    webp = src.with_suffix(".webp")
    before = src.stat().st_size
    if webp.exists() and webp.stat().st_size > 0:
        if not dry_run:
            originals.mkdir(parents=True, exist_ok=True)
            os.replace(src, originals / src.name)
        return "ja_tinha_webp", before, webp.stat().st_size

    with Image.open(src) as opened:
        image = ImageOps.exif_transpose(opened)
        if image.mode in {"RGBA", "LA"} or (image.mode == "P" and "transparency" in image.info):
            image = image.convert("RGBA")
        else:
            image = image.convert("RGB")
        if max(image.size) > MAX_SIDE:
            image.thumbnail((MAX_SIDE, MAX_SIDE), Image.Resampling.LANCZOS)
        tmp = webp.with_suffix(".webp.tmp")
        image.save(tmp, format="WEBP", quality=WEBP_QUALITY, method=4)

    after = tmp.stat().st_size
    with Image.open(tmp) as check:
        check.verify()
    if after > before * (1 - MIN_GAIN):
        tmp.unlink()
        return "sem_ganho", before, before
    if dry_run:
        tmp.unlink()
        return "converteria", before, after
    os.replace(tmp, webp)
    originals.mkdir(parents=True, exist_ok=True)
    os.replace(src, originals / src.name)
    return "convertido", before, after


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--images-dir", default="/workspace/data/catalog/images/products")
    parser.add_argument("--originals-dir", default="/workspace/data/catalog/originals/products")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    images = Path(args.images_dir)
    originals = Path(args.originals_dir)
    files = sorted(p for p in images.iterdir() if p.is_file() and p.suffix.lower() in SOURCE_EXT)
    if args.limit:
        files = files[: args.limit]

    totals: dict[str, int] = {}
    before_sum = after_sum = 0
    started = time.time()
    for i, src in enumerate(files, 1):
        try:
            status, before, after = convert(src, originals, args.dry_run)
        except Exception as exc:  # foto corrompida: fica como está
            status, before, after = "erro", 0, 0
            print(f"erro {src.name}: {exc}", flush=True)
        totals[status] = totals.get(status, 0) + 1
        before_sum += before
        after_sum += after
        if i % 2000 == 0:
            print(f"{i}/{len(files)} {totals} {(before_sum - after_sum) / 1e6:.0f} MB a menos "
                  f"({time.time() - started:.0f}s)", flush=True)

    print(f"fim: {len(files)} fotos {totals}; antes {before_sum / 1e6:.0f} MB, depois {after_sum / 1e6:.0f} MB, "
          f"economia {(before_sum - after_sum) / 1e6:.0f} MB{' (simulação)' if args.dry_run else ''}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
