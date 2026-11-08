import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Bot, CheckCircle2, Copy, Download, Eye, EyeOff, FolderOpen, ImagePlus, KeyRound, Layers, Loader2, Plus, RefreshCw, Save, Sparkles, Trash2, Upload, Wand2,
} from 'lucide-react';
import SuperAdminLayout from '../components/layout/SuperAdminLayout';
import Button from '../components/common/Button';
import { artAdminService, apiMessage } from '../services/art.service';
import type {
  ArtApiKey, ArtTheme, FormatKey, MotionPreset, ThemeStyle, Palette, PlatformAiSettings, RegionKey, Regions, ThemeAnimation, ThemeLayer, ThemeSuggestion,
} from '../types/art.types';
import LayerEditor, { normalizeLayers } from '../features/art-studio/LayerEditor';
import StyleEditor from '../features/art-studio/StyleEditor';
import { Uploaded, findManifest, layersFromFiles, layersFromManifest, measure } from '../features/art-studio/layerImport';
import { DEFAULT_DURATION, MOTION_KEYS, MOTION_PRESETS } from '../features/art-studio/motion';
import { compositeBlob } from '../features/art-studio/export';
import { DEFAULT_PALETTE, FORMATS, FORMAT_KEYS, REGION_META, sampleItems, themeFormat } from '../features/art-studio/formats';
import { Candidate, analyzeBackground, annotatedImage, regionsFromAssignment } from '../features/art-studio/analyze';
import { loadImage } from '../features/art-studio/assets';
import { compositionPalette, derivePalette } from '../features/art-studio/palette';
import { loadLayers, useScene } from '../features/art-studio/scene';
import { drawLayers } from '../features/art-studio/render';
import ArtCanvas from '../features/art-studio/ArtCanvas';
import RegionEditor from '../features/art-studio/RegionEditor';
import { confirmDialog } from '../components/common/Dialogs';

/**
 * Criador de temas de encarte (superadmin).
 *
 * O superadmin sobe o fundo PNG de cada formato e o selo 3D; o sistema mede o
 * fundo, a IA (DeepSeek, chave da plataforma) escolhe onde vai logo, produtos,
 * rodapé e selo, e sugere nome, ocasião e cores. Tudo é ajustável à mão, com a
 * prévia ao lado mostrando o tema já com produtos.
 */

const CARD = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm';
const INPUT = 'h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-600/20';
const LABEL = 'text-sm font-medium text-slate-700';

const PALETTE_FIELDS: Array<{ key: keyof Palette; label: string }> = [
  { key: 'tag', label: 'Etiqueta de preço' },
  { key: 'tagText', label: 'Número do preço' },
  { key: 'card', label: 'Cartão do produto' },
  { key: 'cardText', label: 'Nome do produto' },
  { key: 'accent', label: 'Faixa de condição' },
];

const DEFAULT_NAMES = ['Tema sem nome', 'Novo tema'];

// ── Chave do DeepSeek ────────────────────────────────────────────────────

