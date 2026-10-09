#!/usr/bin/env python3
"""Colhe os candidatos do banco de imagens genéricas (etapa 1 de 2).

Varre as categorias de frescos (hortifrúti, açougue, peixaria, padaria, frios,
rotisseria) das lojas VTEX e guarda, de cada produto, nome, categoria, marca,
código de barras e endereço da foto. Não baixa nem recorta nada: isso é a
etapa 2 (generic_library_build.py), que precisa de um modelo de segmentação e
roda fora da VPS.

Uso:
  python generic_library_harvest.py --out candidatos.json
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
import unicodedata
from typing import Any, Dict, Iterable, List

from fixed_market_catalog_vtex import build_session, collect_item_image_urls, norm_gtin

# Conta VTEX -> palavras (sem acento) que identificam as categorias de frescos.
STORES = {
    "hortifrutibr": "Hortifruti",
    "obahortifruti": "Oba Hortifruti",
    "zonasul": "Zona Sul",
    "covabra": "Covabra",
    "savegnagoio": "Savegnago",
}
FRESH = ("hortifruti", "acougue", "carnes", "peix", "padaria", "paes", "frios", "rotisser", "organicos")
GROUPS = (
    ("hortifruti", ("hortifruti", "organicos")),
    ("carnes", ("acougue", "carnes", "peix")),
    ("padaria", ("padaria", "paes")),
    ("frios", ("frios", "rotisser")),
)


def plain(text: Any) -> str:
    value = unicodedata.normalize("NFKD", str(text or "").lower())
    return "".join(ch for ch in value if not unicodedata.combining(ch))


def get_json(url: str, **params: Any) -> Any:
    for attempt in range(1, 5):
        try:
            response = build_session().get(url, params=params or None, timeout=40)
            if response.status_code in (200, 206):
                return response.json(), response.headers.get("resources", "")
        except Exception:
            pass
        time.sleep(1.5 * attempt)
    return [], ""


def leaves(node: Dict[str, Any], trail: List[str], ids: List[str]) -> Iterable[tuple[str, str]]:
    path = trail + [node.get("name") or ""]
    chain = ids + [str(node.get("id"))]
    children = node.get("children") or []
    if not children:
        yield "/".join(chain), " > ".join(path)
    for child in children:
        yield from leaves(child, path, chain)


def group_of(category: str) -> str:
    text = plain(category)
    for group, words in GROUPS:
        if any(word in text for word in words):
            return group
    return "outros"


def is_generic(ean: str) -> bool:
    """Sem código de barras de fabricante: vazio, curto, ou etiqueta de loja/balança (prefixo 2)."""
    digits = norm_gtin(ean)
    if not digits:
        return True
    stripped = digits.lstrip("0")
    return len(stripped) in (12, 13) and stripped.startswith("2")


def harvest(account: str, store: str) -> List[Dict[str, Any]]:
    base = f"https://{account}.vtexcommercestable.com.br"
    tree, _ = get_json(f"{base}/api/catalog_system/pub/category/tree/4")
    found: Dict[str, Dict[str, Any]] = {}
    for root in tree if isinstance(tree, list) else []:
        if not any(word in plain(root.get("name")) for word in FRESH):
            continue
        for fq, label in leaves(root, [], []):
            start = 0
            while start < 2500:
                products, resources = get_json(
                    f"{base}/api/catalog_system/pub/products/search", fq=f"C:/{fq}/", _from=start, _to=start + 49
                )
                if not isinstance(products, list) or not products:
                    break
                for product in products:
                    for item in product.get("items") or []:
                        urls = collect_item_image_urls(item)
                        if not urls:
                            continue
                        key = f"{account}:{product.get('productId')}:{item.get('itemId')}"
                        found[key] = {
                            "key": key,
                            "store": store,
                            "name": product.get("productName") or "",
                            "brand": product.get("brand") or "",
                            "category": label,
                            "group": group_of(label),
                            "ean": norm_gtin(item.get("ean")),
                            "generic": is_generic(item.get("ean")),
                            "imageUrl": urls[0],
                        }
                        break
                start += 50
                total = int(resources.split("/")[-1]) if "/" in resources else 0
                if start >= total:
                    break
        print(f"[{store}] {root.get('name')}: {len(found)} produtos ate aqui", flush=True)
    return list(found.values())


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    candidates: List[Dict[str, Any]] = []
    for account, store in STORES.items():
        candidates.extend(harvest(account, store))
    with open(args.out, "w", encoding="utf-8") as handle:
        json.dump(candidates, handle, ensure_ascii=False)
    print(f"total {len(candidates)} candidatos, {sum(1 for c in candidates if c['generic'])} sem codigo de fabricante")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
