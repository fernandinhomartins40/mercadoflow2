#!/usr/bin/env python3
"""Reaproveita os arquivos .jsonl de auditoria para enriquecer o catalogo.

As rodadas de coleta gravam em data/catalog/<provider>_catalog.jsonl o registro
completo de cada produto, incluindo campos ricos (tabela nutricional,
ingredientes, peso/volume, dimensoes) que ficam dentro de attributesJson e do
rawPayload. Este script varre esses arquivos e reenvia apenas o que agrega
informacao, sem recoletar nada dos sites.

Garantias de seguranca (o backfill nunca empobrece um produto existente):
  * o upsert do backend sobrescreve TODOS os campos do enrichment e converte ""
    em null, entao cada item vai com o registro completo ja mesclado: o valor do
    banco e reenviado sempre que o arquivo nao for melhor;
  * imagens sao reenviadas exatamente como estao hoje (imageUrl/imageStorageKey
    lidos do proprio banco), portanto nunca mudam;
  * rawPayload nunca vai vazio — o backend o substituiria pelo DTO serializado —
    e so e trocado quando o arquivo tem um payload maior;
  * campos de texto so sao trocados quando o arquivo acrescenta informacao;
    os demais preenchem apenas lacunas;
  * produtos ausentes do banco sao ignorados: o backfill nao cria catalogo novo;
  * --dry-run mostra o ganho sem enviar nada.

Uso tipico (na VPS, dentro do container que tem as dependencias):
  docker exec mercadoflow-catalog-harvester sh -c 'cd /workspace && \
      python scripts/catalog/backfill_rich_data_from_audit.py --dry-run'
"""
from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple

import requests

from fixed_market_catalog_common import (
    empty_totals,
    login_super_admin,
    norm_gtin,
    norm_text,
    request_with_retry,
)

# Marcadores que caracterizam um registro "rico". Usados so para priorizar e
# para relatar o ganho; o criterio de envio e sempre a comparacao com o banco.
RICH_MARKERS: Tuple[str, ...] = (
    "tabela nutricional",
    "ingrediente",
    "valor energ",
    "carboidrato",
    "proteina",
    "proteína",
    "sodio",
    "sódio",
    "porcao",
    "porção",
    "peso liquido",
    "peso líquido",
    "peso bruto",
    "conteudo liquido",
    "conteúdo líquido",
    "volume",
    "composicao",
    "composição",
    "altura",
    "largura",
    "profundidade",
    "armazenagem",
    "conservacao",
    "conservação",
    "advertencia",
    "advertência",
    "fragrancia",
    "fragrância",
    "principio ativo",
    "princípio ativo",
)


@dataclass
class Candidate:
    """Melhor versao encontrada nos arquivos para um GTIN de um provider."""

    gtin: str
    provider: str
    description: str = ""
    attributes_json: str = ""
    raw_payload: str = ""
    name: str = ""
    brand: str = ""
    category: str = ""
    ncm: str = ""
    unit: str = ""
    manufacturer: str = ""
    package_description: str = ""
    rich_score: int = 0
    source_file: str = ""


@dataclass
class Stats:
    files_read: int = 0
    lines_read: int = 0
    lines_invalid: int = 0
    candidates: int = 0
    not_in_db: int = 0
    unchanged: int = 0
    improved: int = 0
    sent: int = 0
    failed: int = 0
    improvements: Dict[str, int] = field(default_factory=dict)

    def bump(self, key: str) -> None:
        self.improvements[key] = self.improvements.get(key, 0) + 1


def rich_score(text: str) -> int:
    """Quantos marcadores de dado rico aparecem no texto."""
    if not text:
        return 0
    lowered = text.lower()
    return sum(1 for marker in RICH_MARKERS if marker in lowered)


def attribute_richness(attributes_json: str) -> int:
    """Mede a riqueza de attributesJson: chaves uteis + marcadores.

    Nao basta comparar tamanho: um JSON grande pode ser so rawPayload repetido.
    Contar as chaves de customFields/attributesFlat separa metadado util de
    volume bruto.
    """
    if not attributes_json:
        return 0
    score = rich_score(attributes_json)
    try:
        payload = json.loads(attributes_json)
    except Exception:
        return score
    if not isinstance(payload, dict):
        return score
    for key in ("customFields", "attributesFlat", "attributes", "specifications"):
        value = payload.get(key)
        if isinstance(value, dict):
            score += len(value)
        elif isinstance(value, list):
            score += len(value)
    for key in ("allSpecifications", "attributeGroups", "imageUrls"):
        value = payload.get(key)
        if isinstance(value, list):
            score += len(value)
    return score


