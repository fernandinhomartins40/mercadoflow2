#!/usr/bin/env python3
"""
Lista (e, com --delete, apaga) fotos do catálogo que nenhum produto usa.

Até 09/10/2026 o coletor baixava a foto de todo registro, inclusive dos sem
código de barras, que o backend descarta; o arquivo ficava no disco sem dono.

A lista de chaves em uso vem do banco, uma por linha (products/X.jpg):
  psql -At -c "select image_storage_key from product_enrichments
               where coalesce(image_storage_key,'') <> ''" > /tmp/keys.txt

Uso (dentro do contêiner de coletores):
  python /workspace/scripts/catalog/prune_orphan_images.py --keys /tmp/keys.txt
  python /workspace/scripts/catalog/prune_orphan_images.py --keys /tmp/keys.txt --delete
"""
from __future__ import annotations

import argparse
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--images-dir", default="/workspace/data/catalog/images")
    parser.add_argument("--keys", required=True, help="arquivo com as chaves em uso, uma por linha")
    parser.add_argument("--min-keys", type=int, default=1000,
                        help="recusa rodar com lista menor que isto (lista vazia apagaria tudo)")
    parser.add_argument("--delete", action="store_true")
    args = parser.parse_args()

    base = Path(args.images_dir)
    # A chave do cadastro é sempre .jpg; o arquivo no disco pode ser o .webp irmão.
    used = {
        str(Path(line.strip()).with_suffix("")).replace("\\", "/")
        for line in Path(args.keys).read_text(encoding="utf-8").splitlines()
        if line.strip()
    }
    if len(used) < args.min_keys:
        print(f"lista com só {len(used)} chaves; abortado para não apagar fotos em uso")
        return 1

    orphans = orphan_bytes = total = 0
    for path in (base / "products").iterdir():
        if not path.is_file():
            continue
        total += 1
        key = str(path.relative_to(base).with_suffix("")).replace("\\", "/")
        if key in used:
            continue
        orphans += 1
        orphan_bytes += path.stat().st_size
        if args.delete:
            path.unlink()
    print(f"{total} arquivos, {len(used)} chaves em uso; sem dono: {orphans} ({orphan_bytes / 1e6:.0f} MB)"
          f"{' — apagados' if args.delete else ' — simulação, nada apagado'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
