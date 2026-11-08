#!/usr/bin/env node
// MCP de temas de encarte do MercadoFlow (stdio, sem dependências; Node 18+).
//
// Roda na máquina de quem usa o Codex: lê as imagens que o Codex gerou no
// disco e monta o tema pela API de temas, com a chave criada pelo superadmin
// na página "Temas de encarte". O tema fica em rascunho até o superadmin
// conferir e publicar.
//
// ~/.codex/config.toml:
//   [mcp_servers.mercadoflow-temas]
//   command = "node"
//   args = ["C:\\caminho\\mercadoflow-temas.mjs"]
//   env = { MERCADOFLOW_URL = "https://mercadoflow.com", MERCADOFLOW_TEMAS_KEY = "mftema_..." }

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { spawn } from 'node:child_process';

const BASE = (process.env.MERCADOFLOW_URL || 'https://mercadoflow.com').replace(/\/+$/, '');
const KEY = process.env.MERCADOFLOW_TEMAS_KEY || '';
const API = `${BASE}/api/v1/temas-api`;

const FORMATS = {
  story: { label: 'Story e status', width: 1080, height: 1920 },
  post: { label: 'Post do feed', width: 1080, height: 1350 },
  square: { label: 'Quadrado', width: 1080, height: 1080 },
  a4: { label: 'Folha A4', width: 2480, height: 3508 },
  tv: { label: 'TV da loja', width: 1920, height: 1080 },
};
const PRESETS = ['respirar', 'parallax', 'entrada', 'selo', 'zoom', 'festa'];
// Mesma lista de features/art-studio/style.ts e ArtFormats.FONTS.
const FONT_KEYS = ['anton', 'bebas', 'archivo-black', 'alfa-slab', 'passion', 'titan', 'oswald', 'barlow-condensed', 'roboto-condensed',
  'saira-condensed', 'archivo-narrow', 'fjalla', 'teko', 'barlow', 'montserrat', 'poppins', 'inter', 'rubik', 'league-spartan',
  'fredoka', 'lilita', 'bangers', 'luckiest', 'righteous'];
// Mesmos de LOOKS em features/art-studio/style.ts.
const VISUAIS = [
  { nome: 'vitrine', estilo: { card: { layout: 'classic', photoBg: 'circle', photoShadow: true, radius: 0.12 }, tag: { shape: 'pill', tilt: 0, align: 'center', gradient: true }, badge: { show: true, shape: 'circle', position: 'left' } } },
  { nome: 'foto-grande', estilo: { card: { layout: 'photo', radius: 0.05, photoShadow: true }, tag: { shape: 'burst', tilt: -6 }, badge: { show: true, shape: 'burst', position: 'left' } } },
  { nome: 'lista', estilo: { grid: { layout: 'list' }, card: { layout: 'side', radius: 0.04 }, tag: { shape: 'ribbon', tilt: 0 } } },
  { nome: 'cupom', estilo: { card: { shape: 'ticket', layout: 'name-top', radius: 0.06 }, tag: { shape: 'square', tilt: 0, align: 'center' }, badge: { show: true, shape: 'tag', position: 'right' } } },
  { nome: 'mosaico', estilo: { grid: { layout: 'mosaic' }, card: { vary: 'alternate', radius: 0.08, photoBg: 'blob' }, tag: { shape: 'rounded', tilt: -4 } } },
  { nome: 'vidro', estilo: { card: { fill: 'glass', opacity: 0.55, radius: 0.14, shadow: false, border: '#ffffff', borderWidth: 0.008 }, tag: { shape: 'pill', tilt: 0, gradient: true } } },
  { nome: 'pendurada', estilo: { card: { style: 'none', photoShadow: true, photoBg: 'rays' }, tag: { shape: 'hang', tilt: -8 } } },
  { nome: 'destaque', estilo: { grid: { layout: 'hero' }, card: { layout: 'price-top', shape: 'arch', fill: 'gradient' }, tag: { shape: 'circle', tilt: 0 }, badge: { show: true, shape: 'circle', position: 'right' } } },
];
const AREA_KEYS = { logo: 'logo', produtos: 'products', rodape: 'footer', selo: 'seal' };
const COLOR_KEYS = { etiqueta: 'tag', numero: 'tagText', cartao: 'card', nome: 'cardText', faixa: 'accent' };

