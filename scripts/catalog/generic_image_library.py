#!/usr/bin/env python3
"""Biblioteca de fotos genéricas para produto sem código de barras.

Hortifrúti, açougue, padaria e frios chegam pela nota só com descrição ou código
interno ("BANANA PRATA KG", "CARNE BOV ALCATRA KG"). Não dá para procurar por
EAN; em vez disso a descrição é casada com uma lista curada (generic_products.json)
e o produto recebe a foto genérica do item, baixada uma vez das lojas VTEX.

Uso para conferir o casamento:
  python generic_image_library.py "BANANA PRATA KG" "BOLO DE BANANA" "QJO MUSS FATIADO"
"""
from __future__ import annotations

import json
import re
import sys
import unicodedata
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence
from urllib.parse import quote

import requests

from fixed_market_catalog_vtex import VtexJobConfig, build_session, collect_item_image_urls, pick_primary_item

LIBRARY_PATH = Path(__file__).resolve().parent / "generic_products.json"
# Lojas onde a foto genérica é procurada, na ordem: hortifrúti primeiro.
PHOTO_STORE_PROVIDERS = (
    "HORTIFRUTI_WEB_BR",
    "OBAHORTIFRUTI_WEB_BR",
    "ZONASUL_WEB_BR",
    "COVABRA_WEB_BR",
    "SAVEGNAGO_WEB_BR",
    "CARREFOUR_WEB_BR",
    "ANGELONI_WEB_BR",
)
UNIT_TOKEN_RE = re.compile(r"^\d+([.,]\d+)?(kg|g|gr|ml|l|un|und|unid|pc|pct|cx|bdj)?$")
UNIT_WORDS = {"kg", "g", "gr", "un", "und", "unid", "pc", "pct", "bdj", "bandeja", "granel", "de", "da", "do", "com", "e"}


def storage_key(slug: str) -> str:
    # A rota de imagens aceita um nivel de pasta: products/<arquivo>.
    return f"products/generic-{slug}.jpg"


class GenericLibrary:
    def __init__(self, path: Path = LIBRARY_PATH):
        payload = json.loads(path.read_text(encoding="utf-8"))
        self.synonyms: Dict[str, str] = payload.get("synonyms") or {}
        self.exclude = {self._norm_word(w) for w in payload.get("exclude") or []}
        self.items: List[Dict[str, Any]] = payload.get("items") or []
        self.phrases: List[tuple[frozenset, str]] = []
        for item in self.items:
            for phrase in item.get("match") or []:
                tokens = frozenset(self.tokens(phrase))
                if tokens:
                    self.phrases.append((tokens, item["slug"]))

    @staticmethod
    def _norm_word(word: str) -> str:
        text = unicodedata.normalize("NFKD", word.lower())
        return "".join(ch for ch in text if not unicodedata.combining(ch))

    def tokens(self, text: str) -> List[str]:
        normalized = self._norm_word(text or "")
        result: List[str] = []
        for raw in re.split(r"[^a-z0-9.,]+", normalized):
            raw = raw.strip(".,")
            if not raw or raw in UNIT_WORDS or UNIT_TOKEN_RE.match(raw):
                continue
            result.append(self.synonyms.get(raw, raw))
        return result

    def match(self, description: str) -> Optional[str]:
        tokens = set(self.tokens(description))
        best: Optional[tuple[int, str]] = None
        for phrase, slug in self.phrases:
            # Palavra bloqueada so conta fora do nome do item: "batata doce" casa,
            # "doce de leite" nao.
            if phrase <= tokens and not (tokens - phrase) & self.exclude and (best is None or len(phrase) > best[0]):
                best = (len(phrase), slug)
        return best[1] if best else None

    def item(self, slug: str) -> Dict[str, Any]:
        return next(item for item in self.items if item["slug"] == slug)

    def find_photo(self, slug: str, stores: Sequence[VtexJobConfig]) -> Optional[Dict[str, str]]:
        """Primeiro produto das lojas de foto cujo nome tem todas as palavras da busca."""
        item = self.item(slug)
        wanted = set(self.tokens(item["search"]))
        by_provider = {store.provider: store for store in stores}
        for provider in PHOTO_STORE_PROVIDERS:
            store = by_provider.get(provider)
            if store is None:
                continue
            try:
                # A VTEX recusa "+" como espaco no ft (400): precisa ser %20.
                response = build_session().get(
                    f"{store.catalog_api_base.rstrip('/')}/api/catalog_system/pub/products/search"
                    f"?ft={quote(item['search'])}&_from=0&_to=29",
                    timeout=20,
                )
                products = response.json() if response.status_code in (200, 206) else []
            except (requests.RequestException, ValueError):
                continue
            best: Optional[tuple[int, Dict[str, str]]] = None
            for product in products if isinstance(products, list) else []:
                name_tokens = set(self.tokens(product.get("productName") or ""))
                if not wanted <= name_tokens or (name_tokens - wanted) & self.exclude:
                    continue
                urls = collect_item_image_urls(pick_primary_item(product))
                if not urls:
                    continue
                # Nome mais proximo do item: "Cebola" ganha de "Cebola Roxa".
                extra = len(name_tokens - wanted)
                if best is None or extra < best[0]:
                    best = (extra, {"imageUrl": urls[0], "store": provider, "productName": product.get("productName") or ""})
            if best:
                return best[1]
        return None


if __name__ == "__main__":
    library = GenericLibrary()
    for text in sys.argv[1:]:
        print(f"{text!r} -> {library.match(text)}")
