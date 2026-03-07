#!/usr/bin/env python3
from __future__ import annotations

import argparse
import contextlib
import json
from pathlib import Path
import sys
import time
import traceback
from typing import Any, Callable, Dict, List, Optional, Sequence

import requests

from fixed_market_catalog_common import ImportOptions, empty_totals, norm_text
from fixed_market_catalog_gpa import GpaJobConfig, run_gpa_catalog_job
from fixed_market_catalog_vtex import VtexJobConfig, run_vtex_paged_job, run_vtex_sitemap_job


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Dispatch fixed market-specific catalog jobs")
    parser.add_argument("--watch", action="store_true")
    parser.add_argument("--interval-minutes", type=int, default=360)
    parser.add_argument("--manual-poll-seconds", type=int, default=30)
    parser.add_argument("--api-base", default="https://mercadoflow.com/api")
    parser.add_argument("--login-endpoint", default="/v1/super-admin/auth/login")
    parser.add_argument("--config-endpoint", default="/v1/super-admin/catalog/crawler/config")
    parser.add_argument("--runs-start-endpoint", default="/v1/super-admin/catalog/crawler/runs/start")
    parser.add_argument("--runs-claim-endpoint", default="/v1/super-admin/catalog/crawler/runs/claim")
    parser.add_argument("--runs-finish-endpoint", default="/v1/super-admin/catalog/crawler/runs/{runId}/finish")
    parser.add_argument("--run-status-endpoint", default="/v1/super-admin/catalog/crawler/runs/{runId}")
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--confidence", type=float, default=0.96)
    parser.add_argument("--batch-size", type=int, default=300)
    parser.add_argument("--download-images", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--images-dir", default="data/catalog/images")
    parser.add_argument("--runs-dir", default="data/catalog/runs")
    parser.add_argument("--max-image-bytes", type=int, default=3_000_000)
    parser.add_argument("--worker-name", default="MERCADOFLOW_MARKET_DISPATCHER")
    parser.add_argument("--providers", default="")
    parser.add_argument("--carrefour-page-size", type=int, default=50)
    parser.add_argument("--carrefour-max-pages", type=int, default=0)
    parser.add_argument("--gpa-list-workers", type=int, default=8)
    parser.add_argument("--gpa-detail-workers", type=int, default=16)
    parser.add_argument("--dsp-page-size", type=int, default=50)
    parser.add_argument("--dsp-max-pages", type=int, default=0)
    parser.add_argument("--atacadao-page-size", type=int, default=50)
    parser.add_argument("--atacadao-max-pages", type=int, default=0)
    return parser.parse_args()


def login(api_base: str, login_endpoint: str, email: str, password: str) -> str:
    endpoint = login_endpoint if login_endpoint.startswith("/") else f"/{login_endpoint}"
    response = requests.post(
        f"{api_base.rstrip('/')}{endpoint}",
        json={"email": email, "password": password, "keepConnected": True},
        timeout=60,
    )
    response.raise_for_status()
    token = response.json().get("token")
    if not token:
        raise RuntimeError("Login succeeded without token")
    return str(token)


def api_get(api_base: str, endpoint: str, token: str) -> Dict[str, Any]:
    path = endpoint if endpoint.startswith("/") else f"/{endpoint}"
    response = requests.get(
        f"{api_base.rstrip('/')}{path}",
        headers={"Authorization": f"Bearer {token}"},
        timeout=60,
    )
    response.raise_for_status()
    payload = response.json()
    return payload if isinstance(payload, dict) else {}


def get_run_status(api_base: str, endpoint_template: str, token: str, run_id: str) -> str:
    if not run_id:
        return ""
    try:
        payload = api_get(api_base, endpoint_template.replace("{runId}", run_id), token)
    except Exception as exc:
        print(f"get run status failed: {exc}", file=sys.stderr)
        return ""
    return norm_text(payload.get("status")).upper()


def api_post(
    api_base: str,
    endpoint: str,
    token: str,
    payload: Dict[str, Any],
    timeout: int = 60,
    accept_no_content: bool = False,
) -> Optional[Dict[str, Any]]:
    path = endpoint if endpoint.startswith("/") else f"/{endpoint}"
    response = requests.post(
        f"{api_base.rstrip('/')}{path}",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json=payload,
        timeout=timeout,
    )
    if accept_no_content and response.status_code == 204:
        return None
    response.raise_for_status()
    if not response.text:
        return None
    payload = response.json()
    return payload if isinstance(payload, dict) else None


def claim_remote_run(api_base: str, endpoint: str, token: str, worker_name: str) -> Optional[Dict[str, Any]]:
    try:
        return api_post(
            api_base,
            endpoint,
            token,
            {"workerName": worker_name},
            timeout=60,
            accept_no_content=True,
        )
    except Exception as exc:
        print(f"claim run failed: {exc}", file=sys.stderr)
        return None


def start_remote_run(
    api_base: str,
    endpoint: str,
    token: str,
    worker_name: str,
    providers: Sequence[str],
    message: str,
) -> str:
    payload = {
        "triggeredBy": worker_name,
        "message": message,
        "sources": list(providers),
    }
    response = api_post(api_base, endpoint, token, payload, timeout=60)
    return str(response.get("id") or "") if response else ""


def finish_remote_run(
    api_base: str,
    endpoint_template: str,
    token: str,
    run_id: str,
    result: Dict[str, Any],
) -> None:
    endpoint = endpoint_template.replace("{runId}", run_id)
    payload = {
        "status": result.get("status", "SUCCESS"),
        "scannedProducts": int(result.get("scannedProducts", 0)),
        "importedProducts": int(result.get("importedProducts", 0)),
        "skippedInvalidGtin": int(result.get("skippedInvalidGtin", 0)),
        "skippedMissingName": int(result.get("skippedMissingName", 0)),
        "skippedMedication": int(result.get("skippedMedication", 0)),
        "skippedDuplicateGtin": int(result.get("skippedDuplicateGtin", 0)),
        "errors": int(result.get("errors", 0)),
        "message": result.get("message"),
        "sources": [str(item.get("provider")) for item in result.get("summary", []) if item.get("provider")],
    }
    try:
        api_post(api_base, endpoint, token, payload, timeout=120)
    except Exception as exc:
        print(f"finish run failed: {exc}", file=sys.stderr)


def load_schedule(api_base: str, endpoint: str, token: str, fallback_minutes: int) -> tuple[bool, int]:
    try:
        payload = api_get(api_base, endpoint, token)
        enabled = payload.get("enabled") is not False
        interval = int(payload.get("intervalMinutes") or fallback_minutes)
        return enabled, max(5, interval)
    except Exception:
        return True, max(5, fallback_minutes)


def build_options(args: argparse.Namespace, provider: str, source_license: str, output: str) -> ImportOptions:
    return ImportOptions(
        provider=provider,
        source_license=source_license,
        api_base=args.api_base,
        login_endpoint=args.login_endpoint,
        import_endpoint="/v1/admin/catalog/import/records",
        email=args.email,
        password=args.password,
        confidence=args.confidence,
        batch_size=args.batch_size,
        skip_medication=False,
        do_import=True,
        download_images=args.download_images,
        images_dir=args.images_dir,
        max_image_bytes=args.max_image_bytes,
        output=output,
    )


def run_paodeacucar(args: argparse.Namespace) -> Dict[str, Any]:
    job = GpaJobConfig(
        name="Pao de Acucar",
        brand="pa",
        store_id=461,
        provider="PAODEACUCAR_WEB_BR",
        source_license="Public website/API data (respect provider terms and robots)",
        output="data/catalog/paodeacucar_web_br_catalog",
        site_base="https://www.paodeacucar.com",
        allowed_root_categories=(
            "Alimentos",
            "Bebidas",
            "Limpeza",
            "Descartaveis",
            "Bebe e Crianca",
            "Perfumaria",
            "Bazar",
            "PetShop",
            "Textil",
        ),
    )
    return run_gpa_catalog_job(
        job,
        build_options(args, job.provider, job.source_license, job.output),
        max_workers_list=args.gpa_list_workers,
        max_workers_detail=args.gpa_detail_workers,
        cancel_check=getattr(args, "_cancel_check", None),
    )


def run_extra(args: argparse.Namespace) -> Dict[str, Any]:
    job = GpaJobConfig(
        name="Extra Mercado",
        brand="ex",
        store_id=483,
        provider="EXTRA_WEB_BR",
        source_license="Public website/API data (respect provider terms and robots)",
        output="data/catalog/extra_web_br_catalog",
        site_base="https://www.extramercado.com.br",
        allowed_root_categories=(
            "Alimentos",
            "Bebidas",
            "Limpeza",
            "Descartaveis",
            "Bebe e Crianca",
            "Perfumaria",
            "Bazar",
            "PetShop",
            "Textil",
        ),
    )
    return run_gpa_catalog_job(
        job,
        build_options(args, job.provider, job.source_license, job.output),
        max_workers_list=args.gpa_list_workers,
        max_workers_detail=args.gpa_detail_workers,
        cancel_check=getattr(args, "_cancel_check", None),
    )


def run_carrefour(args: argparse.Namespace) -> Dict[str, Any]:
    job = VtexJobConfig(
        name="Carrefour Brasil",
        provider="CARREFOUR_WEB_BR",
        source_license="Public website/API data (respect provider terms and robots)",
        output="data/catalog/carrefour_web_br_catalog",
        site_base="https://mercado.carrefour.com.br",
        catalog_api_base="https://carrefourbrfood.vtexcommercestable.com.br",
        mode="paged_search",
        allowed_category_keywords=(
            "mercearia",
            "alimentos basicos",
            "arroz",
            "feijao",
            "massas",
            "matinais",
            "cafe",
            "achocolatado",
            "cereais",
            "snacks",
            "biscoitos",
            "bebidas nao alcoolicas",
            "acougue",
            "peixaria",
            "bebidas",
            "whisky",
            "vodka",
            "drogaria",
            "comemoracoes",
            "diet",
            "saudaveis",
            "veganos",
            "frios",
            "laticinios",
            "padaria",
            "congelados",
            "sobremesas",
            "hortifruti",
            "bebe",
            "infantil",
            "limpeza",
            "higiene",
            "perfumaria",
            "casa",
            "eletro",
            "pet care",
        ),
    )
    return run_vtex_paged_job(
        job,
        build_options(args, job.provider, job.source_license, job.output),
        page_size=args.carrefour_page_size,
        max_pages=args.carrefour_max_pages,
        slug_fallback=True,
        cancel_check=getattr(args, "_cancel_check", None),
    )


def run_drogariasp(args: argparse.Namespace) -> Dict[str, Any]:
    job = VtexJobConfig(
        name="Drogaria Sao Paulo",
        provider="DROGARIASP_WEB_BR",
        source_license="Public website/API data (respect provider terms and robots)",
        output="data/catalog/drogariasp_web_br_catalog",
        site_base="https://www.drogariasaopaulo.com.br",
        catalog_api_base="https://www.drogariasaopaulo.com.br",
        mode="paged_search",
    )
    return run_vtex_paged_job(
        job,
        build_options(args, job.provider, job.source_license, job.output),
        page_size=args.dsp_page_size,
        max_pages=args.dsp_max_pages,
        slug_fallback=True,
        cancel_check=getattr(args, "_cancel_check", None),
    )


def run_atacadao(args: argparse.Namespace) -> Dict[str, Any]:
    job = VtexJobConfig(
        name="Atacadao Online",
        provider="ATACADAO_WEB_BR",
        source_license="Public website/API data (respect provider terms and robots)",
        output="data/catalog/atacadao_web_br_catalog",
        site_base="https://www.atacadao.com.br",
        catalog_api_base="https://www.atacadao.com.br",
        mode="paged_search",
        allowed_category_keywords=(
            "bebidas",
            "mercearia",
            "limpeza",
            "higiene",
            "perfumaria",
            "padaria",
            "matinais",
            "papelaria",
            "pet shop",
            "petshop",
            "automotivo",
            "frios",
            "congelados",
            "eletronicos",
            "eletroportateis",
            "hortifruti",
            "carnes",
            "aves",
            "peixes",
            "vestuario",
            "utilidades domesticas",
            "jardinagem",
            "descartaveis",
            "embalagens",
            "esporte",
            "lazer",
        ),
    )
    return run_vtex_paged_job(
        job,
        build_options(args, job.provider, job.source_license, job.output),
        page_size=args.atacadao_page_size,
        max_pages=args.atacadao_max_pages,
        slug_fallback=True,
        cancel_check=getattr(args, "_cancel_check", None),
    )


RUNNERS: Dict[str, Callable[[argparse.Namespace], Dict[str, Any]]] = {
    "PAODEACUCAR_WEB_BR": run_paodeacucar,
    "EXTRA_WEB_BR": run_extra,
    "CARREFOUR_WEB_BR": run_carrefour,
    "DROGARIASP_WEB_BR": run_drogariasp,
    "ATACADAO_WEB_BR": run_atacadao,
}
DISABLED_PROVIDERS = {"CARREFOUR_WEB_BR"}


def enabled_providers() -> List[str]:
    return [provider for provider in RUNNERS.keys() if provider not in DISABLED_PROVIDERS]


def resolve_providers(raw: Sequence[str]) -> List[str]:
    providers = [norm_text(value).upper() for value in raw if norm_text(value)]
    if not providers:
        return enabled_providers()
    return [provider for provider in providers if provider in RUNNERS and provider not in DISABLED_PROVIDERS]


def run_providers(args: argparse.Namespace, providers: Sequence[str], cancel_check: Optional[Callable[[], bool]] = None) -> Dict[str, Any]:
    totals = empty_totals()
    summary: List[Dict[str, Any]] = []
    messages: List[str] = []
    failed = False
    args._cancel_check = cancel_check

    if not providers:
        return {
            "status": "SUCCESS",
            "message": "Nenhum provider habilitado para executar nesta rodada.",
            "summary": [],
            **totals,
        }

    for provider in providers:
        if cancel_check and cancel_check():
            return {
                "status": "CANCELLED",
                "message": "Execucao cancelada pelo super admin.",
                "summary": summary,
                **totals,
            }
        if provider in DISABLED_PROVIDERS:
            messages.append(f"{provider}: temporariamente desabilitado")
            summary.append({"provider": provider, "source": provider, "disabled": True})
            continue
        runner = RUNNERS.get(provider)
        if runner is None:
            failed = True
            totals["errors"] += 1
            summary.append({"provider": provider, "source": provider, "error": "unknown provider"})
            messages.append(f"{provider}: provider desconhecido")
            continue

        try:
            result = runner(args)
        except Exception as exc:
            failed = True
            totals["errors"] += 1
            summary.append({"provider": provider, "source": provider, "error": str(exc)})
            messages.append(f"{provider}: falhou {exc}")
            continue

        if result.get("status") == "FAILED":
            failed = True
        if result.get("status") == "CANCELLED":
            return {
                "status": "CANCELLED",
                "message": result.get("message") or "Execucao cancelada pelo super admin.",
                "summary": summary + list(result.get("summary", [])),
                "scannedProducts": totals["scannedProducts"] + int(result.get("scannedProducts", 0)),
                "importedProducts": totals["importedProducts"] + int(result.get("importedProducts", 0)),
                "skippedInvalidGtin": totals["skippedInvalidGtin"] + int(result.get("skippedInvalidGtin", 0)),
                "skippedMissingName": totals["skippedMissingName"] + int(result.get("skippedMissingName", 0)),
                "skippedMedication": totals["skippedMedication"] + int(result.get("skippedMedication", 0)),
                "skippedDuplicateGtin": totals["skippedDuplicateGtin"] + int(result.get("skippedDuplicateGtin", 0)),
                "errors": totals["errors"] + int(result.get("errors", 0)),
            }
        for key in totals:
            totals[key] += int(result.get(key, 0))
        summary.extend(result.get("summary", []))
        if result.get("message"):
            messages.append(str(result["message"]))

    return {
        "status": "FAILED" if failed else "SUCCESS",
        "message": " | ".join(messages)[:1800],
        "summary": summary,
        **totals,
    }


class TeeStream:
    def __init__(self, *streams: Any):
        self.streams = streams

    def write(self, data: str) -> int:
        for stream in self.streams:
            stream.write(data)
        return len(data)

    def flush(self) -> None:
        for stream in self.streams:
            stream.flush()


@contextlib.contextmanager
def capture_run_output(log_path: Path):
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("a", encoding="utf-8") as handle:
        stdout_tee = TeeStream(sys.stdout, handle)
        stderr_tee = TeeStream(sys.stderr, handle)
        with contextlib.redirect_stdout(stdout_tee), contextlib.redirect_stderr(stderr_tee):
            yield


def write_run_result(runs_dir: str, run_id: str, result: Dict[str, Any]) -> None:
    if not run_id:
        return
    run_dir = Path(runs_dir).resolve() / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    (run_dir / "result.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> int:
    args = parse_args()
    explicit_providers = resolve_providers(args.providers.split(",")) if args.providers else enabled_providers()

    if not args.watch:
        result = run_providers(args, explicit_providers)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0 if result.get("status") != "FAILED" else 1

    token = login(args.api_base, args.login_endpoint, args.email, args.password)
    poll_seconds = max(5, int(args.manual_poll_seconds))
    print(f"watch mode enabled manual_only=true providers={','.join(enabled_providers())} poll={poll_seconds}s")

    while True:
        try:
            claimed = claim_remote_run(args.api_base, args.runs_claim_endpoint, token, args.worker_name)
            if claimed is None:
                time.sleep(poll_seconds)
                continue

            claimed_sources = claimed.get("sources") or []
            providers = resolve_providers(claimed_sources)
            run_id = ""

            def cancel_check() -> bool:
                status = get_run_status(args.api_base, args.run_status_endpoint, token, run_id)
                return status == "CANCELLED"

            run_id = norm_text(claimed.get("id"))
            run_log_path = Path(args.runs_dir).resolve() / run_id / "dispatcher.log"

            if len(providers) != 1:
                invalid_sources = [norm_text(value) for value in claimed_sources if norm_text(value)]
                result = {
                    "status": "FAILED",
                    "message": "O dispatcher manual aceita exatamente um supermercado por execucao.",
                    "summary": [
                        {
                            "provider": provider,
                            "source": provider,
                            "error": "manual-single-provider-required",
                        }
                        for provider in (invalid_sources or providers)
                    ],
                    **empty_totals(),
                }
                write_run_result(args.runs_dir, run_id, result)
                finish_remote_run(args.api_base, args.runs_finish_endpoint, token, run_id, result)
                continue

            try:
                with capture_run_output(run_log_path):
                    print(f"manual run claimed id={run_id} providers={providers}")
                    result = run_providers(args, providers, cancel_check=cancel_check)
            except Exception as exc:
                with capture_run_output(run_log_path):
                    print(f"dispatcher cycle failed for run {run_id}: {exc}", file=sys.stderr)
                    traceback.print_exc()
                result = {
                    "status": "FAILED",
                    "message": f"Falha interna do dispatcher: {exc}",
                    "summary": [{"provider": providers[0], "source": providers[0], "error": str(exc)}],
                    "scannedProducts": 0,
                    "importedProducts": 0,
                    "skippedInvalidGtin": 0,
                    "skippedMissingName": 0,
                    "skippedMedication": 0,
                    "skippedDuplicateGtin": 0,
                    "errors": 1,
                }

            write_run_result(args.runs_dir, run_id, result)
            finish_remote_run(args.api_base, args.runs_finish_endpoint, token, run_id, result)
        except KeyboardInterrupt:
            print("stopped by user")
            return 0
        except Exception as exc:
            print(f"dispatcher cycle failed: {exc}", file=sys.stderr)
            time.sleep(poll_seconds)


if __name__ == "__main__":
    raise SystemExit(main())
