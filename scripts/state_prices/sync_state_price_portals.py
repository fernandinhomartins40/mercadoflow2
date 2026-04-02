#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence
from urllib.parse import quote_plus, urljoin

import requests
from bs4 import BeautifulSoup

from collect_state_price_records import (
    CollectorRecord,
    import_payload,
    login,
    normalize_local_datetime,
    normalize_price,
    normalize_provider_product_id,
    normalize_store_id,
    norm_text,
)

DEFAULT_TERMS: tuple[str, ...] = (
    "arroz",
    "feijao",
    "leite",
    "cafe",
    "acucar",
    "oleo",
    "macarrao",
    "biscoito",
    "farinha",
    "margarina",
    "queijo",
    "presunto",
    "detergente",
    "sabao",
    "papel higienico",
    "agua",
    "refrigerante",
    "frango",
    "carne",
    "banana",
    "tomate",
    "batata",
    "cebola",
    "alho",
    "iogurte",
    "pao",
    "sal",
    "molho",
    "shampoo",
    "sabonete",
    "desodorante",
    "amendoim",
    "achocolatado",
    "creme dental",
    "fralda",
    "absorvente",
    "alcool",
    "cereal",
    "fuba",
    "massa",
    "ovos",
    "iogurte natural",
    "paracetamol",
    "dipirona",
    "ibuprofeno",
    "omeprazol",
    "vitamina c",
    "soro",
)

BA_SERVICE_URL = "https://precodahora.ba.gov.br/"
BA_LATITUDE = -12.977749
BA_LONGITUDE = -38.501629
BA_RADIUS = 15

AM_SERVICE_URL = "https://buscapreco.sefaz.am.gov.br/"
AM_LATITUDE = -3.10194
AM_LONGITUDE = -60.025
AM_DISTANCE = 9999


@dataclass(frozen=True)
class CrawlStats:
    provider: str
    collected: int
    unique: int
    imported: int
    skipped: int
    errors: int


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Automatically sync state portal prices into MercadoFlow")
    parser.add_argument("--providers-json", default="scripts/state_prices/providers.json")
    parser.add_argument("--provider", action="append", dest="providers", default=[], help="Provider code to sync")
    parser.add_argument("--watch", action="store_true", help="Keep syncing on an interval")
    parser.add_argument("--interval-minutes", type=int, default=360, help="Minutes between watch cycles")
    parser.add_argument("--terms", default="", help="Comma separated custom search terms")
    parser.add_argument("--terms-file", default="", help="Text file with one search term per line")
    parser.add_argument("--max-pages", type=int, default=4, help="Max pages per term")
    parser.add_argument("--pause-seconds", type=float, default=0.4, help="Pause between requests")
    parser.add_argument("--timeout", type=int, default=45, help="HTTP timeout")
    parser.add_argument("--api-base", default="http://localhost:8080/api")
    parser.add_argument("--login-endpoint", default="/v1/super-admin/auth/login")
    parser.add_argument("--import-endpoint", default="/v1/state-prices/import")
    parser.add_argument("--email", default="")
    parser.add_argument("--password", default="")
    parser.add_argument("--token", default="")
    parser.add_argument("--import", dest="do_import", action="store_true", help="Import observations to the API")
    parser.add_argument("--dry-run", action="store_true", help="Collect only and print a summary")
    parser.add_argument("--output-dir", default="", help="Write one JSON payload per provider in this directory")
    parser.add_argument("--limit-records", type=int, default=0, help="Cap the number of unique records per provider")
    return parser.parse_args()


