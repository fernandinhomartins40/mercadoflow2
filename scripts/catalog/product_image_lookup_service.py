#!/usr/bin/env python3
"""Busca de foto sob demanda.

Produto que entra por um mercado (Confere ou agente do PDV) antes de qualquer
coletor trazê-lo fica sem imagem no catálogo. Este serviço pega essa fila no
backend e procura cada código de barras direto nas lojas VTEX coletadas
(busca por EAN, uma requisição por loja), importa o cadastro com a foto e
devolve ao backend o que não achou, para tentar de novo mais tarde.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional, Tuple

import requests

from fixed_market_catalog_common import (
    ImportOptions,
    LocalImageStorage,
    import_records,
    login_super_admin,
    norm_gtin,
    norm_text,
    normalize_record,
    request_with_retry,
)
from fixed_market_catalog_vtex import VtexJobConfig, build_session, collect_item_image_urls, product_to_record

VTEX_SOURCES_PATH = Path(__file__).resolve().parent / "vtex_sources.json"
SOURCE_LICENSE = "Public website/API data (respect provider terms and robots)"
# Lojas consultadas ao mesmo tempo para um mesmo código; a ordem do arquivo é a
# prioridade, então vale o primeiro resultado do primeiro grupo que achar.
STORES_PER_ROUND = 6


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--watch", action="store_true")
    parser.add_argument("--poll-seconds", type=int, default=300)
    parser.add_argument("--batch", type=int, default=100)
    parser.add_argument("--api-base", default="https://mercadoflow.com/api")
    parser.add_argument("--login-endpoint", default="/v1/super-admin/auth/login")
    parser.add_argument("--pending-endpoint", default="/v1/super-admin/catalog/image-lookups/pending")
    parser.add_argument("--not-found-endpoint", default="/v1/super-admin/catalog/image-lookups/not-found")
    parser.add_argument("--email", default="")
    parser.add_argument("--password", default="")
    parser.add_argument("--images-dir", default="data/catalog/images")
    # Foto de fabricante passa facil de 3 MB; como e reduzida para 1000 px, o teto so limita o download.
    parser.add_argument("--max-image-bytes", type=int, default=8_000_000)
    parser.add_argument("--gtin", action="append", default=[], help="procura só estes códigos e imprime, sem importar")
    return parser.parse_args()


def load_stores() -> List[VtexJobConfig]:
    payload = json.loads(VTEX_SOURCES_PATH.read_text(encoding="utf-8"))
    stores: List[VtexJobConfig] = []
    for store in payload.get("stores") or []:
        if store.get("disabled"):
            continue
        provider = norm_text(store.get("provider")).upper()
        api_base = norm_text(store.get("apiBase")) or f"https://{store['account']}.vtexcommercestable.com.br"
        stores.append(
            VtexJobConfig(
                name=norm_text(store.get("name")) or provider,
                provider=provider,
                source_license=SOURCE_LICENSE,
                output="",
                site_base=norm_text(store["site"]),
                catalog_api_base=api_base,
                mode="ean-lookup",
            )
        )
    return stores


def gtin_variants(gtin: str) -> List[str]:
    # O mesmo produto aparece com e sem zeros à esquerda (EAN-13 x GTIN-14).
    variants = [gtin]
    stripped = gtin.lstrip("0")
    for candidate in (stripped, stripped.zfill(13), stripped.zfill(14)):
        if 8 <= len(candidate) <= 14 and candidate not in variants:
            variants.append(candidate)
    return variants


def lookup_in_store(store: VtexJobConfig, gtin: str) -> Optional[Dict[str, Any]]:
    wanted = {variant.lstrip("0") for variant in gtin_variants(gtin)}
    for variant in gtin_variants(gtin):
        try:
            response = build_session().get(
                f"{store.catalog_api_base.rstrip('/')}/api/catalog_system/pub/products/search",
                params={"fq": f"alternateIds_Ean:{variant}"},
                timeout=20,
            )
            if response.status_code not in (200, 206):
                continue
            products = response.json()
        except (requests.RequestException, ValueError):
            continue
        for product in products if isinstance(products, list) else []:
            for item in product.get("items") or []:
                # A busca devolve o produto inteiro; só serve a variação com este código e com foto.
                if norm_gtin(item.get("ean")).lstrip("0") in wanted and collect_item_image_urls(item):
                    record = product_to_record(store, {**product, "items": [item]})
                    record["code"] = gtin
                    return record
    return None


def iter_hits(stores: List[VtexJobConfig], gtin: str) -> Iterator[Tuple[VtexJobConfig, Dict[str, Any]]]:
    """Lojas que têm o produto, na ordem de prioridade; só consulta o grupo seguinte se pedirem mais."""
    for start in range(0, len(stores), STORES_PER_ROUND):
        group = stores[start:start + STORES_PER_ROUND]
        with ThreadPoolExecutor(max_workers=len(group)) as executor:
            results = list(executor.map(lambda store: lookup_in_store(store, gtin), group))
        for store, record in zip(group, results):
            if record:
                yield store, record


def lookup(stores: List[VtexJobConfig], gtin: str) -> Tuple[Optional[VtexJobConfig], Optional[Dict[str, Any]]]:
    return next(iter_hits(stores, gtin), (None, None))


class Backend:
    def __init__(self, args: argparse.Namespace):
        self.args = args
        self.token = ""
        self.session = requests.Session()

    def headers(self) -> Dict[str, str]:
        if not self.token:
            self.token = login_super_admin(self.args.api_base, self.args.login_endpoint, self.args.email, self.args.password)
        return {"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"}

    def reset(self) -> None:
        self.token = ""

    def call(self, method: str, endpoint: str, **kwargs: Any) -> Any:
        response = request_with_retry(
            self.session,
            method,
            f"{self.args.api_base.rstrip('/')}{endpoint}",
            headers_builder=self.headers,
            auth_refresh=self.reset,
            attempts=5,
            timeout=90,
            **kwargs,
        )
        return response.json() if response.text else None

    def pending(self) -> List[str]:
        rows = self.call("GET", self.args.pending_endpoint, params={"limit": self.args.batch})
        return [gtin for gtin in (norm_gtin(row.get("gtin")) for row in rows or [] if isinstance(row, dict)) if gtin]

    def not_found(self, gtins: List[str]) -> None:
        if gtins:
            self.call("POST", self.args.not_found_endpoint, json={"gtins": gtins})

    def import_found(self, provider: str, records: List[Dict[str, Any]]) -> int:
        options = ImportOptions(
            provider=provider,
            source_license=SOURCE_LICENSE,
            api_base=self.args.api_base,
            login_endpoint=self.args.login_endpoint,
            skip_medication=False,
        )
        self.headers()
        return import_records(options, self.token, records, session=self.session).get("importedProducts", 0)


def run_cycle(args: argparse.Namespace, backend: Backend, stores: List[VtexJobConfig], images: LocalImageStorage) -> int:
    gtins = backend.pending()
    if not gtins:
        return 0
    found: Dict[str, List[Dict[str, Any]]] = {}
    missing: List[str] = []
    for gtin in gtins:
        store, record, key = None, None, ""
        # A loja pode listar o produto com a foto fora do ar (404): vale a próxima que tiver.
        for store, record in iter_hits(stores, gtin):
            try:
                key = images.save(store.provider, gtin, record.get("imageUrl"))
            except Exception as exc:
                print(f"foto nao baixou gtin={gtin} loja={store.provider} erro={exc}", flush=True)
            if key:
                break
        # Sem foto gravada o produto continuaria na fila: conta como não encontrado.
        if not key:
            missing.append(gtin)
            continue
        normalized = normalize_record({**record, "imageStorageKey": key})
        if isinstance(normalized.get("rawPayload"), (dict, list)):
            normalized["rawPayload"] = json.dumps(normalized["rawPayload"], ensure_ascii=False)
        found.setdefault(store.provider, []).append(normalized)

    imported = 0
    for provider, records in found.items():
        imported += backend.import_found(provider, records)
    backend.not_found(missing)
    print(
        f"ciclo: fila={len(gtins)} com_foto={sum(len(v) for v in found.values())} importados={imported} "
        f"nao_encontrados={len(missing)} lojas={ {k: len(v) for k, v in found.items()} }",
        flush=True,
    )
    return len(gtins)


def main() -> int:
    args = parse_args()
    stores = load_stores()
    if args.gtin:
        for gtin in args.gtin:
            store, record = lookup(stores, norm_gtin(gtin))
            print(gtin, "->", store.provider if store else None, (record or {}).get("name"), (record or {}).get("imageUrl"))
        return 0

    backend = Backend(args)
    images = LocalImageStorage(Path(args.images_dir).resolve(), args.max_image_bytes)
    print(f"busca de foto sob demanda: {len(stores)} lojas, fila a cada {args.poll_seconds}s", flush=True)
    while True:
        try:
            handled = run_cycle(args, backend, stores, images)
        except KeyboardInterrupt:
            return 0
        except Exception as exc:
            print(f"ciclo falhou: {exc}", file=sys.stderr, flush=True)
            handled = 0
        if not args.watch:
            return 0
        # Fila cheia: segue direto para o próximo lote; vazia: espera o próximo produto chegar.
        if handled < args.batch:
            time.sleep(max(30, args.poll_seconds))


if __name__ == "__main__":
    raise SystemExit(main())
