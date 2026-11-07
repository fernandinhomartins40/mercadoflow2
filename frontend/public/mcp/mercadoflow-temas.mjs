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
import path from 'node:path';
import readline from 'node:readline';

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
5. baixar_previa e OLHE a imagem: enfeites não podem invadir a área de produtos nem cobrir logo, selo e rodapé.
   Ajuste e monte de novo se precisar.
6. atualizar_tema com as cores da etiqueta (combinando com a identidade) e as animações.
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
cartao (fundo do cartão, quase branco), nome (nome do produto, escuro), faixa (destaque "leve 3 pague 2").`;

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
  selo: !!t.sealUrl, cores: t.palette, animacao: t.animation,
  formatos: (t.formats || []).map((f) => ({
    formato: f.format, camadas: (f.layers || []).length, areas: Object.keys(f.regions || {}),
    pronto: !!f.regions?.products, previa: f.backgroundUrl ? BASE + f.backgroundUrl : null,
  })),
  pagina: `${BASE}/super-admin/temas/${t.id}`,
});

const requireFormat = (f) => { if (!FORMATS[f]) throw new Error(`Formato inválido: ${f}. Use ${Object.keys(FORMATS).join(', ')}.`); return f; };

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
    description: 'Detalhes de um tema: formatos, camadas, áreas, cores, animações e links das prévias.',
    inputSchema: { type: 'object', properties: { tema_id: { type: 'string' } }, required: ['tema_id'] },
    run: async (a) => {
      const t = await call('GET', `/themes/${a.tema_id}`);
      return { ...summary(t), detalhe: t.formats };
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
    description: 'Marca as áreas reservadas de um formato (logo, produtos, rodapé, selo). A área de produtos é obrigatória para o tema poder ser publicado.',
    inputSchema: { type: 'object', properties: { tema_id: { type: 'string' }, formato: { type: 'string', enum: Object.keys(FORMATS) }, areas }, required: ['tema_id', 'formato', 'areas'] },
    run: async (a) => {
      const t = await call('PUT', `/themes/${a.tema_id}/formats/${requireFormat(a.formato)}/regions`, { regions: toRegions(a.areas) });
      return summary(t);
    },
  },
  baixar_previa: {
    description: 'Baixa a prévia achatada de um formato para um arquivo local, para você olhar e conferir a composição.',
    inputSchema: { type: 'object', properties: { tema_id: { type: 'string' }, formato: { type: 'string', enum: Object.keys(FORMATS) }, salvar_em: { type: 'string', description: 'Caminho do arquivo (padrão: ./previa-<formato>.jpg).' } }, required: ['tema_id', 'formato'] },
    run: async (a) => {
      const t = await call('GET', `/themes/${a.tema_id}`);
      const f = t.formats.find((x) => x.format === requireFormat(a.formato));
      if (!f) throw new Error(`O formato ${a.formato} ainda não foi montado.`);
      const res = await fetch(BASE + f.backgroundUrl);
      if (!res.ok) throw new Error('Não foi possível baixar a prévia.');
      const out = path.resolve(a.salvar_em || `previa-${a.formato}.${f.backgroundUrl.split('.').pop()}`);
      fs.writeFileSync(out, Buffer.from(await res.arrayBuffer()));
      return { ok: true, arquivo: out, areas: f.regions, dica: 'Abra a imagem e confira se os enfeites não invadem as áreas.' };
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