const GUIDE = `Guia para criar temas de encarte do MercadoFlow (supermercado brasileiro).

FLUXO
1. criar_tema (nome e ocasião).
2. Gere as imagens com a sua ferramenta de imagem, salvando os PNGs no disco:
   - uma BASE opaca por formato, no tamanho exato: ${Object.entries(FORMATS).map(([k, f]) => `${k} ${f.width}x${f.height}`).join(', ')};
     a base é só o "papel" (cor, gradiente, textura). Não desenhe enfeites nela.
   - cada ENFEITE num PNG próprio com fundo transparente (um objeto por arquivo, com margem transparente);
     os mesmos enfeites servem para todos os formatos; gere em resolução boa para o A4.
   - o SELO 3D do tema num PNG transparente (letreiro da campanha, ex.: "Ofertas de Aniversário").
   - nunca desenhe produtos, preços, logo de mercado ou textos de endereço: o sistema coloca isso.
3. enviar_selo com o PNG do selo.
4. montar_formato para cada formato: base + enfeites com posição (cx, cy = centro em fração da arte, 0 a 1;
   largura = fração da largura da arte; rotacao em graus, sentido horário). Ordem dos enfeites: de trás para frente.
   Passe as áreas junto (ou use definir_areas depois).
5. REVISE EM CICLO, formato por formato, até não sobrar problema:
   a. baixar_previa (com guias) e OLHE a imagem: áreas coloridas, selo 3D na área dele, contorno + id de cada enfeite.
   b. revisar_formato: lista objetiva (enfeite invadindo produtos/logo/selo/rodapé, borda, margem, tamanho, áreas sobrepostas).
   c. corrija com ajustar_elemento (cx, cy, largura, rotacao, opacidade, ordem) e definir_areas (só a área que muda),
      sem reenviar arquivos. Cada design pede áreas próprias: mova e dimensione logo, selo, produtos e rodapé para o desenho.
   d. por último, ver_encarte: print do encarte COMPLETO (fundo, selo, logo, cartões com foto, preço e rodapé),
      igual ao que o cliente vê. Olhe e corrija cartões, etiqueta e cores com atualizar_tema → estilo.
6. atualizar_tema com as cores da etiqueta, o ESTILO (fontes, etiqueta, cartão, nome, rodapé) e as animações,
   tudo combinando com a identidade do fundo.
7. Avise o usuário para conferir e publicar na página de temas. A API não publica.

ÁREAS (retângulos x, y, w, h de 0 a 1 sobre a arte)
- produtos (obrigatória): a maior área calma, onde entram os cartões dos produtos; deixe o fundo limpo ali.
- logo: pequena, em geral no alto, para a logo do mercado.
- selo: perto do título ou num canto, para o selo 3D.
- rodape: faixa estreita embaixo, para endereço, telefone e validade.
Mantenha uma margem de segurança de ~4% nas bordas.
Exemplo post: logo {x:0.05,y:0.03,w:0.3,h:0.1}, selo {x:0.7,y:0.03,w:0.25,h:0.12}, produtos {x:0.05,y:0.18,w:0.9,h:0.68}, rodape {x:0.05,y:0.9,w:0.9,h:0.07}.

ANIMAÇÕES (o tema oferece, o mercado escolhe): ${PRESETS.join(', ')}.
A base fica parada; enfeites animam (passe parado: true para travar um enfeite).

CORES DA ETIQUETA (#RRGGBB): etiqueta (fundo do preço), numero (número do preço, contraste alto),
cartao (fundo do cartão, quase branco), nome (nome do produto, escuro), faixa (destaque "leve 3 pague 2").

ESTILO (atualizar_tema → estilo; mande só o que muda, o resto segue o padrão):
- fonts: { price, name, text } — fontes: ${FONT_KEYS.join(', ')}.
  Preço pede fonte de impacto (anton, bebas, archivo-black, passion, titan...); nome, condensada; rodapé, de texto.
- tag (etiqueta de preço): shape rounded|pill|square|burst (explosão)|ribbon (faixa); tilt -15 a 15 (graus);
  align auto|left|center|right; size 0.5 a 1; currency (mostra R$) true/false; cents super|inline;
  border #RRGGBB ou null; borderWidth 0 a 0.15; shadow true/false.
  Formatos novos: circle (selo redondo), hang (etiqueta pendurada com furo). gradient true/false: brilho em degradê.
- card (cartão do produto): style solid|outline|none; radius 0 a 0.5; shadow; border #RRGGBB ou null; borderWidth 0 a 0.06; opacity 0.1 a 1;
  layout auto|classic (foto em cima)|name-top (nome em cima)|price-top (preço em cima)|side (lado a lado)|photo (foto grande, preço por cima);
  shape rect|ticket (cupom com picote)|cut (cantos cortados)|arch (arco no alto); fill flat|gradient|glass (vidro fosco, desfoca o fundo;
  use opacity ~0.5); photoBg none|circle|blob|rays (fundo atrás da foto, na cor da faixa); photoShadow true/false (sombra no chão);
  vary none|tilt (cartões inclinados alternados)|alternate (cores alternadas).
  Sem cartão (style none) ou vidro só funcionam se a área de produtos do fundo for calma; em fundo cheio de detalhe, use cartão cheio.
- grid (grade dos produtos): layout auto|uniform (todos iguais)|hero (1º grande)|list (um por linha)|mosaic (linhas de 2 e 3); gap 0.3 a 2.5.
- badge (selo "-20%" nos produtos com preço antigo): show true/false; shape circle|burst|tag; position left|right.
- name (nome do produto): case upper|title|none; weight 400 a 900; maxLines 1 a 5 ou null (automático);
  align auto|left|center; size 0.6 a 1.4; color #RRGGBB ou null (automática); stroke #RRGGBB ou null (contorno das letras).
- oldPrice: { show } — mostra o "De R$..." riscado.
- footer (rodapé): color #RRGGBB ou null (automática); band #RRGGBB ou null (faixa atrás do texto); bandOpacity 0.1 a 1;
  weight 400 a 900; size 0.5 a 1.4; align left|center|right; case upper|title|none; shadow true/false.
Combine o estilo com a identidade do fundo (ex.: Black Friday: fundo escuro, etiqueta burst amarela, cartão outline;
hortifrúti: cantos bem arredondados, fonte divertida). Fuja do visual de sempre: varie grade, montagem e formato do cartão.

VISUAIS PRONTOS (ponto de partida; mande no estilo e ajuste):
${VISUAIS.map((v) => `- ${v.nome}: ${JSON.stringify(v.estilo)}`).join('\n')}

Depois de mudar o estilo, rode ver_encarte e olhe o resultado.`;