def as_text(value: Any) -> str:
    """Normaliza rawPayload/attributesJson, que podem vir como dict ou string."""
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    try:
        return json.dumps(value, ensure_ascii=False)
    except Exception:
        return ""


def iter_audit_records(path: Path) -> Iterable[Dict[str, Any]]:
    with path.open(encoding="utf-8", errors="replace") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            try:
                record = json.loads(line)
            except Exception:
                yield {"__invalid__": True}
                continue
            if isinstance(record, dict):
                yield record


def provider_from_filename(path: Path, override: Dict[str, str]) -> str:
    """Deriva o provider a partir do nome do arquivo de auditoria."""
    stem = path.name
    for suffix in (".jsonl", ".manifest.json"):
        if stem.endswith(suffix):
            stem = stem[: -len(suffix)]
    if stem.endswith("_catalog"):
        stem = stem[: -len("_catalog")]
    key = stem.upper()
    return override.get(key, key)


# products.ean guarda o GTIN (nao existe coluna "gtin"); product_enrichments tem
# uma linha por produto (uk_product_enrichments_product).
#
# O snapshot vive em SQLite no disco justamente para caber o raw_payload inteiro:
# ele precisa ser reenviado quando o arquivo nao for melhor, senao o backend o
# substitui pelo DTO serializado.
SNAPSHOT_COLUMNS = (
    "ean",
    "canonical_name",
    "brand",
    "category",
    "ncm",
    "unit",
    "description",
    "manufacturer",
    "package_description",
    "image_url",
    "image_storage_key",
    "attributes_json",
    "raw_payload",
    "raw_payload_len",
)


class SnapshotDB:
    """Indice do estado atual do catalogo, em SQLite no disco.

    O catalogo tem ~138k produtos e o attributes_json soma centenas de MB.
    Carregar tudo em um dict Python estoura a memoria do container (o processo
    era morto pelo OOM killer), entao o snapshot vive em disco e e consultado
    por GTIN sob demanda.
    """

    def __init__(self, path: Path):
        import sqlite3

        self.path = path
        self.conn = sqlite3.connect(str(path))
        self.conn.row_factory = sqlite3.Row

    def count(self) -> int:
        cur = self.conn.execute("SELECT count(*) FROM snapshot")
        return int(cur.fetchone()[0])

    def get(self, gtin: str) -> Optional[Dict[str, Any]]:
        cur = self.conn.execute("SELECT * FROM snapshot WHERE ean = ?", (gtin,))
        row = cur.fetchone()
        return dict(row) if row is not None else None

    def close(self) -> None:
        self.conn.close()


def build_snapshot_db(container: str, db: str, user: str, destination: Path) -> SnapshotDB:
    """Exporta o catalogo em TSV via psql e indexa em SQLite, sem carregar tudo na RAM."""
    import sqlite3
    import subprocess

    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        destination.unlink()

    columns = ", ".join(
        "p.ean" if c == "ean" else (
            "length(coalesce(e.raw_payload, '')) AS raw_payload_len"
            if c == "raw_payload_len"
            else f"e.{c}"
        )
        for c in SNAPSHOT_COLUMNS
    )
    query = (
        f"COPY (SELECT {columns} FROM product_enrichments e "
        "JOIN products p ON p.id = e.product_id "
        "WHERE p.ean IS NOT NULL AND p.ean <> '') TO STDOUT WITH (FORMAT csv)"
    )
    print(f"[backfill] exportando snapshot do banco via {container}...", flush=True)
    proc = subprocess.Popen(
        ["docker", "exec", container, "psql", "-U", user, "-d", db, "-c", query],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
    )

    conn = sqlite3.connect(str(destination))
    conn.execute(
        "CREATE TABLE snapshot (" + ", ".join(f"{c} TEXT" for c in SNAPSHOT_COLUMNS) + ")"
    )
    placeholders = ", ".join("?" for _ in SNAPSHOT_COLUMNS)
    import csv as _csv

    _csv.field_size_limit(min(sys.maxsize, 2**31 - 1))
    inserted = 0
    batch: List[Tuple[str, ...]] = []
    assert proc.stdout is not None
    for row in _csv.reader(proc.stdout):
        if len(row) != len(SNAPSHOT_COLUMNS):
            continue
        batch.append(tuple(row))
        if len(batch) >= 2000:
            conn.executemany(f"INSERT INTO snapshot VALUES ({placeholders})", batch)
            inserted += len(batch)
            batch.clear()
    if batch:
        conn.executemany(f"INSERT INTO snapshot VALUES ({placeholders})", batch)
        inserted += len(batch)
    proc.wait(timeout=120)
    stderr = proc.stderr.read() if proc.stderr else ""
    if proc.returncode != 0:
        conn.close()
        raise RuntimeError(f"psql falhou: {stderr[:400]}")
    conn.execute("CREATE UNIQUE INDEX idx_snapshot_ean ON snapshot(ean)")
    conn.commit()
    conn.close()
    print(f"[backfill] snapshot indexado: {inserted} produtos em {destination.name}", flush=True)
    return SnapshotDB(destination)


