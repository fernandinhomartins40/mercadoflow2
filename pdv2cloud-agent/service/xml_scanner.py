"""Varredura automatizada de pastas com XMLs de NF-e/NFC-e.

Objetivo: eliminar a etapa em que o usuário precisava saber onde o emissor do
PDV grava os XMLs e selecionar as pastas manualmente. O scanner percorre os
discos fixos, ignora as árvores que sabidamente não contêm nota fiscal e
**valida por amostragem** — abre alguns arquivos de cada pasta candidata e
confirma que são mesmo NF-e/NFC-e — antes de sugerir qualquer caminho.

A validação por amostra é o que diferencia isto de uma lista de caminhos
prováveis: uma pasta só é sugerida se realmente contiver nota fiscal legível.
"""

from __future__ import annotations

import logging
import os
import re
import string
import time
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Iterable, Iterator

logger = logging.getLogger("PDV2Cloud")

# Chave da NF-e: 44 dígitos. Serve como confirmação barata de que o XML é fiscal.
CHAVE_RE = re.compile(rb"[0-9]{44}")
# Marcadores de NF-e/NFC-e no conteúdo do XML, testados sem parse completo.
FISCAL_MARKERS = (b"<infNFe", b"<infNFCe", b"<nfeProc", b"<NFe", b"<CFe", b"<infCFe")

XML_SUFFIXES = (".xml",)
ARCHIVE_SUFFIXES = (".zip",)

# Diretórios que nunca contêm XML de venda e cuja varredura só custa tempo.
SKIP_DIR_NAMES = {
    "$recycle.bin", "system volume information", "windows", "winnt",
    "node_modules", ".git", ".svn", "__pycache__", "temp", "tmp", "cache",
    "appdata", "microsoft", "microsoft office", "windowsapps", "drivers",
    "driverstore", "assembly", "installer", "servicing", "winsxs",
    "program files", "program files (x86)", "arquivos de programas",
    "recovery", "perflogs", "msocache", "onedrive", "onedrivetemp",
    "dropbox", "google drive", "steam", "steamapps",
}

# Nomes que indicam fortemente uma pasta de notas fiscais — usados para ranquear,
# não para filtrar (uma pasta só entra se a amostra confirmar conteúdo fiscal).
POSITIVE_NAME_HINTS = (
    "nfe", "nfce", "nf-e", "nf-ce", "sat", "cfe", "xml", "xmls", "fiscal",
    "notas", "nota", "emitidas", "autorizadas", "vendas", "cupom", "cupons",
    "danfe", "retorno", "pdv", "ecf",
)

# Emissores conhecidos: verificados antes da varredura ampla, porque acertam na
# maioria das instalações e tornam o resultado quase instantâneo.
KNOWN_PDV_PATHS = (
    "C:/SAT/XML", "C:/SAT", "C:/NFe/Emitidas", "C:/NFe/XML", "C:/NFe",
    "C:/NFCe/XML", "C:/NFCe/Emitidas", "C:/NFCe", "C:/Emissor/XML",
    "C:/PDV/XMLs", "C:/PDV/XML", "C:/PDV", "C:/XML", "C:/XMLS",
    "C:/Fiscal/XML", "C:/Notas", "C:/NotasFiscais",
    "C:/Program Files/SAT/XML", "C:/Program Files (x86)/SAT/XML",
    "C:/Arquivos de Programas/NFe/XML",
    "C:/ProgramData/NFe", "C:/ProgramData/NFCe",
)


@dataclass
class FolderCandidate:
    """Pasta que contém XMLs fiscais confirmados por amostragem."""

    path: str
    xml_count: int = 0
    zip_count: int = 0
    validated_samples: int = 0
    invalid_samples: int = 0
    newest_mtime: float = 0.0
    score: float = 0.0
    recommended: bool = False

    @property
    def newest_iso(self) -> str | None:
        if not self.newest_mtime:
            return None
        return time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(self.newest_mtime))

    def to_dict(self) -> dict:
        data = asdict(self)
        data["newestModified"] = self.newest_iso
        # Nomes em camelCase para consumo direto pelo Electron/renderer.
        data["xmlCount"] = data.pop("xml_count")
        data["zipCount"] = data.pop("zip_count")
        data["validatedSamples"] = data.pop("validated_samples")
        data["invalidSamples"] = data.pop("invalid_samples")
        data.pop("newest_mtime", None)
        return data


@dataclass
class ScanResult:
    candidates: list[FolderCandidate] = field(default_factory=list)
    scanned_dirs: int = 0
    elapsed_seconds: float = 0.0
    truncated: bool = False

    def to_dict(self) -> dict:
        return {
            "candidates": [c.to_dict() for c in self.candidates],
            "scannedDirs": self.scanned_dirs,
            "elapsedSeconds": round(self.elapsed_seconds, 2),
            "truncated": self.truncated,
            "recommended": [c.path for c in self.candidates if c.recommended],
        }