// ── API ──────────────────────────────────────────────────────────────────

const call = async (method, url, body) => {
  if (!KEY) throw new Error('Falta a variável MERCADOFLOW_TEMAS_KEY com a chave criada na página de temas do superadmin.');
  const init = { method, headers: { Authorization: `Bearer ${KEY}` } };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) { init.body = JSON.stringify(body); init.headers['Content-Type'] = 'application/json'; }
  const res = await fetch(`${API}${url}`, init);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* resposta não JSON */ }
  if (!res.ok) throw new Error(data?.message || data?.error || `Erro ${res.status} da API de temas`);
  return data;
};

const uploaded = new Map();
/** Sobe um arquivo uma vez por sessão (mesmo caminho e data de modificação). */
const upload = async (themeId, file) => {
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) throw new Error(`Arquivo não encontrado: ${abs}`);
  const key = `${themeId}|${abs}|${fs.statSync(abs).mtimeMs}`;
  if (uploaded.has(key)) return uploaded.get(key);
  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(abs)]), path.basename(abs));
  const r = await call('POST', `/themes/${themeId}/assets`, form);
  uploaded.set(key, r);
  return r;
};

const slug = (s) => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9_-]+/g, '-').replace(/(^-|-$)/g, '') || 'camada';

const toRegions = (areas) => {
  const out = {};
  for (const [pt, key] of Object.entries(AREA_KEYS)) if (areas?.[pt]) out[key] = areas[pt];
  return out;
};

const summary = (t) => ({
  id: t.id, nome: t.name, ocasiao: t.occasion, situacao: t.status === 'PUBLISHED' ? 'publicado' : 'rascunho',
  selo: !!t.sealUrl, cores: t.palette, animacao: t.animation, estilo: t.style || {},
  formatos: (t.formats || []).map((f) => ({
    formato: f.format, camadas: (f.layers || []).length, areas: Object.keys(f.regions || {}),
    pronto: !!f.regions?.products, previa: f.backgroundUrl ? BASE + f.backgroundUrl : null,
  })),
  pagina: `${BASE}/super-admin/temas/${t.id}`,
});

const requireFormat = (f) => { if (!FORMATS[f]) throw new Error(`Formato inválido: ${f}. Use ${Object.keys(FORMATS).join(', ')}.`); return f; };

const r3 = (v) => Math.round(v * 1000) / 1000;
const SAFE = 0.04;

/**
 * Medidas de um enfeite: centro, tamanho em px e a caixa que ele ocupa já
 * girado (em fração da arte), para comparar com as áreas.
 */
const geometry = (l, formato, ordem) => {
  const { width: W, height: H } = FORMATS[formato];
  const w = l.width * W;
  const h = w * ((l.h || 1) / (l.w || 1));
  const a = ((l.rotation || 0) * Math.PI) / 180;
  const bw = Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a));
  const bh = Math.abs(w * Math.sin(a)) + Math.abs(h * Math.cos(a));
  return {
    id: l.id, nome: l.name, ordem, cx: l.cx, cy: l.cy, largura: l.width, rotacao: l.rotation || 0, opacidade: l.opacity ?? 1,
    parado: !!l.still, escondido: !!l.hidden,
    tamanho_px: { largura: Math.round(w), altura: Math.round(h) },
    caixa: { x: r3(l.cx - bw / 2 / W), y: r3(l.cy - bh / 2 / H), w: r3(bw / W), h: r3(bh / H) },
  };
};

const overlap = (a, b) => {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? (w * h) / (a.w * a.h) : 0;
};

const AREA_NAMES = { products: 'produtos', logo: 'logo', seal: 'selo', footer: 'rodape' };