def load_registry(path: Path) -> List[Dict[str, Any]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    raise RuntimeError(f"Invalid provider registry: {path}")


def read_terms(args: argparse.Namespace) -> List[str]:
    terms: List[str] = list(DEFAULT_TERMS)
    if args.terms_file:
        term_path = Path(args.terms_file).resolve()
        file_terms = [
            line.strip()
            for line in term_path.read_text(encoding="utf-8").splitlines()
            if line.strip() and not line.strip().startswith("#")
        ]
        terms.extend(file_terms)
    if args.terms:
        terms.extend([norm_text(term) for term in args.terms.split(",") if norm_text(term)])
    seen: set[str] = set()
    unique: List[str] = []
    for term in terms:
        lowered = term.lower()
        if lowered in seen:
            continue
        seen.add(lowered)
        unique.append(term)
    return unique


def chunked(items: Sequence[CollectorRecord], size: int) -> Iterable[List[CollectorRecord]]:
    step = max(1, size)
    for index in range(0, len(items), step):
        yield list(items[index:index + step])


def sleep_pause(seconds: float) -> None:
    if seconds > 0:
        time.sleep(seconds)


def request_with_retry(
    session: requests.Session,
    method: str,
    url: str,
    *,
    retries: int = 5,
    retry_pause: float = 2.0,
    **kwargs,
) -> requests.Response:
    last_error: Optional[BaseException] = None
    for attempt in range(1, max(1, retries) + 1):
        response = session.request(method, url, **kwargs)
        if response.status_code in {429, 500, 502, 503, 504}:
            retry_after = response.headers.get("Retry-After")
            wait_seconds = retry_pause * attempt
            if retry_after:
                try:
                    wait_seconds = max(wait_seconds, float(retry_after))
                except Exception:
                    pass
            last_error = requests.HTTPError(
                f"{response.status_code} response from {url}",
                response=response,
            )
            if attempt < retries:
                time.sleep(max(1.0, wait_seconds))
                continue
        try:
            response.raise_for_status()
            return response
        except Exception as exc:
            last_error = exc
            if attempt < retries:
                time.sleep(max(1.0, retry_pause * attempt))
                continue
    if last_error is not None:
        raise last_error
    raise RuntimeError(f"Request failed for {url}")


def build_session(timeout: int) -> requests.Session:
    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (compatible; MercadoFlowStateSync/1.0)",
        "Accept": "text/html,application/json;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
    })
    session.request = _wrap_timeout(session.request, timeout)
    return session


def _wrap_timeout(original_request, timeout: int):
    def wrapped(method, url, **kwargs):
        kwargs.setdefault("timeout", timeout)
        return original_request(method, url, **kwargs)

    return wrapped


def parse_bahia_csrf(html_text: str) -> str:
    match = re.search(r'id="validate"[^>]+data-id="([^"]+)"', html_text)
    if not match:
        raise RuntimeError("Unable to discover Bahia CSRF token")
    return match.group(1)


def parse_datetime_from_text(text: str) -> str:
    cleaned = norm_text(text)
    if not cleaned:
        return ""
    candidate = cleaned.replace("Z", "+00:00").replace(" ", "T")
    try:
        parsed = datetime.fromisoformat(candidate)
        if parsed.tzinfo is not None:
            parsed = parsed.astimezone().replace(tzinfo=None)
        return parsed.replace(microsecond=0).isoformat(timespec="seconds")
    except Exception:
        pass
    for fmt in ("%d/%m/%Y %H:%M:%S", "%Y-%m-%d %H:%M:%S"):
        try:
            parsed = datetime.strptime(cleaned, fmt)
            return parsed.replace(microsecond=0).isoformat(timespec="seconds")
        except Exception:
            continue
    return ""


def parse_amazonas_address(address: str) -> tuple[str, str]:
    cleaned = norm_text(address)
    if not cleaned:
        return "", "AM"
    match = re.search(r",\s*([^,]+?)-([A-Z]{2}),", cleaned)
    if match:
        return norm_text(match.group(1)), match.group(2).upper()
    match = re.search(r"\b([A-Za-zÀ-ÿ\s]+)-([A-Z]{2})\b", cleaned)
    if match:
        return norm_text(match.group(1)), match.group(2).upper()
    return "", "AM"


def stable_key(record: CollectorRecord) -> tuple[str, str, str, str]:
    return (
        norm_text(record.providerProductId).lower(),
        norm_text(record.observedStoreId).lower(),
        norm_text(record.price),
        norm_text(record.observedState).upper(),
    )


def dedupe_records(records: Sequence[CollectorRecord]) -> List[CollectorRecord]:
    seen: set[tuple[str, str, str, str]] = set()
    unique: List[CollectorRecord] = []
    for record in records:
        key = stable_key(record)
        if key in seen:
            continue
        seen.add(key)
        unique.append(record)
    return unique


def default_source_metadata(provider: Dict[str, Any]) -> Dict[str, str]:
    return {
        "provider": norm_text(provider.get("provider")),
        "name": norm_text(provider.get("name")) or norm_text(provider.get("provider")),
        "stateCode": norm_text(provider.get("stateCode")).upper(),
        "serviceName": norm_text(provider.get("serviceName")) or norm_text(provider.get("name")),
        "serviceUrl": norm_text(provider.get("serviceUrl")),
        "coverageStates": norm_text(provider.get("coverageStates")),
        "notes": norm_text(provider.get("notes")),
    }