def looks_like_fiscal_xml(path: Path, read_bytes: int = 8192) -> bool:
    """Confirma que o arquivo é uma nota fiscal sem fazer o parse completo.

    Lê apenas o início do arquivo: os marcadores e a chave de 44 dígitos
    aparecem no cabeçalho, então isso basta e mantém a varredura rápida mesmo
    em pastas com dezenas de milhares de notas.
    """
    try:
        with path.open("rb") as handle:
            head = handle.read(read_bytes)
    except (OSError, PermissionError):
        return False

    if not head:
        return False

    has_marker = any(marker in head for marker in FISCAL_MARKERS)
    if has_marker:
        return True

    # Alguns emissores gravam o XML sem prólogo reconhecível; a chave de acesso
    # combinada com a extensão .xml já é evidência suficiente.
    return b"<" in head and CHAVE_RE.search(head) is not None


def _should_skip_dir(name: str) -> bool:
    return name.lower() in SKIP_DIR_NAMES or name.startswith("$")


def _name_hint_bonus(path: Path) -> float:
    """Bônus de ranqueamento por nome da pasta e de seus pais imediatos."""
    parts = [p.lower() for p in path.parts[-3:]]
    joined = " ".join(parts)
    return sum(3.0 for hint in POSITIVE_NAME_HINTS if hint in joined)


def available_fixed_drives() -> list[Path]:
    """Discos fixos locais. Evita rede e removíveis, que tornam a varredura lenta."""
    drives: list[Path] = []
    try:
        import ctypes

        kernel32 = ctypes.windll.kernel32
        DRIVE_FIXED = 3
        for letter in string.ascii_uppercase:
            root = f"{letter}:\\"
            if kernel32.GetDriveTypeW(root) == DRIVE_FIXED:
                drives.append(Path(root))
    except Exception:
        # Fora do Windows (ou sem ctypes): cai para o que existir.
        for letter in string.ascii_uppercase:
            root = Path(f"{letter}:\\")
            if root.exists():
                drives.append(root)
    if not drives:
        drives.append(Path("C:/"))
    return drives


def _inspect_directory(
    directory: Path,
    filenames: Iterable[str],
    sample_size: int,
) -> FolderCandidate | None:
    """Conta XMLs da pasta e valida uma amostra. Retorna None se não for fiscal."""
    xml_files: list[str] = []
    zip_count = 0

    for filename in filenames:
        lowered = filename.lower()
        if lowered.endswith(XML_SUFFIXES):
            xml_files.append(filename)
        elif lowered.endswith(ARCHIVE_SUFFIXES):
            zip_count += 1

    if not xml_files and not zip_count:
        return None

    candidate = FolderCandidate(
        path=str(directory).replace("\\", "/"),
        xml_count=len(xml_files),
        zip_count=zip_count,
    )

    # Amostra do fim da lista: arquivos recentes têm mais chance de refletir o
    # que o emissor grava hoje (nomes costumam ser ordenados por chave/data).
    sample = xml_files[-sample_size:] if len(xml_files) > sample_size else xml_files
    for filename in sample:
        file_path = directory / filename
        if looks_like_fiscal_xml(file_path):
            candidate.validated_samples += 1
            try:
                mtime = file_path.stat().st_mtime
                candidate.newest_mtime = max(candidate.newest_mtime, mtime)
            except OSError:
                pass
        else:
            candidate.invalid_samples += 1

    # Sem nenhuma amostra válida, a pasta tem XML mas não é de nota fiscal
    # (configuração, layout, relatório) — descartada.
    if candidate.validated_samples == 0:
        # Pastas só com .zip ainda merecem consideração: o agente descompacta.
        if zip_count == 0:
            return None

    return candidate


def _score(candidate: FolderCandidate, now: float) -> float:
    """Ranqueia por volume, frescor e nome, com peso maior para conteúdo real."""
    import math

    score = 0.0
    score += min(math.log10(candidate.xml_count + 1) * 12.0, 40.0)
    score += candidate.validated_samples * 6.0
    score -= candidate.invalid_samples * 2.0
    score += min(candidate.zip_count, 10) * 0.5
    score += _name_hint_bonus(Path(candidate.path))

    if candidate.newest_mtime:
        age_days = max((now - candidate.newest_mtime) / 86400.0, 0.0)
        if age_days <= 2:
            score += 25.0
        elif age_days <= 15:
            score += 15.0
        elif age_days <= 90:
            score += 6.0
        elif age_days > 730:
            score -= 10.0

    return round(score, 2)