/** Problemas da montagem de um formato, em texto para a IA corrigir. */
const review = (f) => {
  const issues = [];
  const regions = f.regions || {};
  if (!regions.products) issues.push('Falta a área de produtos (obrigatória para publicar): use definir_areas.');
  for (const key of ['logo', 'seal', 'footer']) if (!regions[key]) issues.push(`Sem área de ${AREA_NAMES[key]}: o encarte fica sem ${AREA_NAMES[key]}.`);
  const layers = f.layers || [];
  if (!layers.some((l) => l.role === 'base')) issues.push('Sem base: o fundo sai branco atrás dos enfeites.');
  const elements = layers.filter((l) => l.role !== 'base' && !l.hidden);
  elements.forEach((l, i) => {
    const g = geometry(l, f.format, i);
    for (const [key, r] of Object.entries(regions)) {
      const o = overlap(g.caixa, r);
      // Produtos precisam de fundo limpo; logo, selo e rodapé toleram um toque de enfeite.
      if (o > (key === 'products' ? 0.02 : 0.15)) issues.push(`"${l.id}" cobre ${Math.round(o * 100)}% de si mesmo dentro da área de ${AREA_NAMES[key]}.`);
    }
    const c = g.caixa;
    const outside = c.x < 0 || c.y < 0 || c.x + c.w > 1 || c.y + c.h > 1;
    const inMargin = c.x < SAFE || c.y < SAFE || c.x + c.w > 1 - SAFE || c.y + c.h > 1 - SAFE;
    if (outside) issues.push(`"${l.id}" passa da borda da arte (fica cortado). Se não for de propósito, traga para dentro.`);
    else if (inMargin) issues.push(`"${l.id}" encosta na margem de segurança de 4% (pode ser cortado na impressão ou no celular).`);
    if (c.w * c.h < 0.002) issues.push(`"${l.id}" está muito pequeno (${g.tamanho_px.largura} px): quase invisível.`);
    if (l.w && g.tamanho_px.largura > l.w * 1.5) issues.push(`"${l.id}" está ampliado ${Math.round((g.tamanho_px.largura / l.w) * 100)}% acima do PNG original (${l.w} px): pode ficar borrado.`);
  });
  for (const [a, ra] of Object.entries(regions)) {
    for (const [b, rb] of Object.entries(regions)) {
      if (a < b && overlap(ra, rb) > 0.05) issues.push(`As áreas de ${AREA_NAMES[a]} e ${AREA_NAMES[b]} se sobrepõem.`);
    }
  }
  return issues;
};

const formatOf = async (temaId, formato) => {
  const t = await call('GET', `/themes/${temaId}`);
  const f = t.formats.find((x) => x.format === requireFormat(formato));
  if (!f) throw new Error(`O formato ${formato} ainda não foi montado: use montar_formato.`);
  return { t, f };
};

/** Resposta das ferramentas que mudam a montagem: já vem com a revisão. */
const revisarDepois = (t, formato) => {
  const f = t.formats.find((x) => x.format === formato);
  return { ok: true, ...describeFormat(f), dica: 'Confira com baixar_previa (com guias).' };
};

const describeFormat = (f) => ({
  formato: f.format, tamanho_px: { largura: FORMATS[f.format].width, altura: FORMATS[f.format].height },
  areas: Object.fromEntries(Object.entries(f.regions || {}).map(([k, v]) => [AREA_NAMES[k] || k, v])),
  base: (f.layers || []).some((l) => l.role === 'base'),
  enfeites: (f.layers || []).filter((l) => l.role !== 'base').map((l, i) => geometry(l, f.format, i)),
  problemas: review(f),
});

const buildLayers = async (themeId, base, elementos = []) => {
  const layers = [];
  if (base) {
    const b = await upload(themeId, base);
    layers.push({ id: 'base', name: 'Fundo', url: b.url, w: b.width, h: b.height, role: 'base', cx: 0.5, cy: 0.5, width: 1, rotation: 0, opacity: 1, still: true });
  }
  const ids = new Set(['base']);
  for (const el of elementos) {
    const u = await upload(themeId, el.caminho);
    let id = slug(el.id || el.nome || path.basename(el.caminho, path.extname(el.caminho)));
    while (ids.has(id)) id += '-2';
    ids.add(id);
    layers.push({
      id, name: el.nome || id, url: u.url, w: u.width, h: u.height, role: 'element',
      cx: el.cx ?? 0.5, cy: el.cy ?? 0.5, width: el.largura ?? 0.3, rotation: el.rotacao ?? 0, opacity: el.opacidade ?? 1, still: !!el.parado,
    });
  }
  return layers;
};

// ── Ferramentas ──────────────────────────────────────────────────────────