def collect_bahia(
    session: requests.Session,
    provider: Dict[str, Any],
    terms: Sequence[str],
    max_pages: int,
    pause_seconds: float,
) -> List[CollectorRecord]:
    base_url = provider.get("serviceUrl") or BA_SERVICE_URL
    latitude = float(provider.get("searchLatitude") or BA_LATITUDE)
    longitude = float(provider.get("searchLongitude") or BA_LONGITUDE)
    radius = int(provider.get("searchRadius") or BA_RADIUS)
    retry_pause = float(provider.get("retryPauseSeconds") or 12.0)
    home = request_with_retry(
        session,
        "GET",
        base_url,
        retry_pause=retry_pause,
        headers={"Referer": base_url},
    )
    csrf = parse_bahia_csrf(home.text)
    collected: List[CollectorRecord] = []

    for term in terms:
        for page in range(1, max(1, max_pages) + 1):
            payload = {
                "termo": term,
                "gtin": "",
                "cnpj": "",
                "horas": "48",
                "anp": "",
                "codmun": "",
                "latitude": f"{latitude}",
                "longitude": f"{longitude}",
                "raio": f"{radius}",
                "pagina": str(page),
                "ordenar": "preco.asc",
            }
            response = request_with_retry(
                session,
                "POST",
                urljoin(base_url, "produtos/"),
                retry_pause=retry_pause,
                headers={
                    "Referer": base_url,
                    "X-CSRFToken": csrf,
                    "X-Requested-With": "XMLHttpRequest",
                },
                data=payload,
            )
            payload_json = response.json()
            items = payload_json.get("resultado") or []
            if not items:
                break
            for item in items:
                product = item.get("produto") or {}
                estab = item.get("estabelecimento") or {}
                product_name = norm_text(product.get("descricao"))
                if not product_name:
                    continue
                price = normalize_price(
                    product.get("precoLiquido")
                    or product.get("precoUnitario")
                    or product.get("precoBruto")
                )
                if not price:
                    continue
                gtin = norm_text(product.get("gtin") or product.get("codProduto"))
                observed_state = norm_text(estab.get("uf") or provider.get("stateCode") or "BA").upper()
                observed_city = norm_text(estab.get("municipio"))
                observed_store = norm_text(estab.get("nomeEstabelecimento"))
                provider_product_id = normalize_provider_product_id(
                    gtin or norm_text(product.get("codProduto")),
                    product_name,
                    product_name,
                    gtin,
                )
                record = CollectorRecord(
                    productName=product_name,
                    gtin=gtin,
                    brand=norm_text(product.get("marca") or product.get("fabricante")),
                    category=norm_text(product.get("ncmGrupo")),
                    packageDescription=norm_text(product.get("descricaoComplementar") or product_name),
                    unit=norm_text(product.get("unidade")),
                    observedState=observed_state,
                    observedCity=observed_city,
                    observedStore=observed_store,
                    observedStoreId=normalize_store_id(
                        norm_text(estab.get("cnpj") or estab.get("cod_nfce") or ""),
                        provider_product_id,
                        observed_state,
                        observed_city,
                        observed_store,
                    ),
                    providerProductId=provider_product_id,
                    sourceUrl=urljoin(base_url, f"produtos/?termo={quote_plus(term)}&pagina={page}"),
                    price=price,
                    currency="BRL",
                    observedAt=parse_datetime_from_text(product.get("data")) or parse_datetime_from_text(payload_json.get("dataConsulta")),
                    rawPayload=json.dumps(item, ensure_ascii=False),
                )
                collected.append(record)

            total_pages = int(payload_json.get("totalPaginas") or page)
            if page >= total_pages:
                break
            sleep_pause(pause_seconds)

        sleep_pause(pause_seconds)

    return dedupe_records(collected)