def _walk_roots(
    roots: Iterable[Path],
    max_depth: int,
    deadline: float,
    max_dirs: int,
    state: dict,
) -> Iterator[tuple[Path, list[str]]]:
    """os.walk podado: respeita profundidade, lista de exclusão e orçamento de tempo."""
    for root in roots:
        if not root.exists():
            continue
        root_depth = len(root.parts)

        for dirpath, dirnames, filenames in os.walk(root, topdown=True, onerror=lambda _: None):
            if time.monotonic() > deadline or state["scanned"] >= max_dirs:
                state["truncated"] = True
                return

            current = Path(dirpath)
            depth = len(current.parts) - root_depth

            if depth >= max_depth:
                dirnames[:] = []
            else:
                # Poda in-place: os.walk não desce no que for removido daqui.
                dirnames[:] = [d for d in dirnames if not _should_skip_dir(d)]

            state["scanned"] += 1
            yield current, filenames


def scan_for_xml_folders(
    roots: Iterable[str | Path] | None = None,
    max_depth: int = 6,
    timeout_seconds: float = 45.0,
    max_dirs: int = 60_000,
    sample_size: int = 3,
    min_score: float = 8.0,
    max_results: int = 25,
) -> ScanResult:
    """Localiza pastas com XMLs fiscais.

    Estratégia em duas fases: primeiro os caminhos de emissores conhecidos
    (barato e resolve a maioria dos casos), depois a varredura ampla dos discos
    fixos com orçamento de tempo. O orçamento garante que a UI nunca fique
    presa, mesmo em máquinas com discos grandes ou lentos.
    """
    started = time.monotonic()
    deadline = started + timeout_seconds
    now = time.time()

    result = ScanResult()
    found: dict[str, FolderCandidate] = {}

    # ── Fase 1: caminhos conhecidos ─────────────────────────────────────────
    for known in KNOWN_PDV_PATHS:
        known_path = Path(known)
        if not known_path.is_dir():
            continue
        try:
            filenames = [e.name for e in os.scandir(known_path) if e.is_file()]
        except (OSError, PermissionError):
            continue
        candidate = _inspect_directory(known_path, filenames, sample_size)
        if candidate:
            found[candidate.path.lower()] = candidate
        result.scanned_dirs += 1

    # ── Fase 2: varredura ampla ─────────────────────────────────────────────
    scan_roots = [Path(r) for r in roots] if roots else available_fixed_drives()
    state = {"scanned": result.scanned_dirs, "truncated": False}

    for directory, filenames in _walk_roots(scan_roots, max_depth, deadline, max_dirs, state):
        key = str(directory).replace("\\", "/").lower()
        if key in found:
            continue
        candidate = _inspect_directory(directory, filenames, sample_size)
        if candidate:
            found[key] = candidate

    result.scanned_dirs = state["scanned"]
    result.truncated = state["truncated"]

    # ── Ranqueamento ────────────────────────────────────────────────────────
    candidates = list(found.values())
    for candidate in candidates:
        candidate.score = _score(candidate, now)

    candidates = [c for c in candidates if c.score >= min_score]
    candidates.sort(key=lambda c: c.score, reverse=True)
    candidates = candidates[:max_results]

    # Pré-seleciona as pastas claramente boas para o wizard marcar sozinho.
    for candidate in candidates:
        candidate.recommended = candidate.score >= 25.0 and candidate.validated_samples > 0

    # Se nada passou o corte de recomendação mas há candidatas, promove a melhor:
    # é preferível sugerir a mais provável a devolver uma tela vazia ao usuário.
    if candidates and not any(c.recommended for c in candidates):
        candidates[0].recommended = True

    result.candidates = candidates
    result.elapsed_seconds = time.monotonic() - started

    logger.info(
        "Varredura de XML concluída: %d pastas candidatas em %d diretórios (%.1fs, truncada=%s)",
        len(result.candidates), result.scanned_dirs, result.elapsed_seconds, result.truncated,
    )
    return result


def main() -> int:
    """Entrada de linha de comando: imprime JSON para o processo Electron."""
    import argparse
    import json

    parser = argparse.ArgumentParser(description="Varredura de pastas com XML fiscal")
    parser.add_argument("--timeout", type=float, default=45.0)
    parser.add_argument("--max-depth", type=int, default=6)
    parser.add_argument("--root", action="append", default=None,
                        help="Limita a varredura a estas raízes (repetível)")
    args = parser.parse_args()

    result = scan_for_xml_folders(
        roots=args.root,
        max_depth=args.max_depth,
        timeout_seconds=args.timeout,
    )
    print(json.dumps(result.to_dict(), ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