const rect = { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' } }, required: ['x', 'y', 'w', 'h'] };
const areas = { type: 'object', description: 'Áreas reservadas (frações de 0 a 1).', properties: { logo: rect, produtos: rect, rodape: rect, selo: rect } };
const element = {
  type: 'object',
  properties: {
    caminho: { type: 'string', description: 'Caminho do PNG transparente no disco.' },
    id: { type: 'string' }, nome: { type: 'string' },
    cx: { type: 'number', description: 'Centro X, fração da largura (0 a 1; pode passar das bordas para cortar).' },
    cy: { type: 'number', description: 'Centro Y, fração da altura.' },
    largura: { type: 'number', description: 'Largura do enfeite em fração da largura da arte (altura pela proporção).' },
    rotacao: { type: 'number', description: 'Graus, sentido horário.' },
    opacidade: { type: 'number' },
    parado: { type: 'boolean', description: 'true: não anima.' },
  },
  required: ['caminho', 'cx', 'cy', 'largura'],
};

/** Edge ou Chrome desta máquina (MERCADOFLOW_NAVEGADOR força um caminho). */
const findBrowser = () => {
  if (process.env.MERCADOFLOW_NAVEGADOR) return process.env.MERCADOFLOW_NAVEGADOR;
  const local = process.env.LOCALAPPDATA || '';
  const candidates = process.platform === 'win32' ? [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ] : process.platform === 'darwin' ? [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ] : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge'];
  return candidates.find((c) => c && fs.existsSync(c)) || null;
};

/** Abre a página de prévia num navegador sem janela e salva o print. */
const screenshot = (url, out, width, height) => new Promise((resolve, reject) => {
  const browser = findBrowser();
  if (!browser) {
    reject(new Error('Não achei Edge nem Chrome nesta máquina. Instale um deles ou informe o caminho em MERCADOFLOW_NAVEGADOR. Enquanto isso, use baixar_previa.'));
    return;
  }
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-previa-'));
  try { fs.rmSync(out, { force: true }); } catch { /* sem arquivo antigo */ }
  const child = spawn(browser, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
    `--user-data-dir=${profile}`, `--window-size=${width},${height}`, '--virtual-time-budget=25000',
    `--screenshot=${out}`, url,
  ], { stdio: 'ignore' });
  const timer = setTimeout(() => child.kill(), 60000);
  child.on('error', (e) => { clearTimeout(timer); reject(new Error(`Não consegui abrir o navegador (${browser}): ${e.message}`)); });
  child.on('exit', () => {
    clearTimeout(timer);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* o navegador às vezes segura a pasta */ }
    if (fs.existsSync(out) && fs.statSync(out).size > 0) resolve(out);
    else reject(new Error('O navegador não gerou o print. Tente de novo; se repetir, use baixar_previa.'));
  });
});