def extract_amazonas_records(
    html_text: str,
    page_url: str,
    default_term: str,
) -> tuple[List[CollectorRecord], int]:
    soup = BeautifulSoup(html_text, "html.parser")
    collected: List[CollectorRecord] = []

    pagination_pages: List[int] = []
    for anchor in soup.select('ul.pagination a[href*="/item/grupo/page/"]'):
        href = anchor.get("href") or ""
        match = re.search(r"/item/grupo/page/(\d+)", href)
        if match:
            pagination_pages.append(int(match.group(1)))
    page_total = max(pagination_pages) if pagination_pages else 1

    for modal in soup.select("div.modal.modal-fixed-footer"):
        modal_id = norm_text(modal.get("id"))
        header = modal.find("h4")
        product_name = norm_text(header.get_text(" ", strip=True) if header else default_term)
        modal_text = modal.get_text(" ", strip=True)
        observed_at = ""
        match = re.search(r"Consulta realizada em:\s*([0-9/:\s]+)", modal_text)
        if match:
            observed_at = parse_datetime_from_text(match.group(1))

        for detail in modal.select("div.card.small.det"):
            name_tag = detail.select_one("span.truncate.tooltipped b")
            store_name = norm_text(name_tag.get_text(" ", strip=True) if name_tag else "")
            address_tags = detail.select("p.tb-valor-10")
            address = norm_text(address_tags[0].get_text(" ", strip=True) if address_tags else "")
            relative = norm_text(address_tags[1].get_text(" ", strip=True) if len(address_tags) > 1 else "")
            price_tag = detail.select_one("b.tb-valor-25")
            price = normalize_price(price_tag.get_text(" ", strip=True) if price_tag else "")
            if not product_name or not store_name or not price:
                continue

            observed_city, observed_state = parse_amazonas_address(address)
            provider_product_id = normalize_provider_product_id(
                modal_id or product_name,
                product_name,
                default_term,
                "",
            )
            collected.append(
                CollectorRecord(
                    productName=product_name,
                    gtin="",
                    brand="",
                    category=norm_text(default_term).upper(),
                    packageDescription="",
                    unit="",
                    observedState=observed_state,
                    observedCity=observed_city,
                    observedStore=store_name,
                    observedStoreId=normalize_store_id(
                        modal_id or store_name,
                        provider_product_id,
                        observed_state,
                        observed_city,
                        store_name,
                    ),
                    providerProductId=provider_product_id,
                    sourceUrl=page_url,
                    price=price,
                    currency="BRL",
                    observedAt=observed_at or parse_datetime_from_text(relative),
                    rawPayload=json.dumps(
                        {
                            "modalId": modal_id,
                            "productName": product_name,
                            "storeName": store_name,
                            "address": address,
                            "relativeTime": relative,
                            "price": price,
                            "pageUrl": page_url,
                        },
                        ensure_ascii=False,
                    ),
                )
            )

    return collected, page_total


def collect_amazonas(
    session: requests.Session,
    provider: Dict[str, Any],
    terms: Sequence[str],
    max_pages: int,
    pause_seconds: float,
) -> List[CollectorRecord]:
    base_url = provider.get("serviceUrl") or AM_SERVICE_URL
    latitude = float(provider.get("searchLatitude") or AM_LATITUDE)
    longitude = float(provider.get("searchLongitude") or AM_LONGITUDE)
    distance = int(provider.get("searchDistance") or AM_DISTANCE)
    retry_pause = float(provider.get("retryPauseSeconds") or 2.0)
    home = request_with_retry(
        session,
        "GET",
        urljoin(base_url, "home"),
        retry_pause=retry_pause,
        headers={"Referer": base_url},
    )
    collected: List[CollectorRecord] = []

    payload_base = {
        "termoCdGtin": "",
        "cdGtin": "",
        "consultaExata": "true",
        "_consultaExata": "on",
        "tipoConsulta": "48",
        "distancia": str(distance),
        "precoMinimo": "",
        "precoMaximo": "",
        "latitude": f"{latitude}",
        "longitude": f"{longitude}",
    }

    for term in terms:
        first_payload = dict(payload_base)
        first_payload["descricaoProd"] = term
        page_one = request_with_retry(
            session,
            "POST",
            urljoin(base_url, "item/grupo/page/1"),
            retry_pause=retry_pause,
            headers={"Referer": urljoin(base_url, "home"), "X-Requested-With": "XMLHttpRequest"},
            data=first_payload,
        )
        items, page_total = extract_amazonas_records(page_one.text, page_one.url, term)
        collected.extend(items)

        limit = min(max(1, max_pages), max(1, page_total))
        for page in range(2, limit + 1):
            page_response = request_with_retry(
                session,
                "GET",
                urljoin(base_url, f"item/grupo/page/{page}"),
                retry_pause=retry_pause,
                headers={"Referer": page_one.url, "X-Requested-With": "XMLHttpRequest"},
            )
            items, _page_total = extract_amazonas_records(page_response.text, page_response.url, term)
            collected.extend(items)
            sleep_pause(pause_seconds)

        sleep_pause(pause_seconds)

    return dedupe_records(collected)


def crawl_provider(
    session: requests.Session,
    provider: Dict[str, Any],
    terms: Sequence[str],
    max_pages: int,
    pause_seconds: float,
) -> List[CollectorRecord]:
    provider_code = norm_text(provider.get("provider")).upper()
    if provider_code == "PRECO_DA_HORA_BA":
        return collect_bahia(session, provider, terms, max_pages, pause_seconds)
    if provider_code == "BUSCA_PRECO_AM":
        return collect_amazonas(session, provider, terms, max_pages, pause_seconds)
    raise RuntimeError(f"No automatic crawler registered for {provider_code}")


