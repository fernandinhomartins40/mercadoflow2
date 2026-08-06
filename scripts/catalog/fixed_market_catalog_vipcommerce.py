#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import time
import unicodedata
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

import requests

from fixed_market_catalog_common import ImportOptions
from fixed_market_catalog_generic import (
    GenericCatalogJobConfig,
    GenericImageStore,
    build_generic_args,
    run_generic_catalog_job,
)
from supermarket_catalog_service import DEFAULT_UA, Record, Source, norm_gtin, norm_text, parse_price, run_cycle

VIPCOMMERCE_API_BASE = "https://services.vipcommerce.com.br"
VIPCOMMERCE_LOGIN_KEY = "df072f85df9bf7dd71b6811c34bdbaa4f219d98775b56cff9dfa5f8ca1bf8469"
VIPCOMMERCE_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36"
)

VIPCOMMERCE_PROVIDER_CONFIG: Dict[str, Dict[str, Any]] = {
    "REDETOPONLINE_WEB_BR": {
        "org_id": 229,
        "domain": "redetoponline.com.br",
        "domain_key": "redetoponline.com.br",
        "site_base": "https://www.redetoponline.com.br",
        "omnichannel_id": 263,
        "default_centro_distribuicao_id": 1,
    },
    "NORDESTAO_WEB_BR": {
        "org_id": 52,
        "domain": "nordestaomaisvoce.com.br",
        "domain_key": "nordestaomaisvoce.com.br",
        "site_base": "https://www.lojaonline.nordestao.com.br",
        "omnichannel_id": 78,
        "default_centro_distribuicao_id": 2,
    },
}


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


def _slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFD", norm_text(value))
    normalized = normalized.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", normalized).strip("-").lower()
    return slug or "produto"


def _safe_int(value: Any, fallback: int = 0) -> int:
    try:
        return int(value)
    except Exception:
        return fallback


def _extract_brand(value: Any) -> str:
    if isinstance(value, dict):
        return norm_text(value.get("nome") or value.get("name") or value.get("descricao"))[:120]
    return norm_text(value)[:120]


def _build_category_map(nodes: Sequence[Dict[str, Any]], prefix: str = "") -> Dict[int, str]:
    mapping: Dict[int, str] = {}
    for node in nodes:
        node_id = node.get("classificacao_mercadologica_id")
        try:
            node_id_int = int(node_id)
        except Exception:
            node_id_int = 0
        name = norm_text(node.get("descricao") or node.get("name"))
        current = " > ".join([part for part in [prefix, name] if part]) if name else prefix
        if node_id_int:
            mapping[node_id_int] = current or name
        children = node.get("children") or []
        if isinstance(children, list) and children:
            mapping.update(_build_category_map(children, current))
    return mapping