const TOOLS = {
  guia_de_criacao: {
    description: 'Leia primeiro: regras, tamanhos, fluxo e como posicionar camadas, áreas, cores e animações dos temas de encarte.',
    inputSchema: { type: 'object', properties: {} },
    run: async () => GUIDE,
  },
  listar_temas: {
    description: 'Lista os temas de encarte (rascunhos e publicados).',
    inputSchema: { type: 'object', properties: {} },
    run: async () => (await call('GET', '/themes')).map(summary),
  },
  ver_tema: {
    description: 'Detalhes de um tema: por formato, as áreas, cada enfeite com centro, largura, giro, tamanho em px e a caixa que ocupa, e os problemas encontrados.',
    inputSchema: { type: 'object', properties: { tema_id: { type: 'string' } }, required: ['tema_id'] },
    run: async (a) => {
      const t = await call('GET', `/themes/${a.tema_id}`);
      return { ...summary(t), formatos: t.formats.map(describeFormat) };
    },
  },
  revisar_formato: {
    description: 'Revisa a montagem de um formato: enfeite invadindo produtos, logo, selo ou rodapé, passando da borda ou da margem de 4%, muito pequeno, ampliado demais (borrado), áreas sobrepostas ou faltando. Use depois de cada ajuste, junto com baixar_previa.',
    inputSchema: { type: 'object', properties: { tema_id: { type: 'string' }, formato: { type: 'string', enum: Object.keys(FORMATS) } }, required: ['tema_id', 'formato'] },
    run: async (a) => {
      const { f } = await formatOf(a.tema_id, a.formato);
      const d = describeFormat(f);
      return { ...d, ok: d.problemas.length === 0 };
    },
  },
  ajustar_elemento: {
    description: 'Ajusta um enfeite já montado sem reenviar arquivos: posição (cx, cy), largura, giro, opacidade, parado, escondido e a ordem na pilha. Mande só o que muda.',
    inputSchema: {
      type: 'object',
      properties: {
        tema_id: { type: 'string' }, formato: { type: 'string', enum: Object.keys(FORMATS) },
        elemento: { type: 'string', description: 'id do enfeite (veja ver_tema ou o rótulo na prévia com guias).' },
        cx: { type: 'number' }, cy: { type: 'number' }, largura: { type: 'number' }, rotacao: { type: 'number' }, opacidade: { type: 'number' },
        parado: { type: 'boolean' }, escondido: { type: 'boolean' },
        ordem: { description: '"frente", "tras" ou a posição (0 = mais ao fundo entre os enfeites).', anyOf: [{ type: 'string', enum: ['frente', 'tras'] }, { type: 'number' }] },
      },
      required: ['tema_id', 'formato', 'elemento'],
    },
    run: async (a) => {
      const { f } = await formatOf(a.tema_id, a.formato);
      const layers = [...(f.layers || [])];
      const i = layers.findIndex((l) => l.id === a.elemento);
      if (i < 0) throw new Error(`Enfeite "${a.elemento}" não existe em ${a.formato}. Ids: ${layers.filter((l) => l.role !== 'base').map((l) => l.id).join(', ') || 'nenhum'}.`);
      if (layers[i].role === 'base') throw new Error('A base cobre a arte inteira e não se posiciona. Para trocar, use montar_formato.');
      const l = { ...layers[i] };
      if (a.cx !== undefined) l.cx = a.cx;
      if (a.cy !== undefined) l.cy = a.cy;
      if (a.largura !== undefined) l.width = a.largura;
      if (a.rotacao !== undefined) l.rotation = a.rotacao;
      if (a.opacidade !== undefined) l.opacity = a.opacidade;
      if (a.parado !== undefined) l.still = a.parado;
      if (a.escondido !== undefined) l.hidden = a.escondido;
      layers.splice(i, 1);
      const floor = layers[0]?.role === 'base' ? 1 : 0;
      const at = a.ordem === 'frente' ? layers.length : a.ordem === 'tras' ? floor
        : typeof a.ordem === 'number' ? Math.max(floor, Math.min(layers.length, floor + a.ordem)) : i;
      layers.splice(at, 0, l);
      const t = await call('PUT', `/themes/${a.tema_id}/formats/${a.formato}/layers`, { layers });
      return revisarDepois(t, a.formato);
    },
  },
  remover_elemento: {
    description: 'Tira um enfeite de um formato.',
    inputSchema: { type: 'object', properties: { tema_id: { type: 'string' }, formato: { type: 'string', enum: Object.keys(FORMATS) }, elemento: { type: 'string' } }, required: ['tema_id', 'formato', 'elemento'] },
    run: async (a) => {
      const { f } = await formatOf(a.tema_id, a.formato);
      const layers = (f.layers || []).filter((l) => !(l.id === a.elemento && l.role !== 'base'));
      if (layers.length === (f.layers || []).length) throw new Error(`Enfeite "${a.elemento}" não existe em ${a.formato}.`);
      const t = await call('PUT', `/themes/${a.tema_id}/formats/${a.formato}/layers`, { layers });
      return revisarDepois(t, a.formato);
    },
  },
  criar_tema: {
    description: 'Cria um tema em rascunho.',
    inputSchema: { type: 'object', properties: { nome: { type: 'string' }, ocasiao: { type: 'string', description: 'Ex.: Aniversário da loja, Black Friday, Natal, Ofertas da semana.' } }, required: ['nome'] },
    run: async (a) => summary(await call('POST', '/themes', { name: a.nome, occasion: a.ocasiao })),
  },
  atualizar_tema: {
    description: 'Muda nome, ocasião, palavras-chave, cores da etiqueta e animações do tema.',
    inputSchema: {
      type: 'object',
      properties: {
        tema_id: { type: 'string' }, nome: { type: 'string' }, ocasiao: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        cores: { type: 'object', properties: { etiqueta: { type: 'string' }, numero: { type: 'string' }, cartao: { type: 'string' }, nome: { type: 'string' }, faixa: { type: 'string' } } },
        animacoes: { type: 'object', properties: { lista: { type: 'array', items: { type: 'string', enum: PRESETS } }, padrao: { type: 'string', enum: PRESETS }, duracao: { type: 'number', description: '4 a 15 segundos.' } } },
        estilo: {
          type: 'object',
          description: 'Fontes, etiqueta de preço, cartão (layout, formato, vidro, fundo da foto), grade, selo de desconto, nome e rodapé. Veja ESTILO e VISUAIS PRONTOS no guia_de_criacao. Mescla com o estilo atual (null num campo volta ao padrão).',
          properties: {
            fonts: { type: 'object', properties: { price: { type: 'string', enum: FONT_KEYS }, name: { type: 'string', enum: FONT_KEYS }, text: { type: 'string', enum: FONT_KEYS } } },
            tag: { type: 'object' }, card: { type: 'object' }, name: { type: 'object' }, oldPrice: { type: 'object' }, footer: { type: 'object' },
            grid: { type: 'object' }, badge: { type: 'object' },
          },
        },
      },
      required: ['tema_id'],
    },
    run: async (a) => {
      const body = {};
      if (a.nome) body.name = a.nome;
      if (a.ocasiao) body.occasion = a.ocasiao;
      if (a.tags) body.tags = a.tags;
      if (a.cores) {
        body.palette = {};
        for (const [pt, key] of Object.entries(COLOR_KEYS)) if (a.cores[pt]) body.palette[key] = a.cores[pt];
      }
      if (a.animacoes) body.animation = { presets: a.animacoes.lista ?? [], defaultPreset: a.animacoes.padrao, duration: a.animacoes.duracao ?? 8 };
      if (a.estilo) {
        // Mescla por grupo com o estilo atual: a IA pode mandar só a etiqueta, por exemplo.
        const current = (await call('GET', `/themes/${a.tema_id}`)).style || {};
        body.style = { ...current };
        // null em border/color/band/maxLines é um valor ("sem"/"automático"); nos outros campos, volta ao padrão.
        const NULLABLE = ['border', 'color', 'band', 'maxLines', 'stroke'];
        for (const [group, fields] of Object.entries(a.estilo)) {
          if (!fields || typeof fields !== 'object') continue;
          const merged = { ...(current[group] || {}), ...fields };
          for (const [k, v] of Object.entries(merged)) if (v === null && !NULLABLE.includes(k)) delete merged[k];
          body.style[group] = merged;
        }
      }
      return summary(await call('PATCH', `/themes/${a.tema_id}`, body));
    },
  },
  enviar_selo: {
    description: 'Envia o selo 3D do tema (PNG transparente).',
    inputSchema: { type: 'object', properties: { tema_id: { type: 'string' }, caminho: { type: 'string' } }, required: ['tema_id', 'caminho'] },
    run: async (a) => {
      const abs = path.resolve(a.caminho);
      if (!fs.existsSync(abs)) throw new Error(`Arquivo não encontrado: ${abs}`);
      const form = new FormData();
      form.append('file', new Blob([fs.readFileSync(abs)]), path.basename(abs));
      return summary(await call('POST', `/themes/${a.tema_id}/seal`, form));
    },
  },
  montar_formato: {
    description: 'Monta o fundo em camadas de um formato: base + enfeites posicionados (de trás para frente) e, opcionalmente, as áreas. O servidor gera a prévia achatada.',
    inputSchema: {
      type: 'object',
      properties: {
        tema_id: { type: 'string' }, formato: { type: 'string', enum: Object.keys(FORMATS) },
        base: { type: 'string', description: 'PNG opaco da base no tamanho exato do formato.' },
        elementos: { type: 'array', items: element }, areas,
      },
      required: ['tema_id', 'formato', 'base'],
    },
    run: async (a) => {
      const formato = requireFormat(a.formato);
      const layers = await buildLayers(a.tema_id, a.base, a.elementos);
      let t = await call('PUT', `/themes/${a.tema_id}/formats/${formato}/layers`, { layers });
      if (a.areas) t = await call('PUT', `/themes/${a.tema_id}/formats/${formato}/regions`, { regions: toRegions(a.areas) });
      const f = t.formats.find((x) => x.format === formato);
      return { ok: true, formato, camadas: layers.length, areas: Object.keys(f?.regions || {}), previa: f ? BASE + f.backgroundUrl : null,
        aviso: f?.regions?.products ? undefined : 'Falta a área de produtos: use definir_areas.' };
    },
  },
  importar_composicao: {
    description: 'Importa a pasta "finais" da skill encartes-fieis (composicao.json + fundos, elementos e selo) nos cinco formatos de uma vez.',
    inputSchema: { type: 'object', properties: { tema_id: { type: 'string' }, pasta: { type: 'string' }, areas: { type: 'object', description: 'Opcional: áreas por formato, ex.: {"post": {...}, "story": {...}}.' } }, required: ['tema_id', 'pasta'] },
    run: async (a) => {
      const dir = path.resolve(a.pasta);
      const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'composicao.json'), 'utf8'));
      if (manifest.kind !== 'mercadoflow-layered-theme') throw new Error('composicao.json não é de um tema em camadas do MercadoFlow.');
      const done = [];
      if (manifest.seal && fs.existsSync(path.join(dir, manifest.seal))) await TOOLS.enviar_selo.run({ tema_id: a.tema_id, caminho: path.join(dir, manifest.seal) });
      for (const [formato, f] of Object.entries(manifest.formats || {})) {
        if (!FORMATS[formato]) continue;
        const elementos = [...f.layers].sort((x, y) => (x.z_index ?? 0) - (y.z_index ?? 0)).map((l) => ({
          caminho: path.join(dir, l.file), id: l.id, cx: l.cx, cy: l.cy, largura: l.width, rotacao: l.rotation, opacidade: l.opacity,
        }));
        done.push(await TOOLS.montar_formato.run({ tema_id: a.tema_id, formato, base: path.join(dir, f.base), elementos, areas: a.areas?.[formato] }));
      }
      return { ok: true, formatos: done };
    },
  },
  definir_areas: {
    description: 'Muda as áreas reservadas de um formato (logo, produtos, rodapé, selo): posição e tamanho em frações de 0 a 1. Mande só as que mudam; as outras ficam. null tira a área (produtos é obrigatória).',
    inputSchema: {
      type: 'object',
      properties: {
        tema_id: { type: 'string' }, formato: { type: 'string', enum: Object.keys(FORMATS) },
        areas: { type: 'object', description: 'Ex.: {"selo": {"x":0.6,"y":0.04,"w":0.34,"h":0.16}, "rodape": null}', properties: { logo: rect, produtos: rect, rodape: rect, selo: rect } },
      },
      required: ['tema_id', 'formato', 'areas'],
    },
    run: async (a) => {
      const { f } = await formatOf(a.tema_id, a.formato);
      const regions = { ...(f.regions || {}) };
      for (const [pt, key] of Object.entries(AREA_KEYS)) {
        if (!(pt in a.areas)) continue;
        if (a.areas[pt] === null) delete regions[key];
        else regions[key] = a.areas[pt];
      }
      const t = await call('PUT', `/themes/${a.tema_id}/formats/${a.formato}/regions`, { regions });
      return revisarDepois(t, a.formato);
    },
  },
  ver_encarte: {
    description: 'Print do encarte COMPLETO como o cliente vê: fundo, enfeites, selo 3D, logo, cartões de produto com foto, nome, preço, selo de desconto e rodapé, com o estilo do tema. Abre o Edge/Chrome desta máquina sem janela. OLHE a imagem e corrija o estilo (atualizar_tema) e as áreas até ficar profissional.',
    inputSchema: {
      type: 'object',
      properties: {
        tema_id: { type: 'string' }, formato: { type: 'string', enum: Object.keys(FORMATS) },
        produtos: { type: 'number', description: '1 a 16 produtos de exemplo (padrão 6). Teste poucos e muitos.' },
        destaque: { type: 'boolean', description: 'Primeiro produto em destaque (padrão true).' },
        fotos: { type: 'boolean', description: 'Produtos com foto (padrão true).' },
        salvar_em: { type: 'string', description: 'Caminho do PNG (padrão: ./encarte-<formato>.png).' },
      },
      required: ['tema_id', 'formato'],
    },
    run: async (a) => {
      requireFormat(a.formato);
      if (!KEY) throw new Error('Falta a variável MERCADOFLOW_TEMAS_KEY.');
      // A chave vai no "#": fica só no navegador local, não chega ao servidor.
      const q = new URLSearchParams({
        chave: KEY, formato: a.formato, produtos: String(Math.max(1, Math.min(16, Math.round(a.produtos ?? 6)))),
        destaque: a.destaque === false ? '0' : '1', fotos: a.fotos === false ? '0' : '1',
      });
      const f = FORMATS[a.formato];
      // Janela no máximo 1350 px no lado maior; a arte é desenhada inteira e reduzida.
      const k = Math.max(f.width, f.height) / 1350;
      const out = path.resolve(a.salvar_em || `encarte-${a.formato}.png`);
      await screenshot(`${BASE}/temas/previa/${a.tema_id}#${q}`, out, Math.round(f.width / k), Math.round(f.height / k));
      return { ok: true, arquivo: out, dica: 'Abra a imagem. Confira: cartões legíveis, preço em destaque, nada cobrindo produto, cores combinando com o fundo, visual diferente do padrão.' };
    },
  },
  baixar_previa: {
    description: 'Baixa a prévia de um formato para um arquivo local e OLHE a imagem: enfeites, selo 3D na área dele e, com guias (padrão), as áreas coloridas (produtos verde, logo azul, selo laranja, rodapé roxo), a margem de 4% e o contorno + id de cada enfeite. Sem guias, mostra como o fundo fica de verdade.',
    inputSchema: {
      type: 'object',
      properties: {
        tema_id: { type: 'string' }, formato: { type: 'string', enum: Object.keys(FORMATS) },
        com_guias: { type: 'boolean', description: 'Padrão true.' },
        salvar_em: { type: 'string', description: 'Caminho do arquivo (padrão: ./previa-<formato>.jpg).' },
      },
      required: ['tema_id', 'formato'],
    },
    run: async (a) => {
      requireFormat(a.formato);
      if (!KEY) throw new Error('Falta a variável MERCADOFLOW_TEMAS_KEY.');
      const res = await fetch(`${API}/themes/${a.tema_id}/formats/${a.formato}/preview?guides=${a.com_guias !== false}`, { headers: { Authorization: `Bearer ${KEY}` } });
      if (!res.ok) {
        let msg = `Erro ${res.status} ao gerar a prévia`;
        try { msg = (await res.json()).message || msg; } catch { /* sem corpo */ }
        throw new Error(msg);
      }
      const out = path.resolve(a.salvar_em || `previa-${a.formato}${a.com_guias === false ? '' : '-guias'}.jpg`);
      fs.writeFileSync(out, Buffer.from(await res.arrayBuffer()));
      const { f } = await formatOf(a.tema_id, a.formato);
      return { ok: true, arquivo: out, problemas: review(f), dica: 'Abra a imagem e compare com os problemas listados; ajuste com ajustar_elemento e definir_areas.' };
    },
  },
};