def decide_updates(
    candidate: Candidate,
    existing: Optional[Dict[str, Any]],
    stats: Stats,
    min_description_gain: int,
) -> Optional[Dict[str, Any]]:
    """Monta o payload completo do registro ja mesclado com o banco.

    IMPORTANTE: o upsert do backend (ProductCatalogService) sobrescreve todos os
    campos do enrichment sem checar se o valor recebido e vazio, e
    canonicalizeDisplayName converte "" em null. Por isso o payload precisa ser
    sempre COMPLETO: qualquer campo omitido ou vazio apagaria o dado atual.
    A regra e "mantem o banco, a menos que o arquivo seja melhor" — e imagens
    sao sempre reenviadas exatamente como estao hoje.

    Devolve None quando o arquivo nao acrescenta nada (evita escrita inutil).
    """
    if existing is None:
        stats.not_in_db += 1
        return None

    improved = False

    # --- descricao: troca apenas se for significativamente maior ---
    current_description = norm_text(existing.get("description"))
    description = current_description
    if candidate.description and len(candidate.description) >= len(current_description) + min_description_gain:
        description = candidate.description
        improved = True
        stats.bump("description")

    # --- attributesJson: troca se tiver mais metadado util ---
    current_attributes = as_text(existing.get("attributes_json"))
    attributes_json = current_attributes
    if candidate.attributes_json and attribute_richness(candidate.attributes_json) > attribute_richness(current_attributes):
        attributes_json = candidate.attributes_json
        improved = True
        stats.bump("attributesJson")

    # --- rawPayload: so troca quando o arquivo e comprovadamente maior ---
    # O snapshot carrega apenas o tamanho atual (raw_payload_len) para nao
    # estourar memoria com varios GB de payload. rawPayload NUNCA pode ir vazio:
    # resolveRawPayload() no backend substitui um valor em branco pelo DTO
    # serializado, o que apagaria o payload original. Quando o arquivo nao supera
    # o banco, marcamos para buscar o valor atual antes do envio.
    current_raw_len = int(existing.get("raw_payload_len") or 0)
    current_raw = as_text(existing.get("raw_payload"))
    if candidate.raw_payload and len(candidate.raw_payload) > current_raw_len:
        raw_payload = candidate.raw_payload
        improved = True
        stats.bump("rawPayload")
    else:
        # devolve o payload atual: enviar vazio faria resolveRawPayload() gravar
        # o DTO serializado por cima do original
        raw_payload = current_raw

    # --- campos textuais: so preenchem lacunas, nunca substituem ---
    merged: Dict[str, str] = {}
    for field_name, column, value in (
        ("ncm", "ncm", candidate.ncm),
        ("unit", "unit", candidate.unit),
        ("manufacturer", "manufacturer", candidate.manufacturer),
        ("packageDescription", "package_description", candidate.package_description),
        ("brand", "brand", candidate.brand),
        ("category", "category", candidate.category),
    ):
        current_value = norm_text(existing.get(column))
        if current_value:
            merged[field_name] = current_value
        elif value:
            merged[field_name] = value
            improved = True
            stats.bump(field_name)
        else:
            merged[field_name] = ""

    if not improved:
        stats.unchanged += 1
        return None

    stats.improved += 1
    payload = {
        "code": candidate.gtin,
        # nome do banco tem precedencia: ja passou por canonicalizacao
        "name": norm_text(existing.get("canonical_name")) or candidate.name,
        "brand": merged["brand"],
        "category": merged["category"],
        "ncm": merged["ncm"],
        "unit": merged["unit"],
        "description": description,
        "manufacturer": merged["manufacturer"],
        "packageDescription": merged["packageDescription"],
        # imagens reenviadas identicas as atuais: o upsert sobrescreve sempre,
        # entao devolver o valor do banco e o que garante que nada se perca
        "imageUrl": norm_text(existing.get("image_url")),
        "imageStorageKey": norm_text(existing.get("image_storage_key")),
        "attributesJson": attributes_json,
        "rawPayload": raw_payload,
    }
    return payload