const AiKeyCard: React.FC<{ settings: PlatformAiSettings | null; onChange: (s: PlatformAiSettings) => void }> = ({ settings, onChange }) => {
  const [open, setOpen] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState<'save' | 'test' | 'remove' | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => { if (settings) setModel(settings.model); }, [settings]);
  useEffect(() => { if (settings && !settings.configured) setOpen(true); }, [settings]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy('save');
    setMessage(null);
    try {
      const next = await artAdminService.saveAiSettings({ apiKey: apiKey.trim() || undefined, model: model.trim() });
      onChange(next);
      setApiKey('');
      setMessage({ ok: true, text: 'Configuração salva.' });
    } catch (err) {
      setMessage({ ok: false, text: apiMessage(err, 'Não foi possível salvar a chave.') });
    } finally {
      setBusy(null);
    }
  };

  const test = async () => {
    setBusy('test');
    setMessage(null);
    try {
      const r = await artAdminService.testAi();
      setMessage({ ok: r.ok, text: r.ok ? `${r.message} (${(r.latencyMs / 1000).toFixed(1)} s)` : r.message });
    } catch (err) {
      setMessage({ ok: false, text: apiMessage(err, 'O teste falhou.') });
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!(await confirmDialog('Remover a chave do DeepSeek? O criador de temas volta a sugerir as áreas só pela análise da imagem.'))) return;
    setBusy('remove');
    try {
      onChange(await artAdminService.removeAiKey());
      setMessage({ ok: true, text: 'Chave removida.' });
    } catch (err) {
      setMessage({ ok: false, text: apiMessage(err, 'Não foi possível remover a chave.') });
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className={CARD} aria-labelledby="ai-key-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-700"><KeyRound className="h-5 w-5" aria-hidden="true" /></span>
          <div>
            <h2 id="ai-key-title" className="text-base font-semibold text-slate-900">IA do criador de temas (DeepSeek)</h2>
            <p className="text-sm text-slate-600">
              {settings?.configured
                ? <>Chave cadastrada, terminando em <strong className="font-mono">{settings.keyHint}</strong>. Modelo {settings.model}.</>
                : 'Sem chave: as áreas são sugeridas só pela análise da imagem.'}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {settings?.configured && <Button variant="secondary" size="sm" onClick={test} disabled={!!busy}>{busy === 'test' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Testar'}</Button>}
          <Button variant="secondary" size="sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}>{open ? 'Fechar' : settings?.configured ? 'Trocar chave' : 'Cadastrar chave'}</Button>
        </div>
      </div>
      {settings && !settings.encryptionReady && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          O servidor está sem a chave mestra de criptografia (AI_ENCRYPTION_KEY). Sem ela a chave de API não pode ser guardada.
        </p>
      )}
      {open && (
        <form onSubmit={save} className="mt-4 grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-[1fr_220px_auto] sm:items-end">
          <label className="flex flex-col gap-1.5">
            <span className={LABEL}>Chave de API</span>
            <div className="relative">
              <input className={`${INPUT} pr-10 font-mono`} type={show ? 'text' : 'password'} value={apiKey} onChange={(e) => setApiKey(e.target.value)}
                placeholder={settings?.configured ? 'Deixe em branco para manter a atual' : 'sk-...'} autoComplete="off" spellCheck={false} />
              <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 hover:text-slate-800"
                aria-label={show ? 'Esconder a chave' : 'Mostrar a chave'}>
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={LABEL}>Modelo</span>
            <input className={`${INPUT} font-mono`} value={model} onChange={(e) => setModel(e.target.value)} placeholder="deepseek-flash" />
          </label>
          <div className="flex gap-2">
            <Button type="submit" disabled={!!busy}>{busy === 'save' ? 'Salvando…' : 'Salvar'}</Button>
            {settings?.configured && <Button type="button" variant="ghost" onClick={remove} disabled={!!busy}>Remover</Button>}
          </div>
          <p className="text-xs text-slate-500 sm:col-span-3">
            Crie a chave em platform.deepseek.com. Ela é guardada cifrada, não volta para a tela e só é usada aqui, no superadmin.
            O modelo precisa enxergar imagens (deepseek-flash).
          </p>
        </form>
      )}
      {message && (
        <p role="status" className={`mt-3 text-sm ${message.ok ? 'text-green-700' : 'text-red-700'}`}>{message.text}</p>
      )}
    </section>
  );
};

// ── MCP do Codex ─────────────────────────────────────────────────────────

const MCP_FILE = 'C:\\MercadoFlow\\mercadoflow-temas.mjs';

const codexConfig = (secret: string) => `[mcp_servers.mercadoflow-temas]
command = "node"
args = ["${MCP_FILE.replace(/\\/g, '\\\\')}"]
env = { MERCADOFLOW_URL = "${window.location.origin}", MERCADOFLOW_TEMAS_KEY = "${secret}" }`;

const CodexMcpCard: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [keys, setKeys] = useState<ArtApiKey[] | null>(null);
  const [name, setName] = useState('Codex');
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open && keys === null) artAdminService.apiKeys().then(setKeys).catch(() => setKeys([])); }, [open, keys]);

  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(null), 2000); } catch { /* sem permissão */ }
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const r = await artAdminService.createApiKey(name.trim());
      setSecret(r.secret);
      setKeys(await artAdminService.apiKeys());
    } catch (err) {
      setMessage({ ok: false, text: apiMessage(err, 'Não foi possível criar a chave.') });
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (k: ArtApiKey) => {
    if (!(await confirmDialog(`Revogar a chave "${k.name}"? O Codex que usa essa chave para de funcionar na hora.`))) return;
    setKeys(await artAdminService.revokeApiKey(k.id));
  };

  const active = keys?.filter((k) => !k.revokedAt) ?? [];

  return (
    <section className={CARD} aria-labelledby="mcp-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-700"><Bot className="h-5 w-5" aria-hidden="true" /></span>
          <div>
            <h2 id="mcp-title" className="text-base font-semibold text-slate-900">Criar temas com o Codex (MCP)</h2>
            <p className="text-sm text-slate-600">O Codex gera as imagens, cria o tema, posiciona as camadas, marca as áreas e escolhe cores e animações. Você confere e publica.</p>
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}>{open ? 'Fechar' : 'Configurar'}</Button>
      </div>
      {open && (
        <div className="mt-4 flex flex-col gap-4 border-t border-slate-100 pt-4 text-sm text-slate-700">
          <ol className="flex flex-col gap-4">
            <li className="flex flex-col gap-2">
              <span className="font-semibold text-slate-900">1. Baixe o MCP</span>
              <span>Salve o arquivo em <code className="rounded bg-slate-100 px-1">{MCP_FILE}</code> (precisa do Node 18 ou mais novo).</span>
              <a href="/mcp/mercadoflow-temas.mjs" download="mercadoflow-temas.mjs"
                className="inline-flex w-fit items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 font-medium text-slate-800 hover:bg-slate-50">
                <Download className="h-4 w-4" />Baixar mercadoflow-temas.mjs
              </a>
            </li>
            <li className="flex flex-col gap-2">
              <span className="font-semibold text-slate-900">2. Gere a chave</span>
              <form onSubmit={create} className="flex flex-wrap gap-2">
                <input className={`${INPUT} max-w-xs`} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} aria-label="Nome da chave" placeholder="Ex.: Codex do notebook" />
                <Button type="submit" disabled={busy || !name.trim()}>{busy ? 'Gerando…' : 'Gerar chave'}</Button>
              </form>
              {secret && (
                <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <span className="font-medium text-amber-900">Copie agora: esta chave não aparece de novo.</span>
                  <div className="flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded bg-white px-2 py-1 font-mono text-xs">{secret}</code>
                    <Button variant="secondary" size="sm" onClick={() => copy(secret, 'key')}><Copy className="mr-1 h-4 w-4" />{copied === 'key' ? 'Copiada' : 'Copiar'}</Button>
                  </div>
                </div>
              )}
            </li>
            <li className="flex flex-col gap-2">
              <span className="font-semibold text-slate-900">3. Cole no Codex</span>
              <span>No arquivo <code className="rounded bg-slate-100 px-1">%USERPROFILE%\.codex\config.toml</code>:</span>
              <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 font-mono text-xs leading-relaxed text-slate-100">{codexConfig(secret ?? 'mftema_COLE_A_CHAVE_AQUI')}</pre>
              <Button variant="secondary" size="sm" className="w-fit" onClick={() => copy(codexConfig(secret ?? 'mftema_COLE_A_CHAVE_AQUI'), 'cfg')}>
                <Copy className="mr-1 h-4 w-4" />{copied === 'cfg' ? 'Copiado' : 'Copiar configuração'}
              </Button>
              <span className="text-xs text-slate-500">
                Depois peça ao Codex, por exemplo: &quot;Crie um tema de encarte de Black Friday com o MCP mercadoflow-temas, nos cinco formatos.&quot;
                Ele começa pelo guia_de_criacao. O tema fica em rascunho até você publicar.
              </span>
            </li>
          </ol>
          {message && <p role="alert" className={message.ok ? 'text-green-700' : 'text-red-700'}>{message.text}</p>}
          {keys && keys.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Chaves ({active.length} ativas)</span>
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {keys.map((k) => (
                  <li key={k.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <span className={k.revokedAt ? 'text-slate-400 line-through' : ''}>
                      <strong className="font-medium">{k.name}</strong> <code className="text-xs text-slate-500">{k.keyPrefix}…</code>
                    </span>
                    <span className="flex items-center gap-3 text-xs text-slate-500">
                      {k.revokedAt ? 'Revogada' : k.lastUsedAt ? `${k.calls} chamadas · usada em ${new Date(k.lastUsedAt).toLocaleString('pt-BR')}` : 'Nunca usada'}
                      {!k.revokedAt && <button type="button" onClick={() => revoke(k)} className="font-medium text-red-700 hover:underline">Revogar</button>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
};

// ── Lista de temas ───────────────────────────────────────────────────────

const ThemeGallery: React.FC<{ aiReady: boolean }> = ({ aiReady }) => {
  const navigate = useNavigate();
  const [themes, setThemes] = useState<ArtTheme[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    artAdminService.themes().then(setThemes).catch((err) => setError(apiMessage(err, 'Não foi possível carregar os temas.')));
  }, []);

  const create = async () => {
    setCreating(true);
    try {
      const theme = await artAdminService.createTheme({ name: 'Novo tema' });
      navigate(`/super-admin/temas/${theme.id}`);
    } catch (err) {
      setError(apiMessage(err, 'Não foi possível criar o tema.'));
      setCreating(false);
    }
  };

  return (
    <section className="flex flex-col gap-4" aria-labelledby="themes-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="themes-title" className="text-lg font-semibold text-slate-900">Temas</h2>
          <p className="text-sm text-slate-600">
            Os publicados aparecem para todos os mercados no editor de encartes.
            {aiReady ? ' Ao subir um fundo, a IA marca as áreas sozinha.' : ''}
          </p>
        </div>
        <Button onClick={create} disabled={creating}><Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />Novo tema</Button>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {themes === null ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[0, 1, 2].map((i) => <div key={i} className="h-72 animate-pulse rounded-2xl bg-slate-100" />)}
        </div>
      ) : themes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <ImagePlus className="mx-auto h-10 w-10 text-slate-400" aria-hidden="true" />
          <h3 className="mt-3 text-base font-semibold text-slate-900">Nenhum tema ainda</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">
            Enquanto não houver tema publicado, os mercados usam o tema básico. Crie o primeiro com o fundo PNG de cada formato e o selo do tema.
          </p>
          <Button className="mt-5" onClick={create} disabled={creating}>Criar o primeiro tema</Button>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {themes.map((t) => {
            const cover = t.formats.find((f) => f.format === 'post') ?? t.formats[0];
            const ready = t.formats.filter((f) => f.regions?.products).length;
            return (
              <li key={t.id}>
                <Link to={`/super-admin/temas/${t.id}`}
                  className="group flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-slate-300 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700">
                  <div className="relative flex h-52 items-center justify-center overflow-hidden bg-slate-100">
                    {cover
                      ? <img src={cover.backgroundUrl} alt="" className="h-full w-full object-cover object-top transition group-hover:scale-[1.02]" />
                      : <ImagePlus className="h-8 w-8 text-slate-400" aria-hidden="true" />}
                    {t.sealUrl && <img src={t.sealUrl} alt="" className="absolute right-2 top-2 h-16 w-16 object-contain drop-shadow-lg" />}
                    <span className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-xs font-semibold ${t.status === 'PUBLISHED' ? 'bg-green-600 text-white' : 'bg-white/90 text-slate-700'}`}>
                      {t.status === 'PUBLISHED' ? 'Publicado' : 'Rascunho'}
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col gap-1 p-4">
                    <span className="font-semibold text-slate-900">{t.name}</span>
                    <span className="text-sm text-slate-600">{t.occasion || 'Sem ocasião'}</span>
                    <span className="mt-auto pt-2 text-xs text-slate-500">{ready} de {FORMAT_KEYS.length} formatos prontos</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};

// ── Editor de tema ───────────────────────────────────────────────────────

type Stage = 'idle' | 'uploading' | 'measuring' | 'ai' | 'saving' | 'layers' | 'composing';
const STAGE_TEXT: Record<Stage, string> = {
  idle: '', uploading: 'Enviando o fundo…', measuring: 'Medindo as áreas livres do fundo…', ai: 'A IA está escolhendo as áreas…', saving: 'Salvando…',
  layers: 'Enviando as camadas…', composing: 'Montando o fundo com as camadas…',
};
// Objeto fixo: um `{}` novo a cada render entra nas dependências da prévia e a remonta sem parar.
const NO_REGIONS: Regions = {};
// React não tipa o atributo de escolher pasta.
const FOLDER_INPUT = { webkitdirectory: '', directory: '' } as Record<string, string>;

const ThemeEditor: React.FC<{ id: string; aiReady: boolean; occasions: string[] }> = ({ id, aiReady, occasions }) => {
  const navigate = useNavigate();
  const [theme, setTheme] = useState<ArtTheme | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [format, setFormat] = useState<FormatKey>('post');
  const [live, setLive] = useState<Regions | null>(null);
  const [active, setActive] = useState<RegionKey | null>('products');
  const [stage, setStage] = useState<Stage>('idle');
  const [candidates, setCandidates] = useState<Partial<Record<FormatKey, Candidate[]>>>({});
  const [showCandidates, setShowCandidates] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [aiPalette, setAiPalette] = useState<Partial<Palette> | null>(null);
  const [palette, setPalette] = useState<Palette>(DEFAULT_PALETTE);
  const [name, setName] = useState('');
  const [count, setCount] = useState(8);
  const [hero, setHero] = useState(true);
  const [photos, setPhotos] = useState(true);
  const [saved, setSaved] = useState<string | null>(null);
  const [mode, setMode] = useState<'layers' | 'regions'>('layers');
  /** Camadas mexidas e ainda não salvas do formato aberto. */
  const [draft, setDraft] = useState<ThemeLayer[] | null>(null);
  const [selectedLayer, setSelectedLayer] = useState<string | null>(null);
  const [animation, setAnimation] = useState<ThemeAnimation>({});
  const [style, setStyle] = useState<ThemeStyle>({});
  const [previewMotion, setPreviewMotion] = useState<MotionPreset | null>(null);
  const bgInput = useRef<HTMLInputElement>(null);
  const sealInput = useRef<HTMLInputElement>(null);
  const layerInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  const accept = useCallback((t: ArtTheme) => {
    setTheme(t);
    setPalette({ ...DEFAULT_PALETTE, ...t.palette });
    setName(t.name);
    setAnimation(t.animation ?? {});
    setStyle(t.style ?? {});
  }, []);

  useEffect(() => {
    artAdminService.theme(id).then((t) => {
      accept(t);
      const first = FORMAT_KEYS.find((f) => themeFormat(t, f));
      if (first) setFormat(first);
      const firstFormat = first ? themeFormat(t, first) : null;
      // Tema antigo (fundo único, sem camadas): abre direto nas áreas.
      if (firstFormat && !firstFormat.layers?.length) setMode('regions');
      setPreviewMotion(t.animation?.defaultPreset ?? null);
    }).catch((err) => setError(apiMessage(err, 'Tema não encontrado.')));
  }, [id, accept]);

  const tf = themeFormat(theme, format);
  /** Áreas mexidas num formato que ainda não foi salvo: vão junto com as camadas. */
  const [pendingRegions, setPendingRegions] = useState<Regions | null>(null);
  const regions = live ?? pendingRegions ?? tf?.regions ?? NO_REGIONS;
  const layers = draft ?? tf?.layers ?? [];
  const duration = animation.duration ?? DEFAULT_DURATION;

  const flash = (text: string) => { setSaved(text); setTimeout(() => setSaved(null), 2500); };

  const patch = async (body: Partial<ArtTheme>, okText = 'Salvo') => {
    try {
      const t = await artAdminService.updateTheme(id, body);
      setTheme(t);
      flash(okText);
      return t;
    } catch (err) {
      setError(apiMessage(err, 'Não foi possível salvar.'));
      return null;
    }
  };

  /** Mede o fundo, sugere as áreas e, com IA, refina e sugere nome e cores. */
  const analyze = async (current: ArtTheme, key: FormatKey) => {
    const format = themeFormat(current, key);
    if (!format) return;
    setError(null);
    setAiNote(null);
    setStage('measuring');
    const img = await loadImage(format.backgroundUrl);
    if (!img) { setStage('idle'); setError('Não foi possível abrir o fundo para analisar.'); return; }
    const analysis = analyzeBackground(img);
    setCandidates((c) => ({ ...c, [key]: analysis.candidates }));
    let next = await artAdminService.saveRegions(id, key, analysis.regions, { source: 'pixels', candidates: analysis.candidates });
    // Tema ainda com as cores padrão: já sai com as cores tiradas do fundo.
    if (PALETTE_FIELDS.every(({ key: k }) => (next.palette?.[k] ?? DEFAULT_PALETTE[k]) === DEFAULT_PALETTE[k])) {
      next = await artAdminService.updateTheme(id, { palette: derivePalette(img, analysis.regions.products) });
    }
    accept(next);
    if (!aiReady || analysis.candidates.length === 0) { setStage('idle'); return; }

    setStage('ai');
    let suggestion: ThemeSuggestion;
    try {
      suggestion = await artAdminService.suggest(id, { format: key, image: annotatedImage(img, analysis.candidates), candidates: analysis.candidates });
    } catch (err) {
      setStage('idle');
      setAiNote(`${apiMessage(err, 'A IA não respondeu.')} As áreas ficaram com a sugestão da análise da imagem.`);
      return;
    }
    const aiRegions = regionsFromAssignment(analysis.candidates, suggestion.assignment, analysis.regions);
    next = await artAdminService.saveRegions(id, key, aiRegions, { source: 'ai', candidates: analysis.candidates, assignment: suggestion.assignment, notes: suggestion.notes });
    // Nome, ocasião e palavras-chave: só preenche o que ainda está vazio.
    const body: Partial<ArtTheme> = {};
    if (suggestion.name && DEFAULT_NAMES.includes(next.name)) body.name = suggestion.name;
    if (suggestion.occasion && !next.occasion) body.occasion = suggestion.occasion;
    if (suggestion.tags.length && next.tags.length === 0) body.tags = suggestion.tags;
    const paletteIsDefault = PALETTE_FIELDS.every(({ key: k }) => (next.palette?.[k] ?? DEFAULT_PALETTE[k]) === DEFAULT_PALETTE[k]);
    const hasPalette = Object.keys(suggestion.palette).length > 0;
    if (hasPalette && paletteIsDefault) body.palette = { ...DEFAULT_PALETTE, ...suggestion.palette };
    if (Object.keys(body).length) next = (await artAdminService.updateTheme(id, body)) ?? next;
    accept(next);
    setAiPalette(hasPalette && !paletteIsDefault ? suggestion.palette : null);
    setAiNote(suggestion.notes ? `IA: ${suggestion.notes}` : 'A IA marcou as áreas. Ajuste arrastando se precisar.');
    setStage('idle');
  };

  const onBackground = async (file: File | undefined) => {
    if (!file) return;
    setStage('uploading');
    setError(null);
    try {
      const t = await artAdminService.uploadBackground(id, format, file);
      setTheme(t);
      // Fundo numa imagem só substitui as camadas deste formato.
      setDraft(null);
      setMode('regions');
      await analyze(t, format);
    } catch (err) {
      setStage('idle');
      setError(apiMessage(err, 'Não foi possível enviar o fundo.'));
    }
  };

  const onSeal = async (file: File | undefined) => {
    if (!file) return;
    try {
      const t = await artAdminService.uploadSeal(id, file);
      setTheme(t);
      flash('Selo enviado');
    } catch (err) {
      setError(apiMessage(err, 'Não foi possível enviar o selo.'));
    }
  };

  const uploadLayerFile = async (file: File): Promise<Uploaded> => {
    const r = await artAdminService.uploadAsset(id, file, file.name);
    const size = r.width > 0 ? { w: r.width, h: r.height } : await measure(file);
    return { url: r.url, ...size };
  };

  /** Grava as camadas de um formato com a imagem achatada; formato novo já ganha as áreas. */
  const persistLayers = async (key: FormatKey, list: ThemeLayer[]) => {
    setStage('composing');
    let t = await artAdminService.saveLayers(id, key, list, await compositeBlob(list, key));
    if (pendingRegions && key === format) {
      // Áreas que o superadmin já posicionou na montagem valem mais que a sugestão automática.
      t = await artAdminService.saveRegions(id, key, pendingRegions);
      setPendingRegions(null);
    }
    // Só o tema: nome, cores e animação na tela podem estar sendo editados agora.
    setTheme(t);
    if (!themeFormat(t, key)?.regions?.products) await analyze(t, key);
    return t;
  };

  /** PNGs soltos (formato aberto) ou a pasta do Codex com composicao.json (todos os formatos). */
  const onLayerFiles = async (list: FileList | null | undefined) => {
    const files = Array.from(list ?? []);
    if (!files.length) return;
    setError(null);
    setStage('layers');
    try {
      const manifest = await findManifest(files);
      if (manifest) {
        if (draft && !(await confirmDialog('Há camadas não salvas neste formato. Importar a pasta e descartar essas mudanças?'))) { setStage('idle'); return; }
        const { layers: byFormat, sealFile } = await layersFromManifest(manifest, files, uploadLayerFile);
        if (sealFile) setTheme(await artAdminService.uploadSeal(id, sealFile));
        setDraft(null);
        for (const key of FORMAT_KEYS) {
          const list = byFormat[key];
          if (list) await persistLayers(key, list);
        }
        setMode('layers');
        flash(`Pasta importada: ${Object.keys(byFormat).length} formatos`);
      } else {
        setDraft(normalizeLayers(await layersFromFiles(files, format, layers, uploadLayerFile)));
        setMode('layers');
      }
    } catch (err) {
      setError(err instanceof Error && !(err as { response?: unknown }).response ? err.message : apiMessage(err, 'Não foi possível enviar as camadas.'));
    } finally {
      setStage('idle');
    }
  };

  // ── Salvamento ─────────────────────────────────────────────────────────
  // As camadas mexidas ficam num rascunho na tela e são gravadas sozinhas
  // pouco depois de parar de mexer. Antes só o botão "Salvar camadas"
  // gravava, e recarregar a página perdia a montagem inteira.

  const draftRef = useRef(draft);
  draftRef.current = draft;
  const inflight = useRef<Promise<boolean> | null>(null);
  /** Rascunho cujo salvamento falhou: o automático para de insistir até a próxima mexida. */
  const failedDraft = useRef<ThemeLayer[] | null>(null);
  const [savingLayers, setSavingLayers] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  const saveDraft = async (): Promise<boolean> => {
    if (inflight.current) await inflight.current;
    const snapshot = draftRef.current;
    if (!snapshot?.length) return true;
    const run = (async () => {
      setSavingLayers(true);
      try {
        await persistLayers(format, snapshot);
        // Mexeu durante o envio: o rascunho novo fica e o automático grava em seguida.
        setDraft((d) => (d === snapshot ? null : d));
        failedDraft.current = null;
        setLastSaved(new Date());
        return true;
      } catch (err) {
        failedDraft.current = snapshot;
        setError(`${apiMessage(err, 'As camadas não foram salvas.')} Suas mudanças continuam na tela: clique em Salvar para tentar de novo.`);
        return false;
      } finally {
        setSavingLayers(false);
        setStage('idle');
      }
    })();
    inflight.current = run;
    try { return await run; } finally { inflight.current = null; }
  };

  useEffect(() => {
    if (!draft?.length || savingLayers || draft === failedDraft.current) return undefined;
    const timer = setTimeout(() => { void saveDraft(); }, 2500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, savingLayers]);

  /** Cores e animação: juntas numa fila curta, gravadas de uma vez. */
  const queued = useRef<Partial<ArtTheme>>({});
  const queueTimer = useRef<ReturnType<typeof setTimeout>>();
  const [queuePending, setQueuePending] = useState(false);
  const flushQueue = async (): Promise<boolean> => {
    if (queueTimer.current) clearTimeout(queueTimer.current);
    const body = queued.current;
    if (!Object.keys(body).length) return true;
    queued.current = {};
    const t = await patch(body, 'Salvo');
    if (!t) { queued.current = { ...body, ...queued.current }; return false; }
    if (!Object.keys(queued.current).length) setQueuePending(false);
    setLastSaved(new Date());
    return true;
  };
  const queuePatch = (part: Partial<ArtTheme>, delay: number) => {
    queued.current = { ...queued.current, ...part };
    setQueuePending(true);
    if (queueTimer.current) clearTimeout(queueTimer.current);
    queueTimer.current = setTimeout(() => { void flushQueue(); }, delay);
  };

  const nameChanged = !!theme && !!name.trim() && name.trim() !== theme.name;
  const unsaved = !!draft?.length || queuePending || nameChanged || !!pendingRegions;

  /** Botão Salvar: grava tudo agora (nome, cores, animação e camadas). */
  const saveAll = async (): Promise<boolean> => {
    setError(null);
    const okName = nameChanged ? !!(await patch({ name: name.trim() }, 'Nome salvo')) : true;
    const okQueue = await flushQueue();
    const okLayers = await saveDraft();
    const ok = okName && okQueue && okLayers;
    if (ok) { setLastSaved(new Date()); flash('Tudo salvo'); }
    return ok;
  };
  const saveAllRef = useRef(saveAll);
  saveAllRef.current = saveAll;
  const unsavedRef = useRef(unsaved);
  unsavedRef.current = unsaved;

  // Fechar ou recarregar a aba com algo por gravar: o navegador pergunta antes.
  useEffect(() => {
    if (!unsaved) return undefined;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsaved]);

  // Saiu do editor por outro caminho do painel: grava o que faltava.
  useEffect(() => () => { if (unsavedRef.current) void saveAllRef.current(); }, []);

  const leave = async () => {
    if (unsaved && !(await saveAll()) && !(await confirmDialog('Não foi possível salvar. Sair mesmo assim e perder as mudanças que não foram gravadas?'))) return;
    unsavedRef.current = false;
    navigate('/super-admin/temas');
  };

  const changeFormat = async (key: FormatKey) => {
    if (key === format) return;
    if (draft?.length && !(await saveDraft())
      && !(await confirmDialog('As camadas deste formato não foram salvas. Trocar de formato e perder essas mudanças?'))) return;
    setDraft(null);
    setPendingRegions(null);
    setSelectedLayer(null);
    setFormat(key);
    setLive(null);
    setAiNote(null);
  };

  const changeAnimation = (next: ThemeAnimation) => {
    setAnimation(next);
    if (next.presets?.length && (!previewMotion || !next.presets.includes(previewMotion))) setPreviewMotion(next.defaultPreset ?? next.presets[0]);
    queuePatch({ animation: next }, 500);
  };

  const togglePreset = (key: MotionPreset) => {
    const current = animation.presets ?? [];
    const presets = current.includes(key) ? current.filter((p) => p !== key) : [...current, key];
    const defaultPreset = presets.includes(animation.defaultPreset as MotionPreset) ? animation.defaultPreset : presets[0];
    changeAnimation(presets.length ? { presets, defaultPreset, duration } : {});
  };

  const commitRegions = async (next: Regions) => {
    if (!tf) { setPendingRegions(next); setLive(null); return; }
    setLive(next);
    setStage('saving');
    try {
      const t = await artAdminService.saveRegions(id, format, next);
      setTheme(t);
      flash('Áreas salvas');
    } catch (err) {
      setError(apiMessage(err, 'Não foi possível salvar as áreas.'));
    } finally {
      setLive(null);
      setStage('idle');
    }
  };

  const toggleRegion = (key: RegionKey) => {
    const next = { ...regions };
    if (next[key]) delete next[key];
    else next[key] = key === 'footer' ? { x: 0.05, y: 0.9, w: 0.9, h: 0.07 } : key === 'logo' ? { x: 0.05, y: 0.04, w: 0.25, h: 0.1 }
      : key === 'seal' ? { x: 0.7, y: 0.04, w: 0.25, h: 0.14 } : { x: 0.05, y: 0.2, w: 0.9, h: 0.65 };
    setActive(next[key] ? key : null);
    commitRegions(next);
  };

  /**
   * Varinha das cores: monta a composição completa do formato aberto (base,
   * enfeites, mesmo os não salvos, e o selo) e tira dela a paleta da etiqueta.
   */
  const [harmonizing, setHarmonizing] = useState(false);
  const harmonize = async () => {
    setHarmonizing(true);
    setError(null);
    try {
      const { width, height } = FORMATS[format];
      const W = 360;
      const H = Math.round((W * height) / width);
      const canvas = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
      const full = canvas();
      const decor = canvas();
      const fctx = full.getContext('2d')!;
      fctx.fillStyle = '#ffffff';
      fctx.fillRect(0, 0, W, H);
      const visible = layers.filter((l) => !l.hidden);
      if (visible.length) {
        const loaded = await loadLayers(visible);
        drawLayers(fctx, loaded, W, H);
        drawLayers(decor.getContext('2d')!, loaded.filter((l) => l.role !== 'base'), W, H);
      } else if (tf) {
        const bg = await loadImage(tf.backgroundUrl);
        if (bg) fctx.drawImage(bg, 0, 0, W, H);
      }
      const seal = await loadImage(theme?.sealUrl);
      const parts: Parameters<typeof compositionPalette>[0] = [
        { image: full, weight: 1, products: regions.products },
        { image: decor, weight: 2, products: regions.products },
      ];
      // Selo inteiro, sem cortar pela área de produtos: é a peça mais "da marca" do tema.
      if (seal) parts.push({ image: seal, weight: 3 });
      const next = compositionPalette(parts);
      setPalette(next);
      await patch({ palette: next }, 'Cores tiradas da composição');
    } catch {
      setError('Não foi possível ler as cores da composição.');
    } finally {
      setHarmonizing(false);
    }
  };

  const setColor = (key: keyof Palette, value: string) => {
    const next = { ...palette, [key]: value };
    setPalette(next);
    queuePatch({ palette: next }, 600);
  };

  const items = useMemo(() => sampleItems(count, hero, photos), [count, hero, photos]);
  const previewTheme = useMemo(() => (theme ? { ...theme, palette, style } : null), [theme, palette, style]);
  const changeStyle = (next: ThemeStyle) => {
    setStyle(next);
    queuePatch({ style: next }, 500);
  };
  const scene = useScene(
    previewTheme && (tf || draft?.length) ? {
      theme: previewTheme, format, items, brand: { displayName: 'Seu Mercado' }, regionsOverride: regions,
      validFrom: '2026-10-01', validUntil: '2026-10-05', showSeal: true, layersOverride: draft,
    } : null,
    [previewTheme, format, items, regions, tf?.backgroundUrl, draft],
  );

  if (error && !theme) {
    return <div className={CARD}><p className="text-sm text-red-700">{error}</p><Link to="/super-admin/temas" className="mt-3 inline-block text-sm font-semibold text-green-700">Voltar aos temas</Link></div>;
  }
  if (!theme) {
    return <div className="flex h-60 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-green-600" aria-label="Carregando o tema" /></div>;
  }

  const busy = stage !== 'idle' && stage !== 'saving';
  const readyCount = theme.formats.filter((f) => f.regions?.products).length;

  return (
    <div className="flex flex-col gap-5">
      {/* Cabeçalho do tema */}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={leave} className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50" aria-label="Voltar aos temas">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <input className="h-11 min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 text-xl font-bold text-slate-900 hover:border-slate-200 focus:border-green-600 focus:bg-white focus:outline-none"
          value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== theme.name && patch({ name: name.trim() })}
          aria-label="Nome do tema" />
        <select className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-600/20" value={theme.occasion ?? ''} onChange={(e) => patch({ occasion: e.target.value || null })} aria-label="Ocasião">
          <option value="">Ocasião…</option>
          {occasions.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <span role="status" className={`text-sm ${unsaved ? 'text-amber-700' : 'text-slate-500'}`}>
          {savingLayers || stage === 'saving' ? 'Salvando…' : unsaved ? 'Alterações não salvas'
            : lastSaved ? `Tudo salvo às ${lastSaved.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : 'Tudo salvo'}
        </span>
        <Button variant={unsaved ? 'primary' : 'secondary'} onClick={() => { void saveAll(); }} disabled={savingLayers}
          title="Grava agora nome, cores, animação e camadas. O sistema também salva sozinho.">
          {savingLayers ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}Salvar
        </Button>
        {theme.status === 'PUBLISHED'
          ? <Button variant="secondary" onClick={() => patch({ status: 'DRAFT' }, 'Voltou para rascunho')}>Despublicar</Button>
          : <Button onClick={async () => { if (await saveAll()) await patch({ status: 'PUBLISHED' }, 'Tema publicado'); }} disabled={readyCount === 0 || savingLayers}
              title={readyCount === 0 ? 'Suba ao menos um fundo com a área de produtos' : undefined}>Publicar para os mercados</Button>}
        <Button variant="ghost" aria-label="Excluir o tema" onClick={async () => {
          if (!(await confirmDialog(`Excluir o tema "${theme.name}"? Os encartes já publicados continuam no ar.`))) return;
          unsavedRef.current = false;
          await artAdminService.deleteTheme(id);
          navigate('/super-admin/temas');
        }}><Trash2 className="h-4 w-4" /></Button>
      </div>
      <div className="-mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-600">
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${theme.status === 'PUBLISHED' ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-700'}`}>
          {theme.status === 'PUBLISHED' ? 'Publicado' : 'Rascunho'}
        </span>
        <span>{readyCount} de {FORMAT_KEYS.length} formatos prontos</span>
        {saved && <span role="status" className="inline-flex items-center gap-1 text-green-700"><CheckCircle2 className="h-4 w-4" />{saved}</span>}
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_300px]">
        {/* Fundo e áreas */}
        <section className={`${CARD} flex flex-col gap-4`} aria-labelledby="bg-title">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="bg-title" className="text-base font-semibold text-slate-900">Fundo e áreas</h2>
            <div role="tablist" aria-label="Formato" className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
              {FORMAT_KEYS.map((key) => {
                const f = themeFormat(theme, key);
                return (
                  <button key={key} role="tab" aria-selected={format === key} onClick={() => changeFormat(key)}
                    className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition ${format === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
                    <span className={`h-2 w-2 rounded-full ${f?.regions?.products ? 'bg-green-500' : f ? 'bg-amber-400' : 'bg-slate-300'}`} aria-hidden="true" />
                    {FORMATS[key].label}
                  </button>
                );
              })}
            </div>
          </div>

          <input ref={bgInput} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" tabIndex={-1}
            onChange={(e) => { onBackground(e.target.files?.[0]); e.target.value = ''; }} />
          <input ref={layerInput} type="file" multiple accept="image/png,image/webp,image/jpeg,application/json,.json" className="sr-only" tabIndex={-1}
            onChange={(e) => { onLayerFiles(e.target.files); e.target.value = ''; }} />
          <input ref={folderInput} type="file" {...FOLDER_INPUT} className="sr-only" tabIndex={-1}
            onChange={(e) => { onLayerFiles(e.target.files); e.target.value = ''; }} />

          <div role="tablist" aria-label="O que editar" className="flex gap-1 self-start rounded-lg bg-slate-100 p-1">
            {([['layers', 'Camadas do fundo'], ['regions', 'Áreas do encarte']] as const).map(([key, label]) => (
              <button key={key} role="tab" aria-selected={mode === key} onClick={() => setMode(key)} disabled={key === 'regions' && !tf}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition disabled:opacity-40 ${mode === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
                {label}
              </button>
            ))}
          </div>

          {mode === 'layers' ? (
            layers.length === 0 ? (
              <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onLayerFiles(e.dataTransfer.files); }}
                className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center"
                style={{ aspectRatio: `${FORMATS[format].width} / ${FORMATS[format].height}`, maxHeight: 560 }}>
                {busy ? <Loader2 className="h-8 w-8 animate-spin text-green-600" /> : <Layers className="h-8 w-8 text-slate-400" aria-hidden="true" />}
                <span className="text-base font-semibold text-slate-800">{busy ? STAGE_TEXT[stage] : `Fundo em camadas de ${FORMATS[format].label}`}</span>
                {!busy && (
                  <>
                    <span className="max-w-sm text-sm text-slate-600">
                      Arraste os PNGs para cá: a base ({FORMATS[format].width} × {FORMATS[format].height} px) e cada enfeite separado, com fundo transparente.
                      A pasta do Codex com o composicao.json monta os cinco formatos de uma vez.
                    </span>
                    <div className="flex flex-wrap justify-center gap-2">
                      <Button size="sm" onClick={() => folderInput.current?.click()}><FolderOpen className="mr-1.5 h-4 w-4" />Importar pasta do Codex</Button>
                      <Button size="sm" variant="secondary" onClick={() => layerInput.current?.click()}><Upload className="mr-1.5 h-4 w-4" />Escolher PNGs</Button>
                    </div>
                    <button type="button" onClick={() => bgInput.current?.click()} className="text-sm font-medium text-slate-600 underline hover:text-slate-900">
                      Ou enviar um fundo pronto, numa imagem só
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onLayerFiles(e.dataTransfer.files); }} className="flex flex-col gap-3">
                <LayerEditor format={format} layers={layers} selected={selectedLayer} onSelect={setSelectedLayer}
                  regions={regions} sealUrl={theme.sealUrl} onRegionsPreview={setLive} onRegionsCommit={commitRegions}
                  onChange={(next) => setDraft(normalizeLayers(next))} />
                {busy && (
                  <p role="status" className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    <Loader2 className="h-4 w-4 animate-spin" />{STAGE_TEXT[stage]}
                  </p>
                )}
                {!layers.some((l) => l.role === 'base') && (
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Sem base: o fundo sai branco atrás dos enfeites. Envie a base deste formato.</p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" onClick={saveDraft} disabled={!draft || busy}>
                    {stage === 'composing' ? 'Salvando…' : draft ? 'Salvar camadas' : 'Camadas salvas'}
                  </Button>
                  {draft && <Button size="sm" variant="ghost" onClick={() => { setDraft(null); setSelectedLayer(null); }}>Descartar mudanças</Button>}
                  <Button size="sm" variant="secondary" onClick={() => layerInput.current?.click()} disabled={busy}><Upload className="mr-1.5 h-4 w-4" />Adicionar PNGs</Button>
                  <Button size="sm" variant="secondary" onClick={() => folderInput.current?.click()} disabled={busy}><FolderOpen className="mr-1.5 h-4 w-4" />Importar pasta</Button>
                </div>
              </div>
            )
          ) : !tf ? (
            <button type="button" onClick={() => bgInput.current?.click()} disabled={busy}
              onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onBackground(e.dataTransfer.files?.[0]); }}
              className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 text-center transition hover:border-green-500 hover:bg-green-50/40"
              style={{ aspectRatio: `${FORMATS[format].width} / ${FORMATS[format].height}`, maxHeight: 560 }}>
              {busy ? <Loader2 className="h-8 w-8 animate-spin text-green-600" /> : <Upload className="h-8 w-8 text-slate-400" aria-hidden="true" />}
              <span className="text-base font-semibold text-slate-800">{busy ? STAGE_TEXT[stage] : `Enviar o fundo de ${FORMATS[format].label}`}</span>
              <span className="text-sm text-slate-600">PNG de {FORMATS[format].width} × {FORMATS[format].height} px ({FORMATS[format].hint}). Arraste para cá ou clique.</span>
            </button>
          ) : (
            <>
              <div className="mx-auto w-full" style={{ maxWidth: Math.min(560, 560 * (tf.width / tf.height) * 1.1) }}>
                <RegionEditor
                  backgroundUrl={tf.backgroundUrl} width={tf.width} height={tf.height} regions={regions}
                  candidates={candidates[format]} showCandidates={showCandidates}
                  active={active} onActive={setActive} onPreview={setLive} onCommit={commitRegions}
                />
              </div>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Áreas do tema">
                {(Object.keys(REGION_META) as RegionKey[]).map((key) => (
                  <button key={key} type="button" onClick={() => (regions[key] ? setActive(key) : toggleRegion(key))}
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition ${active === key ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'}`}>
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: REGION_META[key].color, opacity: regions[key] ? 1 : 0.3 }} aria-hidden="true" />
                    {REGION_META[key].label}{!regions[key] && ' (adicionar)'}
                  </button>
                ))}
                {active && active !== 'products' && regions[active] && (
                  <button type="button" onClick={() => toggleRegion(active)} className="text-sm font-medium text-red-700 hover:underline">
                    Tirar {REGION_META[active].label.toLowerCase()}
                  </button>
                )}
              </div>
              {(busy || aiNote) && (
                <p role="status" className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${busy ? 'bg-slate-50 text-slate-700' : 'bg-violet-50 text-violet-900'}`}>
                  {busy ? <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" /> : <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />}
                  {busy ? STAGE_TEXT[stage] : aiNote}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => analyze(theme, format)} disabled={busy}>
                  {aiReady ? <Wand2 className="mr-1.5 h-4 w-4" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
                  {aiReady ? 'Marcar de novo com IA' : 'Marcar de novo'}
                </Button>
                <Button variant="secondary" size="sm" onClick={() => bgInput.current?.click()} disabled={busy}>Trocar fundo</Button>
                {candidates[format] && (
                  <Button variant="ghost" size="sm" onClick={() => setShowCandidates((v) => !v)}>
                    {showCandidates ? 'Esconder áreas livres' : 'Ver áreas livres medidas'}
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={async () => {
                  if (!(await confirmDialog(`Remover o fundo de ${FORMATS[format].label}?`))) return;
                  setTheme(await artAdminService.deleteFormat(id, format));
                }} disabled={busy}>Remover fundo</Button>
              </div>
            </>
          )}
        </section>

        {/* Prévia */}
        {/* Fixa na tela: a prévia acompanha enquanto se mexe em estilo, cores e animação lá embaixo. */}
        <section className={`${CARD} flex flex-col gap-3 xl:sticky xl:top-20 xl:self-start`} aria-labelledby="preview-title">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="preview-title" className="text-base font-semibold text-slate-900">Como fica no encarte</h2>
            <span className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={photos} onChange={(e) => setPhotos(e.target.checked)} className="h-4 w-4 accent-green-600" />
                Com fotos
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={hero} onChange={(e) => setHero(e.target.checked)} className="h-4 w-4 accent-green-600" />
                Com destaque
              </label>
            </span>
          </div>
          <label className="flex items-center gap-3 text-sm text-slate-700">
            <span className="shrink-0">{count} {count === 1 ? 'produto' : 'produtos'}</span>
            <input type="range" min={1} max={16} value={count} onChange={(e) => setCount(Number(e.target.value))} className="w-full accent-green-600" aria-label="Quantidade de produtos na prévia" />
          </label>
          {(animation.presets?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-1" role="group" aria-label="Animação da prévia">
              {[null, ...(animation.presets ?? [])].map((key) => (
                <button key={key ?? 'static'} type="button" onClick={() => setPreviewMotion(key)} aria-pressed={previewMotion === key}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${previewMotion === key ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'}`}>
                  {key ? MOTION_PRESETS[key].label : 'Estático'}
                </button>
              ))}
            </div>
          )}
          {tf || draft?.length ? (
            <ArtCanvas scene={scene} label={`Prévia do tema ${theme.name} em ${FORMATS[format].label}`} maxHeight={560}
              motion={previewMotion ? { preset: previewMotion, duration } : null} />
          ) : (
            <p className="rounded-lg bg-slate-50 px-3 py-10 text-center text-sm text-slate-600">A prévia aparece depois do fundo.</p>
          )}
          <p className="text-xs text-slate-500">Produtos de exemplo. O editor dos mercados monta a grade sozinho para qualquer quantidade.</p>
        </section>

        {/* Selo e cores */}
        <div className="flex flex-col gap-5">
          <section className={`${CARD} flex flex-col gap-3`} aria-labelledby="seal-title">
            <h2 id="seal-title" className="text-base font-semibold text-slate-900">Selo 3D do tema</h2>
            <input ref={sealInput} type="file" accept="image/png,image/webp" className="sr-only" tabIndex={-1}
              onChange={(e) => { onSeal(e.target.files?.[0]); e.target.value = ''; }} />
            <button type="button" onClick={() => sealInput.current?.click()}
              className="flex h-40 items-center justify-center rounded-xl border border-slate-200"
              style={{ background: 'repeating-conic-gradient(#e7e5e4 0% 25%, #fafaf9 0% 50%) 50% / 16px 16px' }}
              aria-label={theme.sealUrl ? 'Trocar o selo' : 'Enviar o selo'}>
              {theme.sealUrl
                ? <img src={theme.sealUrl} alt="Selo do tema" className="max-h-36 max-w-[90%] object-contain drop-shadow-xl" />
                : <span className="flex flex-col items-center gap-1 text-sm text-slate-600"><Upload className="h-6 w-6 text-slate-400" />Enviar PNG transparente</span>}
            </button>
            {theme.sealUrl && (
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => sealInput.current?.click()}>Trocar</Button>
                <Button variant="ghost" size="sm" onClick={async () => setTheme(await artAdminService.removeSeal(id))}>Remover</Button>
              </div>
            )}
            <p className="text-xs text-slate-500">Vai na área de selo de cada formato. O mercado pode esconder, mas não trocar.</p>
          </section>

          <section className={`${CARD} flex flex-col gap-3`} aria-labelledby="motion-title">
            <h2 id="motion-title" className="text-base font-semibold text-slate-900">Animação do tema</h2>
            <p className="text-xs text-slate-500">Marque as que este tema oferece. O mercado escolhe entre elas e baixa o vídeo (story, post, quadrado e TV).</p>
            <ul className="flex flex-col gap-1.5">
              {MOTION_KEYS.map((key) => {
                const on = animation.presets?.includes(key) ?? false;
                return (
                  <li key={key} className={`rounded-lg border px-3 py-2 ${on ? 'border-green-600 bg-green-50/50' : 'border-slate-200'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
                        <input type="checkbox" checked={on} onChange={() => togglePreset(key)} className="h-4 w-4 accent-green-600" />
                        {MOTION_PRESETS[key].label}
                      </label>
                      {on && (
                        animation.defaultPreset === key
                          ? <span className="rounded-full bg-green-600 px-2 py-0.5 text-[11px] font-semibold text-white">Padrão</span>
                          : <button type="button" onClick={() => changeAnimation({ ...animation, defaultPreset: key, duration })} className="text-xs font-medium text-green-700 hover:underline">Tornar padrão</button>
                      )}
                    </div>
                    <p className="mt-0.5 pl-6 text-xs text-slate-500">{MOTION_PRESETS[key].hint}</p>
                  </li>
                );
              })}
            </ul>
            {(animation.presets?.length ?? 0) > 0 && (
              <label className="flex items-center gap-3 text-sm text-slate-700">
                <span className="shrink-0">Duração {duration} s</span>
                <input type="range" min={4} max={15} value={duration} onChange={(e) => changeAnimation({ ...animation, duration: Number(e.target.value) })}
                  className="w-full accent-green-600" aria-label="Duração da animação em segundos" />
              </label>
            )}
          </section>

          <section className={`${CARD} flex flex-col gap-3`} aria-labelledby="style-title">
            <h2 id="style-title" className="text-base font-semibold text-slate-900">Etiqueta, cartões e textos</h2>
            <p className="-mt-1 text-xs text-slate-500">Fontes, formato da etiqueta de preço, cartão dos produtos, nome e rodapé deste tema. A prévia muda na hora e salva sozinho.</p>
            <StyleEditor style={style} onChange={changeStyle} />
          </section>

          <section className={`${CARD} flex flex-col gap-3`} aria-labelledby="colors-title">
            <div className="flex items-center justify-between gap-2">
              <h2 id="colors-title" className="text-base font-semibold text-slate-900">Cores da etiqueta</h2>
              <button type="button" onClick={harmonize} disabled={harmonizing || (!tf && !layers.length)}
                title={`Ler as cores da composição completa de ${FORMATS[format].label} (fundo, enfeites e selo)`}
                aria-label="Tirar as cores da etiqueta da composição completa"
                className="inline-flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-2.5 py-1.5 text-sm font-medium text-green-800 transition hover:bg-green-100 disabled:opacity-40">
                {harmonizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}Combinar
              </button>
            </div>
            <p className="-mt-1 text-xs text-slate-500">A varinha lê fundo, enfeites e selo de {FORMATS[format].label} e deixa a etiqueta na identidade do tema.</p>
            {PALETTE_FIELDS.map(({ key, label }) => (
              <label key={key} className="flex items-center justify-between gap-3 text-sm text-slate-700">
                {label}
                <span className="flex items-center gap-2">
                  <span className="font-mono text-xs text-slate-500">{palette[key]}</span>
                  <input type="color" value={palette[key]} onChange={(e) => setColor(key, e.target.value)}
                    className="h-8 w-10 cursor-pointer rounded border border-slate-300 bg-white p-0.5" />
                </span>
              </label>
            ))}
            <p className="text-xs text-slate-500">
              Nos mercados, o padrão é &quot;cores automáticas&quot;: cada formato combina com o próprio fundo. Estas cores valem quando o mercado escolhe &quot;Do tema&quot;.
            </p>
            {aiPalette && (
              <button type="button" onClick={() => { const next = { ...palette, ...aiPalette } as Palette; setPalette(next); patch({ palette: next }, 'Cores da IA aplicadas'); setAiPalette(null); }}
                className="flex items-center justify-between gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-left text-sm text-violet-900 hover:bg-violet-100">
                <span className="flex items-center gap-2"><Sparkles className="h-4 w-4" />Usar as cores que a IA sugeriu</span>
                <span className="flex gap-1">{Object.values(aiPalette).map((c, i) => <span key={i} className="h-4 w-4 rounded-sm border border-white" style={{ background: c as string }} />)}</span>
              </button>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

// ── Tela ─────────────────────────────────────────────────────────────────

const SuperAdminArtThemes: React.FC = () => {
  const { themeId } = useParams();
  const [settings, setSettings] = useState<PlatformAiSettings | null>(null);
  const [occasions, setOccasions] = useState<string[]>([]);

  useEffect(() => {
    artAdminService.aiSettings().then(setSettings).catch(() => {});
    artAdminService.meta().then((m) => setOccasions(m.occasions)).catch(() => {});
  }, []);

  const aiReady = !!settings?.configured && !!settings?.encryptionReady;

  return (
    <SuperAdminLayout>
      <div className="flex flex-col gap-6">
        {themeId ? (
          <ThemeEditor id={themeId} aiReady={aiReady} occasions={occasions} />
        ) : (
          <>
            <AiKeyCard settings={settings} onChange={setSettings} />
            <CodexMcpCard />
            <ThemeGallery aiReady={aiReady} />
          </>
        )}
      </div>
    </SuperAdminLayout>
  );
};

export default SuperAdminArtThemes;
