#!/usr/bin/env python3
"""Gera o banco de imagens genéricas recortadas (etapa 2 de 2).

Lê os candidatos de generic_library_harvest.py, fica só com o que não tem código
de barras de fabricante, baixa cada foto, recorta o fundo com um modelo de
segmentação (BiRefNet), apara as sobras e grava WebP com transparência, mais o
índice (index.json) que o backend importa.

Roda FORA da VPS: o modelo leva ~16 s por foto e ~1,5 GB de memória numa CPU
comum. Precisa de `pip install "rembg[cpu]" pillow requests` (não está na imagem
dos coletores, de propósito).

  python generic_library_build.py --candidates candidatos.json --out-dir biblioteca
  python generic_library_build.py ... --groups hortifruti,carnes --limit 200

É retomável: foto já gravada é pulada.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import re
import sys
import time
import unicodedata
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests
from PIL import Image

MAX_SIDE = 1000
# Lado da foto entregue ao modelo: ele trabalha em 1024 px, e acima disso so o tempo dobra.
SOURCE_SIDE = 1100
MIN_SOURCE_SIDE = 500
# Recorte que sobra quase nada ou quase tudo é falha do modelo, não produto.
MIN_COVERAGE, MAX_COVERAGE = 0.04, 0.97
STORE_PRIORITY = ("Hortifruti", "Oba Hortifruti", "Zona Sul", "Covabra", "Savegnago")
# Sufixos de venda que não descrevem o produto ("Banana Prata Unidade" → "Banana Prata").
SUFFIX_RE = re.compile(
    r"[\s\-–,]*\b(unidade|unid|und|un|kg|quilo|bandeja|bdj|pacote|pct|pc|aprox\.?|aproximadamente|granel|a granel)\b\.?"
    r"(\s*\d+[.,]?\d*\s*(kg|g|gr|ml|l|un|unidades?)?)?\s*$",
    re.IGNORECASE,
)
WEIGHT_RE = re.compile(r"[\s\-–,]*\b\d+[.,]?\d*\s*(kg|g|gr|ml|l)\b\.?\s*$", re.IGNORECASE)
# Marca própria da loja ou nenhuma: é o produto genérico de verdade. Marca nacional
# sem código cadastrado na loja (Seara, Sadia...) já ganha foto pelo catálogo.
OWN_BRANDS = {
    "", "hortifruti", "oba", "oba bem querer", "oba reserve", "zona sul", "in natura", "sem marca", "propria",
    "padaria", "quasi pronto", "cariorta", "do seu jeito", "corte doro", "cia do peixe", "organicos", "savegnago",
    "natural da terra", "covabra", "acougue", "peixaria", "rotisserie", "generico",
}
GROUP_ORDER = {"hortifruti": 0, "carnes": 1, "padaria": 2, "frios": 3}
# Categorias de industrializado dentro das seções de frescos: têm marca e código de
# barras de fabricante, mesmo quando a loja não cadastrou.
INDUSTRIAL_CATEGORY_WORDS = (
    "iogurt", "sobremesa", "requeij", "cremos", "manteiga", "margarina", "leite", "creme", "chantilly", "torrada",
    "pate", "conserva", "boursin", "antepasto", "pizza", "refeic", "prato", "sanduich", "panetone", "congelad",
    "bebida", "suplement", "biscoit", "massas", "molho",
)
# Palavras que são nome de marca mas também de produto: não servem para barrar.
BRAND_STOPWORDS = {
    "natural", "fresh", "organico", "organicos", "premium", "select", "especial", "tradicional", "caseiro", "fazenda",
    "sitio", "campo", "ouro", "sol", "bom", "bela", "real", "rei", "mineiro", "colonial", "serra", "terra", "vale",
    "nobre", "angus", "light", "fit", "grill", "gourmet", "original", "italiano", "frances", "portuguesa", "argentino",
}


def load_brands(path: str) -> List[List[str]]:
    """Marcas de fabricante conhecidas (uma por linha, "marca|quantidade"), como sequências de palavras.

    Saem do nosso catálogo:
      psql -At -F "|" -c "select lower(brand), count(*) from product_enrichments
                          where coalesce(brand,'') <> '' group by 1 having count(*) >= 8"
    """
    brands: List[List[str]] = []
    if not path:
        return brands
    for line in Path(path).read_text(encoding="utf-8", errors="ignore").splitlines():
        words = re.findall(r"[a-z0-9]+", plain(line.split("|")[0]))
        text = " ".join(words)
        if not words or text in OWN_BRANDS or len(text) < 4:
            continue
        if len(words) == 1 and (words[0] in BRAND_STOPWORDS or words[0].isdigit()):
            continue
        brands.append(words)
    return brands


def refine_brands(brands: List[List[str]], candidates: List[Dict[str, Any]]) -> List[List[str]]:
    """Tira da lista as "marcas" que são palavra comum (salada, peixe, minas, fresco).

    Marca de verdade só aparece no nome de produto daquela marca; palavra comum
    aparece em produtos de várias marcas. Mede isso nos próprios candidatos, usando
    as lojas que cadastram a marca do fabricante (a Hortifruti põe a própria loja).
    """
    seen: Dict[str, int] = {}
    own: Dict[str, int] = {}
    for cand in candidates:
        if cand["store"] == "Hortifruti":
            continue
        brand = " ".join(re.findall(r"[a-z0-9]+", plain(cand.get("brand"))))
        for word in set(re.findall(r"[a-z0-9]+", plain(cand["name"]))):
            seen[word] = seen.get(word, 0) + 1
            if brand == word:
                own[word] = own.get(word, 0) + 1
    kept: List[List[str]] = []
    for brand in brands:
        if len(brand) > 1:
            kept.append(brand)
            continue
        word = brand[0]
        # Nunca vista nos frescos: fica. Vista, mas quase nunca como a marca do produto: é palavra comum.
        if seen.get(word, 0) >= 3 and own.get(word, 0) / seen[word] < 0.5:
            continue
        kept.append(brand)
    return kept


def has_brand(name: str, brands: List[List[str]], index: Dict[str, List[List[str]]]) -> Optional[str]:
    words = re.findall(r"[a-z0-9]+", plain(name))
    for position, word in enumerate(words):
        for brand in index.get(word, ()):
            if words[position:position + len(brand)] == brand:
                return " ".join(brand)
    return None
# Não é produto fresco genérico mesmo sem código: kits, flores, utensílios.
SKIP_WORDS = ("kit ", "cesta", "buque", "vaso", "arranjo", "sacola", "embalagem", "taxa", "servico", "cartao")


def plain(text: Any) -> str:
    value = unicodedata.normalize("NFKD", str(text or "").lower())
    return "".join(ch for ch in value if not unicodedata.combining(ch))


def tidy_name(name: str) -> str:
    text = " ".join(str(name or "").split())
    for _ in range(3):
        text = WEIGHT_RE.sub("", SUFFIX_RE.sub("", text)).strip(" -–,")
    if text.isupper() or text.islower():
        small = {"de", "da", "do", "das", "dos", "e", "com", "em", "a", "o", "para", "sem"}
        words = text.lower().split()
        text = " ".join(w if (w in small and i > 0) else w.capitalize() for i, w in enumerate(words))
    return text


def slug_for(name: str, key: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", plain(name)).strip("-")[:60] or "imagem"
    return f"{base}-{hashlib.sha1(key.encode('utf-8')).hexdigest()[:6]}"


def select(candidates: List[Dict[str, Any]], groups: Optional[set], brands: Optional[List[List[str]]] = None) -> List[Dict[str, Any]]:
    order = {store: i for i, store in enumerate(STORE_PRIORITY)}
    brand_index: Dict[str, List[List[str]]] = {}
    for brand in brands or []:
        brand_index.setdefault(brand[0], []).append(brand)
    picked: Dict[str, Dict[str, Any]] = {}
    seen_urls: set = set()
    for cand in sorted(candidates, key=lambda c: (GROUP_ORDER.get(c["group"], 9), order.get(c["store"], 99))):
        if not cand.get("generic") or (groups and cand["group"] not in groups) or cand["group"] not in GROUP_ORDER:
            continue
        if plain(cand.get("brand")).strip() not in OWN_BRANDS:
            continue
        if any(word in plain(cand.get("category")) for word in INDUSTRIAL_CATEGORY_WORDS):
            continue
        if brand_index and has_brand(cand["name"], brands or [], brand_index):
            continue
        name = tidy_name(cand["name"])
        normalized = plain(name)
        if len(normalized) < 3 or any(word in normalized for word in SKIP_WORDS):
            continue
        url = cand["imageUrl"].split("?")[0]
        if url in seen_urls:
            continue
        seen_urls.add(url)
        # Mesmo nome em lojas diferentes: fica uma foto por loja, para o designer ter opção.
        picked.setdefault(f"{normalized}|{cand['store']}", {**cand, "name": name})
    return list(picked.values())


def cut_out(source: Image.Image, session: Any) -> Optional[Image.Image]:
    from rembg import remove

    result = remove(source, session=session, post_process_mask=True).convert("RGBA")
    alpha = result.getchannel("A")
    box = alpha.point(lambda v: 255 if v > 24 else 0).getbbox()
    if box is None:
        return None
    coverage = sum(alpha.histogram()[25:]) / float(alpha.width * alpha.height)
    if not MIN_COVERAGE <= coverage <= MAX_COVERAGE:
        return None
    pad = int(max(result.size) * 0.02)
    box = (max(0, box[0] - pad), max(0, box[1] - pad), min(result.width, box[2] + pad), min(result.height, box[3] + pad))
    result = result.crop(box)
    if max(result.size) < 300:
        return None
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--candidates", required=True)
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--groups", default="", help="hortifruti,carnes,padaria,frios (vazio = todos)")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--model", default="birefnet-general-lite")
    parser.add_argument("--brands-file", default="", help="marcas de fabricante conhecidas; ver load_brands")
    args = parser.parse_args()

    out_dir = Path(args.out_dir)
    (out_dir / "library").mkdir(parents=True, exist_ok=True)
    index_path = out_dir / "index.json"
    index: Dict[str, Dict[str, Any]] = {}
    if index_path.exists():
        index = {item["storageKey"]: item for item in json.loads(index_path.read_text(encoding="utf-8"))}
    rejected_path = out_dir / "rejected.json"
    rejected: Dict[str, str] = json.loads(rejected_path.read_text(encoding="utf-8")) if rejected_path.exists() else {}

    groups = {g.strip() for g in args.groups.split(",") if g.strip()} or None
    candidates = json.loads(Path(args.candidates).read_text(encoding="utf-8"))
    todo = select(candidates, groups, refine_brands(load_brands(args.brands_file), candidates))
    if args.limit:
        todo = todo[: args.limit]
    print(f"{len(todo)} fotos selecionadas; {len(index)} ja prontas", flush=True)

    from rembg import new_session

    session = new_session(args.model)
    http = requests.Session()
    http.headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36"
    started = time.time()
    done = 0

    def flush() -> None:
        index_path.write_text(json.dumps(list(index.values()), ensure_ascii=False, indent=1), encoding="utf-8")
        rejected_path.write_text(json.dumps(rejected, ensure_ascii=False, indent=1), encoding="utf-8")

    for number, cand in enumerate(todo, start=1):
        slug = slug_for(cand["name"], cand["key"])
        key = f"library/{slug}.webp"
        if key in index or cand["key"] in rejected:
            continue
        existing = out_dir / key
        if existing.is_file() and existing.stat().st_size > 0:
            # Interrompido antes de gravar o indice: a imagem pronta vale, nao refaz.
            try:
                with Image.open(existing) as ready:
                    width, height = ready.size
                index[key] = {
                    "storageKey": key, "name": cand["name"], "group": cand["group"], "category": cand["category"],
                    "store": cand["store"], "width": width, "height": height, "source": cand["imageUrl"],
                }
                continue
            except Exception:
                existing.unlink()
        try:
            response = http.get(cand["imageUrl"], timeout=30)
            response.raise_for_status()
            with Image.open(io.BytesIO(response.content)) as opened:
                opened.draft("RGB", (SOURCE_SIDE, SOURCE_SIDE))
                if min(opened.size) < MIN_SOURCE_SIDE:
                    rejected[cand["key"]] = f"pequena {opened.size}"
                    continue
                source = opened.convert("RGBA") if opened.mode in ("RGBA", "LA", "P") else opened.convert("RGB")
            if source.mode == "RGBA":
                white = Image.new("RGBA", source.size, (255, 255, 255, 255))
                white.alpha_composite(source)
                source = white.convert("RGB")
            source.thumbnail((SOURCE_SIDE, SOURCE_SIDE), Image.Resampling.LANCZOS)
            cut = cut_out(source, session)
            if cut is None:
                rejected[cand["key"]] = "recorte falhou"
                continue
            cut.thumbnail((MAX_SIDE, MAX_SIDE), Image.Resampling.LANCZOS)
            cut.save(out_dir / key, format="WEBP", quality=90, method=6, exact=False)
        except Exception as exc:  # foto fora do ar ou corrompida: segue para a próxima
            rejected[cand["key"]] = f"erro {type(exc).__name__}"
            continue
        index[key] = {
            "storageKey": key,
            "name": cand["name"],
            "group": cand["group"],
            "category": cand["category"],
            "store": cand["store"],
            "width": cut.width,
            "height": cut.height,
            "source": cand["imageUrl"],
        }
        done += 1
        if done % 25 == 0:
            flush()
            rate = (time.time() - started) / done
            print(f"{number}/{len(todo)} prontas={len(index)} recusadas={len(rejected)} {rate:.1f}s/foto", flush=True)
    flush()
    size = sum(f.stat().st_size for f in (out_dir / "library").glob("*.webp"))
    print(f"fim: {len(index)} imagens, {size / 1e6:.0f} MB, {len(rejected)} recusadas", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