// ── Protocolo (JSON-RPC 2.0, uma mensagem por linha) ─────────────────────

const send = (msg) => process.stdout.write(`${JSON.stringify(msg)}\n`);
const handle = async (msg) => {
  const { id, method, params } = msg;
  if (id === undefined || id === null) return; // notificação
  try {
    if (method === 'initialize') {
      return send({ jsonrpc: '2.0', id, result: {
        protocolVersion: params?.protocolVersion || '2025-06-18',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'mercadoflow-temas', title: 'MercadoFlow · Temas de encarte', version: '1.0.0' },
        instructions: 'Cria e monta temas de encarte do MercadoFlow. Comece por guia_de_criacao.',
      } });
    }
    if (method === 'ping') return send({ jsonrpc: '2.0', id, result: {} });
    if (method === 'tools/list') {
      return send({ jsonrpc: '2.0', id, result: { tools: Object.entries(TOOLS).map(([name, t]) => ({ name, description: t.description, inputSchema: t.inputSchema })) } });
    }
    if (method === 'tools/call') {
      const tool = TOOLS[params?.name];
      if (!tool) return send({ jsonrpc: '2.0', id, error: { code: -32602, message: `Ferramenta desconhecida: ${params?.name}` } });
      try {
        const data = await tool.run(params.arguments || {});
        return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }] } });
      } catch (e) {
        return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: e.message || String(e) }], isError: true } });
      }
    }
    send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Método não suportado: ${method}` } });
  } catch (e) {
    send({ jsonrpc: '2.0', id, error: { code: -32603, message: e.message || 'Erro interno' } });
  }
};

readline.createInterface({ input: process.stdin }).on('line', (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON inválido' } }); }
  handle(msg);
});