def import_records(
    args: argparse.Namespace,
    provider: Dict[str, Any],
    records: Sequence[CollectorRecord],
) -> Dict[str, Any]:
    metadata = default_source_metadata(provider)
    token = args.token.strip()
    if not token:
        if not args.email or not args.password:
            raise RuntimeError("Provide --token or --email and --password to import observations")
        token = login(args.api_base, args.login_endpoint, args.email, args.password)

    result: Dict[str, Any] = {}
    imported_total = 0
    skipped_total = 0
    errors_total = 0
    batches = list(chunked(records, 400))
    for batch in batches:
        result = import_payload(
            args.api_base,
            args.import_endpoint,
            token,
            metadata["provider"],
            metadata["name"],
            metadata["stateCode"],
            metadata["serviceName"],
            metadata["serviceUrl"],
            metadata["coverageStates"],
            metadata["notes"],
            batch,
        )
        imported_total += int(result.get("importedObservations") or 0)
        skipped_total += int(result.get("skippedObservations") or 0)
        errors_total += int(result.get("errors") or 0)
    result["importedObservations"] = imported_total
    result["skippedObservations"] = skipped_total
    result["errors"] = errors_total
    return result


def write_payload(output_dir: Path, provider_code: str, records: Sequence[CollectorRecord]) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    payload = {
        "provider": provider_code,
        "observations": [record.as_dict() for record in records],
        "count": len(records),
    }
    filename = f"{provider_code.lower()}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    target = output_dir / filename
    target.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return target


def main() -> int:
    args = parse_args()
    registry_path = Path(args.providers_json).resolve()
    registry = load_registry(registry_path)
    requested = {norm_text(value).upper() for value in args.providers if norm_text(value)}
    terms = read_terms(args)
    session = build_session(args.timeout)

    supported = {"PRECO_DA_HORA_BA", "BUSCA_PRECO_AM"}
    providers = [
        provider
        for provider in registry
        if norm_text(provider.get("provider")).upper() in supported
        and bool(provider.get("crawlEnabled", False))
        and (not requested or norm_text(provider.get("provider")).upper() in requested)
    ]

    if not providers:
        print("No automatic providers selected. Supported providers: PRECO_DA_HORA_BA, BUSCA_PRECO_AM", file=sys.stderr)
        return 1

    output_dir = Path(args.output_dir).resolve() if args.output_dir else None

    def run_cycle() -> List[CrawlStats]:
        summary: List[CrawlStats] = []
        for provider in providers:
            provider_code = norm_text(provider.get("provider")).upper()
            try:
                records = crawl_provider(session, provider, terms, args.max_pages, args.pause_seconds)
                if args.limit_records > 0:
                    records = list(records[: args.limit_records])
                if output_dir:
                    target = write_payload(output_dir, provider_code, records)
                    print(f"{provider_code}: wrote {len(records)} records to {target}")
                if args.do_import and not args.dry_run:
                    result = import_records(args, provider, records)
                    imported = int(result.get("importedObservations") or 0)
                    skipped = int(result.get("skippedObservations") or 0)
                    errors = int(result.get("errors") or 0)
                else:
                    imported = 0
                    skipped = 0
                    errors = 0
                summary.append(
                    CrawlStats(
                        provider=provider_code,
                        collected=len(records),
                        unique=len(records),
                        imported=imported,
                        skipped=skipped,
                        errors=errors,
                    )
                )
            except Exception as exc:
                summary.append(
                    CrawlStats(
                        provider=provider_code,
                        collected=0,
                        unique=0,
                        imported=0,
                        skipped=0,
                        errors=1,
                    )
                )
                print(f"{provider_code}: failed - {exc}", file=sys.stderr)
        print(
            json.dumps(
                [
                    {
                        "provider": item.provider,
                        "collected": item.collected,
                        "unique": item.unique,
                        "imported": item.imported,
                        "skipped": item.skipped,
                        "errors": item.errors,
                    }
                    for item in summary
                ],
                ensure_ascii=False,
                indent=2,
            )
        )
        return summary

    if not args.watch:
        run_cycle()
        return 0

    interval_seconds = max(60, int(args.interval_minutes) * 60)
    while True:
        started_at = datetime.now().replace(microsecond=0).isoformat(timespec="seconds")
        print(f"state-price sync cycle started at {started_at}")
        run_cycle()
        print(f"state-price sync sleeping for {interval_seconds} seconds")
        time.sleep(interval_seconds)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