def _collect_department_targets(nodes: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    targets: List[Dict[str, Any]] = []
    for node in nodes:
        if norm_text(node.get("nivel")).lower() == "departamento":
            node_id = _safe_int(node.get("classificacao_mercadologica_id"))
            if node_id:
                targets.append(
                    {
                        "id": node_id,
                        "name": norm_text(node.get("descricao") or node.get("name")) or f"Departamento {node_id}",
                    }
                )
    return targets


def _collect_collection_ids(home_payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    targets: List[Dict[str, Any]] = []
    seen: set[int] = set()
    for block in home_payload.get("data") or []:
        if not isinstance(block, dict):
            continue
        for banner in block.get("banners") or []:
            if not isinstance(banner, dict):
                continue
            if norm_text(banner.get("model")).lower() != "colecao":
                continue
            details = banner.get("details") or {}
            collection_id = _safe_int(details.get("id"))
            if not collection_id or collection_id in seen:
                continue
            seen.add(collection_id)
            targets.append(
                {
                    "id": collection_id,
                    "name": norm_text(details.get("descricao") or details.get("slug") or banner.get("description"))
                    or f"Colecao {collection_id}",
                }
            )
    return targets


def _build_image_url(image_base: str, image_name: str) -> str:
    image_name = norm_text(image_name)
    if not image_name:
        return ""
    return f"{image_base.rstrip('/')}/250x250/{image_name.lstrip('/')}"


def _extract_code(product: Dict[str, Any]) -> str:
    for key in ("codigo_barras", "ean", "barcode", "gtin", "gtin13", "gtin14", "gtin12", "gtin8"):
        code = norm_gtin(product.get(key))
        if code:
            return code
    return ""


def _build_record(
    *,
    provider: str,
    source_license: str,
    site_base: str,
    image_base: str,
    product: Dict[str, Any],
    category_map: Dict[int, str],
    fallback_category: str,
    target_kind: str,
    target_name: str,
) -> Optional[Record]:
    code = _extract_code(product)
    if not code:
        return None

    name = norm_text(product.get("descricao"))
    if not name:
        return None

    category_id = _safe_int(product.get("classificacao_mercadologica_id"))
    section_id = _safe_int(product.get("secao_id"))
    category = category_map.get(category_id) or category_map.get(section_id) or fallback_category

    product_id = _safe_int(product.get("produto_id") or product.get("id"))
    slug = norm_text(product.get("link")) or _slugify(name)
    source_url = f"{site_base.rstrip('/')}/produto/{product_id}/{slug}"

    attributes = {
        "targetKind": target_kind,
        "targetName": target_name,
        "produto_id": product.get("produto_id"),
        "classificacao_mercadologica_id": product.get("classificacao_mercadologica_id"),
        "secao_id": product.get("secao_id"),
        "codigo_erp": product.get("codigo_erp"),
        "codigo_barras": product.get("codigo_barras"),
        "sku": product.get("sku"),
        "quantidade_minima": product.get("quantidade_minima"),
        "quantidade_maxima": product.get("quantidade_maxima"),
        "quantidade_vendida": product.get("quantidade_vendida"),
        "em_oferta": product.get("em_oferta"),
        "oferta": product.get("oferta"),
        "unidade_sigla": product.get("unidade_sigla"),
        "tags": product.get("tags"),
        "anunciado": product.get("anunciado"),
        "observacao": product.get("observacao"),
        "link": product.get("link"),
    }

    price = parse_price(product.get("preco"))
    brand = _extract_brand(product.get("marca"))
    unit = norm_text(product.get("unidade_sigla"))[:32]
    image_url = _build_image_url(image_base, product.get("imagem"))

    return Record(
        provider=provider,
        source_license=source_license,
        code=code,
        name=name[:255],
        brand=brand,
        category=norm_text(category)[:120],
        ncm="",
        unit=unit,
        description="",
        manufacturer="",
        package_description="",
        image_url=image_url,
        image_storage_key="",
        attributes_json=json.dumps(attributes, ensure_ascii=False),
        price=price,
        currency="BRL",
        source_url=source_url,
        provider_product_id=str(product_id),
        raw_payload=product,
    )


class VipCommerceCrawler:
    def __init__(self, provider: str):
        if provider not in VIPCOMMERCE_PROVIDER_CONFIG:
            raise ValueError(f"VIPCommerce provider not configured: {provider}")
        self.provider = provider
        self.cfg = VIPCOMMERCE_PROVIDER_CONFIG[provider]
        self.session = requests.Session()
        self.session.headers.update(
            {
                "User-Agent": VIPCOMMERCE_USER_AGENT,
                "Accept": "application/json, text/plain, */*",
                "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
            }
        )
        self.token = ""
        self.runtime: Dict[str, Any] = {}

    @property
    def org_id(self) -> int:
        return int(self.cfg["org_id"])

    @property
    def site_base(self) -> str:
        return str(self.cfg["site_base"])

    def _request_headers(self, token: str) -> Dict[str, str]:
        authorization = "Bearer" if not token else f"Bearer {token}"
        return {
            "authorization": authorization,
            "sessao-id": "",
            "referer": f"{self.site_base}/",
            "domainkey": str(self.cfg["domain_key"]),
            "organizationid": str(self.org_id),
            "user-agent": VIPCOMMERCE_USER_AGENT,
            "accept": "application/json",
            "content-type": "application/json",
        }

    def _login(self) -> str:
        payload = {
            "domain": str(self.cfg["domain"]),
            "username": "loja",
            "key": VIPCOMMERCE_LOGIN_KEY,
        }
        url = f"{VIPCOMMERCE_API_BASE}/api-admin/v1/org/{self.org_id}/auth/loja/login"
        resp = self.session.post(url, headers=self._request_headers(""), json=payload, timeout=30)
        resp.raise_for_status()
        data = resp.json().get("data")
        if not data:
            raise RuntimeError(f"{self.provider}: login returned no token")
        self.token = str(data)
        return self.token

    def _ensure_token(self) -> str:
        if self.token:
            return self.token
        return self._login()

    def _get_json(
        self,
        path: str,
        *,
        params: Optional[Dict[str, Any]] = None,
        retries: int = 3,
    ) -> Dict[str, Any]:
        token = self._ensure_token()
        url = f"{VIPCOMMERCE_API_BASE}{path}"
        last_error: Optional[BaseException] = None
        for attempt in range(1, retries + 1):
            try:
                resp = self.session.get(url, headers=self._request_headers(token), params=params, timeout=30)
                if resp.status_code == 401 and attempt == 1:
                    self.token = ""
                    token = self._ensure_token()
                    continue
                resp.raise_for_status()
                payload = resp.json()
                if not isinstance(payload, dict):
                    raise RuntimeError(f"{self.provider}: unexpected payload from {path}")
                return payload
            except requests.RequestException as exc:
                last_error = exc
                self.token = ""
                if attempt < retries:
                    time.sleep(1.5 * attempt)
                    token = self._ensure_token()
                    continue
                raise
            except Exception as exc:
                last_error = exc
                if attempt < retries:
                    time.sleep(1.5 * attempt)
                    token = self._ensure_token()
                    continue
                raise
        if last_error is not None:
            raise last_error
        raise RuntimeError(f"{self.provider}: request failed for {path}")

    def _load_runtime(self) -> Dict[str, Any]:
        if self.runtime:
            return self.runtime

        omni_id = int(self.cfg["omnichannel_id"])
        omni = self._get_json(f"/api-admin/v1/org/{self.org_id}/loja/omnichannel/{omni_id}")
        omni_data = omni.get("data") or {}
        filial = omni_data.get("filial") or {}
        cd_id = _safe_int(filial.get("centro_distribuicao_padrao_id"), int(self.cfg["default_centro_distribuicao_id"]))
        image_base = str(self.cfg.get("image_base") or "https://produto-assets-vipcommerce-com-br.br-se1.magaluobjects.com")
        for item in omni_data.get("localizacaoArquivos") or []:
            if isinstance(item, dict) and norm_text(item.get("model")).lower() == "produto":
                candidate = norm_text(item.get("localizacao"))
                if candidate:
                    image_base = candidate
                    break

        tree = self._get_json(
            f"/api-admin/v1/org/{self.org_id}/filial/1/centro_distribuicao/{cd_id}/loja/classificacoes_mercadologicas/departamentos/arvore"
        )
        home = self._get_json(
            f"/api-admin/v1/org/{self.org_id}/filial/1/centro_distribuicao/{cd_id}/loja/omnichannel/home/dispositivo/S"
        )

        self.runtime = {
            "omnichannel": omni,
            "filial": filial,
            "centro_distribuicao_id": cd_id,
            "image_base": image_base,
            "tree": tree.get("data") or [],
            "home": home,
            "list_page_size": _safe_int(filial.get("quantidade_itens_listagem"), 40) or 40,
            "vitrine_page_size": _safe_int(filial.get("quantidade_itens_vitrine"), 40) or 40,
        }
        return self.runtime

    def _crawl_target(
        self,
        *,
        target_kind: str,
        target_id: int,
        target_name: str,
        source_license: str,
        category_map: Dict[int, str],
        page_size: int,
        max_pages_override: int,
        max_records_override: int,
        seen_codes: set[str],
    ) -> Tuple[List[Record], Dict[str, int]]:
        runtime = self._load_runtime()
        cd_id = int(runtime["centro_distribuicao_id"])
        records: List[Record] = []
        stats = defaultdict(int)
        page = 1
        page_budget = max_pages_override if max_pages_override > 0 else 0
        record_budget = max_records_override if max_records_override > 0 else 0
        while True:
            if page_budget and stats["scannedPages"] >= page_budget:
                break
            path = ""
            params: Dict[str, Any]
            if target_kind == "department":
                path = (
                    f"/api-admin/v1/org/{self.org_id}/filial/1/centro_distribuicao/{cd_id}"
                    f"/loja/classificacoes_mercadologicas/departamentos/{target_id}/produtos"
                )
                params = {"page": page}
            else:
                path = f"/api-admin/v1/org/{self.org_id}/filial/1/centro_distribuicao/{cd_id}/loja/vitrines/produtos"
                params = {"vitrine_ids": target_id, "page": page, "limit": page_size}
            try:
                payload = self._get_json(path, params=params)
            except Exception as exc:
                stats["errors"] += 1
                print(f"vipcommerce fetch failed provider={self.provider} target={target_kind}:{target_id} page={page} error={exc}")
                break

            stats["scannedPages"] += 1
            items = payload.get("data") or []
            paginator = payload.get("paginator") or {}
            if not isinstance(items, list) or not items:
                break

            stats["discoveredLinks"] += len(items)
            for item in items:
                if not isinstance(item, dict):
                    continue
                record = _build_record(
                    provider=self.provider,
                    source_license=source_license,
                    site_base=self.site_base,
                    image_base=str(runtime["image_base"]),
                    product=item,
                    category_map=category_map,
                    fallback_category=target_name,
                    target_kind=target_kind,
                    target_name=target_name,
                )
                if record is None:
                    stats["skippedInvalidGtin"] += 1
                    continue
                if not record.name:
                    stats["skippedMissingName"] += 1
                    continue
                if record.code in seen_codes:
                    stats["skippedDuplicateGtin"] += 1
                    continue
                seen_codes.add(record.code)
                records.append(record)
                stats["extractedRecords"] += 1
                if record_budget and len(records) >= record_budget:
                    break

            if record_budget and len(records) >= record_budget:
                break

            total_pages = _safe_int(paginator.get("total_pages"), 0)
            if total_pages and page >= total_pages:
                break
            page += 1

        return records, {key: int(value) for key, value in stats.items()}

    def crawl(self, source: Source, max_pages_override: int, max_records_override: int) -> Tuple[List[Record], Dict[str, int]]:
        runtime = self._load_runtime()
        tree_nodes = runtime.get("tree") or []
        category_map = _build_category_map(tree_nodes if isinstance(tree_nodes, list) else [])
        department_targets = _collect_department_targets(tree_nodes if isinstance(tree_nodes, list) else [])
        collection_targets = _collect_collection_ids(runtime.get("home") or {})

        all_records: List[Record] = []
        seen_codes: set[str] = set()
        totals = defaultdict(int)
        pages_used = 0
        records_used = 0
        page_budget = max_pages_override if max_pages_override > 0 else 0
        record_budget = max_records_override if max_records_override > 0 else 0

        for target in department_targets:
            if page_budget and pages_used >= page_budget:
                break
            if record_budget and records_used >= record_budget:
                break
            remaining_pages = max(0, page_budget - pages_used) if page_budget else 0
            if page_budget and remaining_pages <= 0:
                break
            records, stats = self._crawl_target(
                target_kind="department",
                target_id=target["id"],
                target_name=target["name"],
                source_license=source.source_license,
                category_map=category_map,
                page_size=int(runtime.get("list_page_size") or 40),
                max_pages_override=remaining_pages,
                max_records_override=max(0, record_budget - records_used) if record_budget else 0,
                seen_codes=seen_codes,
            )
            all_records.extend(records)
            pages_used += int(stats.get("scannedPages", 0))
            records_used += len(records)
            for key, value in stats.items():
                totals[key] += int(value)

        for target in collection_targets:
            if page_budget and pages_used >= page_budget:
                break
            if record_budget and records_used >= record_budget:
                break
            remaining_pages = max(0, page_budget - pages_used) if page_budget else 0
            if page_budget and remaining_pages <= 0:
                break
            records, stats = self._crawl_target(
                target_kind="vitrine",
                target_id=target["id"],
                target_name=target["name"],
                source_license=source.source_license,
                category_map=category_map,
                page_size=int(runtime.get("vitrine_page_size") or 40),
                max_pages_override=remaining_pages,
                max_records_override=max(0, record_budget - records_used) if record_budget else 0,
                seen_codes=seen_codes,
            )
            all_records.extend(records)
            pages_used += int(stats.get("scannedPages", 0))
            records_used += len(records)
            for key, value in stats.items():
                totals[key] += int(value)

        summary = {
            "scannedPages": int(totals.get("scannedPages", 0)),
            "extractedRecords": int(totals.get("extractedRecords", len(all_records))),
            "discoveredLinks": int(totals.get("discoveredLinks", 0)),
            "errors": int(totals.get("errors", 0)),
            "skippedInvalidGtin": int(totals.get("skippedInvalidGtin", 0)),
            "skippedMissingName": int(totals.get("skippedMissingName", 0)),
            "skippedDuplicateGtin": int(totals.get("skippedDuplicateGtin", 0)),
        }
        return all_records, summary


def _generic_catalog_job(job: SupermercadosOnlineJobConfig) -> GenericCatalogJobConfig:
    site = job.site_base.rstrip("/")
    domain = site.replace("https://", "").replace("http://", "").rstrip("/")
    return GenericCatalogJobConfig(
        name=job.name,
        provider=job.provider,
        source_license=job.source_license,
        output=job.output,
        site_base=job.site_base,
        seeds=[seed for seed in [job.site_base, job.sitemap_url, job.product_example_url, job.categories_url] if seed],
        allowed_domains=[
            domain,
            f"www.{domain}" if not domain.startswith("www.") else domain,
        ],
        product_path_hints=("/departamentos/", "/colecoes/", "/produto/", "/produtos/", "/ofertas", "/mais-vendidos"),
        # max_pages e um orcamento compartilhado entre todos os departamentos e
        # vitrines; com 1000 a varredura parava no meio dos departamentos maiores.
        max_pages=20_000,
        max_records=80_000,
        rate_limit_ms=0,
        timeout_sec=30,
        ignore_robots=False,
        enable_browser_simulation=False,
    )


def run_supermercados_online_catalog_job(
    job: SupermercadosOnlineJobConfig,
    options: ImportOptions,
    max_pages_override: int = 0,
    max_records_override: int = 0,
) -> Dict[str, int | str | list[dict]]:
    if job.provider not in VIPCOMMERCE_PROVIDER_CONFIG:
        return run_generic_catalog_job(
            _generic_catalog_job(job),
            options,
            max_pages_override=max_pages_override,
            max_records_override=max_records_override,
        )

    generic_job = _generic_catalog_job(job)
    args = build_generic_args(
        generic_job,
        options,
        max_pages_override=max_pages_override,
        max_records_override=max_records_override,
    )
    crawler = VipCommerceCrawler(job.provider)
    source = Source(
        name=job.name,
        provider=job.provider,
        source_license=job.source_license,
        seeds=[job.site_base],
        allowed_domains=[job.site_base.replace("https://", "").replace("http://", "").rstrip("/"), f"www.{job.site_base.replace('https://', '').replace('http://', '').replace('www.', '').rstrip('/')}"],
        hints=["/departamentos/", "/colecoes/", "/produto/", "/ofertas", "/mais-vendidos"],
        max_pages=generic_job.max_pages,
        max_records=generic_job.max_records,
        rate_limit_ms=generic_job.rate_limit_ms,
        timeout_sec=generic_job.timeout_sec,
    )
    image_store = (
        GenericImageStore(Path(options.images_dir).resolve(), options.max_image_bytes, VIPCOMMERCE_USER_AGENT)
        if options.download_images
        else None
    )
    return run_cycle(args, crawler, [source], Path(job.output).resolve(), image_store)