def send_batch(
    session: requests.Session,
    api_base: str,
    endpoint: str,
    token_holder: Dict[str, str],
    login_args: Tuple[str, str, str, str],
    provider: str,
    source_license: str,
    confidence: float,
    items: List[Dict[str, Any]],
) -> Dict[str, int]:
    path = endpoint if endpoint.startswith("/") else f"/{endpoint}"

    def refresh_token() -> None:
        token_holder["token"] = login_super_admin(*login_args)

    def headers() -> Dict[str, str]:
        if not token_holder.get("token"):
            refresh_token()
        return {
            "Authorization": f"Bearer {token_holder['token']}",
            "Content-Type": "application/json",
        }

    response = request_with_retry(
        session,
        "POST",
        f"{api_base.rstrip('/')}{path}",
        headers_builder=headers,
        auth_refresh=refresh_token,
        json={
            "provider": provider,
            "sourceLicense": source_license,
            "confidenceScore": confidence,
            "skipMedication": False,
            "items": items,
        },
        attempts=6,
        timeout=240,
    )
    payload = response.json()
    return {key: int(payload.get(key, 0)) for key in empty_totals()}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Enriquece o catalogo do banco a partir dos .jsonl de auditoria ja coletados"
    )
    parser.add_argument("--audit-dir", default="data/catalog", help="Diretorio com os arquivos *_catalog.jsonl")
    parser.add_argument("--api-base", default="https://mercadoflow.com/api")
    parser.add_argument("--login-endpoint", default="/v1/super-admin/auth/login")
    parser.add_argument("--import-endpoint", default="/v1/admin/catalog/import/records")
    parser.add_argument("--email", default="", help="Super admin (obrigatorio fora do --dry-run)")
    parser.add_argument("--password", default="")
    parser.add_argument("--providers", default="", help="Lista separada por virgula para limitar o backfill")
    parser.add_argument("--batch-size", type=int, default=200)
    parser.add_argument("--confidence", type=float, default=0.90)
    parser.add_argument(
        "--source-license",
        default="Backfill de dados ricos a partir de coletas anteriores",
    )
    parser.add_argument(
        "--min-description-gain",
        type=int,
        default=40,
        help="Minimo de caracteres a mais para substituir a descricao atual",
    )
    parser.add_argument("--limit", type=int, default=0, help="Processa no maximo N produtos (teste)")
    parser.add_argument("--dry-run", action="store_true", help="Nao envia nada; apenas relata o ganho")
    parser.add_argument("--pg-container", default="mercadoflow-postgres")
    parser.add_argument("--pg-db", default="pdv2cloud")
    parser.add_argument("--pg-user", default="pdv2cloud")
    parser.add_argument(
        "--snapshot-db",
        default="data/catalog/backfill_db_snapshot.sqlite",
        help="Arquivo SQLite com o estado atual do catalogo",
    )
    parser.add_argument(
        "--reuse-snapshot",
        action="store_true",
        help="Reaproveita o snapshot ja gerado em vez de reexportar do banco",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    audit_dir = Path(args.audit_dir).resolve()
    if not audit_dir.is_dir():
        print(f"ERRO: diretorio de auditoria inexistente: {audit_dir}", file=sys.stderr)
        return 1

    providers_filter = {norm_text(v).upper() for v in args.providers.split(",") if norm_text(v)}
    stats = Stats()

    print(f"[backfill] diretorio={audit_dir}")

    snapshot_path = Path(args.snapshot_db).resolve()
    if args.reuse_snapshot and snapshot_path.exists():
        snapshot = SnapshotDB(snapshot_path)
        print(f"[backfill] reaproveitando snapshot existente: {snapshot_path.name}")
    else:
        try:
            snapshot = build_snapshot_db(args.pg_container, args.pg_db, args.pg_user, snapshot_path)
        except Exception as exc:
            print(f"ERRO: nao foi possivel exportar o snapshot do banco ({exc}).", file=sys.stderr)
            return 2
    total_snapshot = snapshot.count()
    if total_snapshot == 0:
        print("ERRO: snapshot do banco vazio; nada a comparar.", file=sys.stderr)
        return 2
    print(f"[backfill] snapshot do banco: {total_snapshot} produtos com GTIN")

    # Processa um arquivo por vez e mantem apenas os candidatos daquele provider,
    # para nao acumular todo o catalogo na memoria.
    updates_by_provider: Dict[str, List[Dict[str, Any]]] = {}
    processed = 0
    for path in sorted(audit_dir.glob("*_catalog.jsonl")):
        provider = provider_from_filename(path, {})
        if providers_filter and provider not in providers_filter:
            continue
        if path.stat().st_size == 0:
            continue
        stats.files_read += 1
        print(f"[backfill] lendo {path.name} provider={provider}", flush=True)
        best: Dict[str, Candidate] = {}
        for record in iter_audit_records(path):
            stats.lines_read += 1
            if record.get("__invalid__"):
                stats.lines_invalid += 1
                continue
            gtin = norm_gtin(record.get("code"))
            if not gtin:
                continue
            description = norm_text(record.get("description"))
            attributes_json = as_text(record.get("attributesJson"))
            raw_payload = as_text(record.get("rawPayload"))
            score = rich_score(description) + attribute_richness(attributes_json) + rich_score(raw_payload)
            current = best.get(gtin)
            if current is not None and (score, len(description)) <= (current.rich_score, len(current.description)):
                continue
            best[gtin] = Candidate(
                gtin=gtin,
                provider=provider,
                description=description,
                attributes_json=attributes_json,
                raw_payload=raw_payload,
                name=norm_text(record.get("name")),
                brand=norm_text(record.get("brand")),
                category=norm_text(record.get("category")),
                ncm=norm_text(record.get("ncm")),
                unit=norm_text(record.get("unit")),
                manufacturer=norm_text(record.get("manufacturer")),
                package_description=norm_text(record.get("packageDescription")),
                rich_score=score,
                source_file=path.name,
            )
        stats.candidates += len(best)
        for gtin, candidate in best.items():
            if args.limit and processed >= args.limit:
                break
            processed += 1
            payload = decide_updates(candidate, snapshot.get(gtin), stats, args.min_description_gain)
            if payload is not None:
                updates_by_provider.setdefault(provider, []).append(payload)
        best.clear()
        if args.limit and processed >= args.limit:
            break

    print(
        f"[backfill] arquivos={stats.files_read} linhas={stats.lines_read} "
        f"invalidas={stats.lines_invalid} candidatos={stats.candidates}"
    )
    total_updates = sum(len(v) for v in updates_by_provider.values())
    print("\n=== RESUMO ===")
    print(f"  candidatos analisados : {processed}")
    print(f"  ausentes no banco     : {stats.not_in_db} (ignorados)")
    print(f"  ja completos          : {stats.unchanged}")
    print(f"  a enriquecer          : {stats.improved}")
    for key, count in sorted(stats.improvements.items(), key=lambda kv: kv[1], reverse=True):
        print(f"      {key:20s} {count}")

    if args.dry_run:
        print("\n[backfill] dry-run: nenhuma alteracao enviada.")
        return 0

    if not args.email or not args.password:
        print("ERRO: --email e --password sao obrigatorios fora do --dry-run", file=sys.stderr)
        return 1
    if total_updates == 0:
        print("[backfill] nada a enviar.")
        return 0

    login_args = (args.api_base, args.login_endpoint, args.email, args.password)
    token_holder = {"token": login_super_admin(*login_args)}
    session = requests.Session()
    session.headers.update({"User-Agent": "Mozilla/5.0 (compatible; MercadoFlowBackfill/1.0)"})
    totals = empty_totals()

    for provider, items in updates_by_provider.items():
        batch_size = max(1, args.batch_size)
        for start in range(0, len(items), batch_size):
            batch = items[start : start + batch_size]
            try:
                result = send_batch(
                    session,
                    args.api_base,
                    args.import_endpoint,
                    token_holder,
                    login_args,
                    provider,
                    args.source_license,
                    args.confidence,
                    batch,
                )
            except Exception as exc:
                stats.failed += len(batch)
                print(f"[backfill] falha provider={provider} lote={start} erro={exc}", file=sys.stderr)
                continue
            stats.sent += len(batch)
            for key, value in result.items():
                totals[key] += int(value)
            print(
                f"[backfill] {provider}: enviados={stats.sent}/{total_updates} "
                f"importados={totals.get('importedProducts', 0)}",
                flush=True,
            )

    print("\n=== TOTAIS DA API ===")
    for key, value in totals.items():
        print(f"  {key:24s} {value}")
    print(f"  enviados={stats.sent} falhas={stats.failed}")
    return 0 if stats.failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
