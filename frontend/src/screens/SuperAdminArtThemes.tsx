import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, CheckCircle2, Eye, EyeOff, ImagePlus, KeyRound, Loader2, Plus, RefreshCw, Sparkles, Trash2, Upload, Wand2,
} from 'lucide-react';
import SuperAdminLayout from '../components/layout/SuperAdminLayout';
import Button from '../components/common/Button';
import { artAdminService, apiMessage } from '../services/art.service';
import type { ArtTheme, FormatKey, Palette, PlatformAiSettings, RegionKey, Regions, ThemeSuggestion } from '../types/art.types';
import { DEFAULT_PALETTE, FORMATS, FORMAT_KEYS, REGION_META, SAMPLE_ITEMS, themeFormat } from '../features/art-studio/formats';
import { Candidate, analyzeBackground, annotatedImage, regionsFromAssignment } from '../features/art-studio/analyze';
import { loadImage } from '../features/art-studio/assets';
import { derivePalette } from '../features/art-studio/palette';
import { useScene } from '../features/art-studio/scene';
import ArtCanvas from '../features/art-studio/ArtCanvas';
import RegionEditor from '../features/art-studio/RegionEditor';

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
    if (!window.confirm('Remover a chave do DeepSeek? O criador de temas volta a sugerir as áreas só pela análise da imagem.')) return;
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

type Stage = 'idle' | 'uploading' | 'measuring' | 'ai' | 'saving';
const STAGE_TEXT: Record<Stage, string> = {
  idle: '', uploading: 'Enviando o fundo…', measuring: 'Medindo as áreas livres do fundo…', ai: 'A IA está escolhendo as áreas…', saving: 'Salvando…',
};

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
  const [saved, setSaved] = useState<string | null>(null);
  const paletteTimer = useRef<ReturnType<typeof setTimeout>>();
  const bgInput = useRef<HTMLInputElement>(null);
  const sealInput = useRef<HTMLInputElement>(null);

  const accept = useCallback((t: ArtTheme) => {
    setTheme(t);
    setPalette({ ...DEFAULT_PALETTE, ...t.palette });
    setName(t.name);
  }, []);

  useEffect(() => {
    artAdminService.theme(id).then((t) => {
      accept(t);
      const first = FORMAT_KEYS.find((f) => themeFormat(t, f));
      if (first) setFormat(first);
    }).catch((err) => setError(apiMessage(err, 'Tema não encontrado.')));
  }, [id, accept]);

  const tf = themeFormat(theme, format);
  const regions = live ?? tf?.regions ?? {};

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

  const commitRegions = async (next: Regions) => {
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

  const setColor = (key: keyof Palette, value: string) => {
    const next = { ...palette, [key]: value };
    setPalette(next);
    if (paletteTimer.current) clearTimeout(paletteTimer.current);
    paletteTimer.current = setTimeout(() => patch({ palette: next }, 'Cores salvas'), 600);
  };

  const items = useMemo(() => SAMPLE_ITEMS.slice(0, count).map((it, i) => ({ ...it, hero: hero && i === 0 })), [count, hero]);
  const previewTheme = useMemo(() => (theme ? { ...theme, palette } : null), [theme, palette]);
  const scene = useScene(
    previewTheme && tf ? {
      theme: previewTheme, format, items, brand: { displayName: 'Seu Mercado' }, regionsOverride: regions,
      validFrom: '2026-10-01', validUntil: '2026-10-05', showSeal: true,
    } : null,
    [previewTheme, format, items, regions, tf?.backgroundUrl],
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
        <Link to="/super-admin/temas" className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50" aria-label="Voltar aos temas">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <input className="h-11 min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 text-xl font-bold text-slate-900 hover:border-slate-200 focus:border-green-600 focus:bg-white focus:outline-none"
          value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== theme.name && patch({ name: name.trim() })}
          aria-label="Nome do tema" />
        <select className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-600/20" value={theme.occasion ?? ''} onChange={(e) => patch({ occasion: e.target.value || null })} aria-label="Ocasião">
          <option value="">Ocasião…</option>
          {occasions.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        {theme.status === 'PUBLISHED'
          ? <Button variant="secondary" onClick={() => patch({ status: 'DRAFT' }, 'Voltou para rascunho')}>Despublicar</Button>
          : <Button onClick={() => patch({ status: 'PUBLISHED' }, 'Tema publicado')} disabled={readyCount === 0}
              title={readyCount === 0 ? 'Suba ao menos um fundo com a área de produtos' : undefined}>Publicar para os mercados</Button>}
        <Button variant="ghost" aria-label="Excluir o tema" onClick={async () => {
          if (!window.confirm(`Excluir o tema "${theme.name}"? Os encartes já publicados continuam no ar.`)) return;
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
                  <button key={key} role="tab" aria-selected={format === key} onClick={() => { setFormat(key); setLive(null); setAiNote(null); }}
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

          {!tf ? (
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
                  if (!window.confirm(`Remover o fundo de ${FORMATS[format].label}?`)) return;
                  setTheme(await artAdminService.deleteFormat(id, format));
                }} disabled={busy}>Remover fundo</Button>
              </div>
            </>
          )}
        </section>

        {/* Prévia */}
        <section className={`${CARD} flex flex-col gap-3`} aria-labelledby="preview-title">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="preview-title" className="text-base font-semibold text-slate-900">Como fica no encarte</h2>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={hero} onChange={(e) => setHero(e.target.checked)} className="h-4 w-4 accent-green-600" />
              Com destaque
            </label>
          </div>
          <label className="flex items-center gap-3 text-sm text-slate-700">
            <span className="shrink-0">{count} {count === 1 ? 'produto' : 'produtos'}</span>
            <input type="range" min={1} max={16} value={count} onChange={(e) => setCount(Number(e.target.value))} className="w-full accent-green-600" aria-label="Quantidade de produtos na prévia" />
          </label>
          {tf ? (
            <ArtCanvas scene={scene} label={`Prévia do tema ${theme.name} em ${FORMATS[format].label}`} maxHeight={560} />
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

          <section className={`${CARD} flex flex-col gap-3`} aria-labelledby="colors-title">
            <h2 id="colors-title" className="text-base font-semibold text-slate-900">Cores da etiqueta</h2>
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
            {tf && (
              <button type="button" onClick={async () => {
                const img = await loadImage(tf.backgroundUrl);
                if (!img) return;
                const next = derivePalette(img, regions.products);
                setPalette(next);
                patch({ palette: next }, 'Cores tiradas do fundo');
              }} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-left text-sm font-medium text-slate-800 hover:bg-slate-50">
                <Wand2 className="h-4 w-4 text-green-700" />Tirar as cores do fundo de {FORMATS[format].label}
              </button>
            )}
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
            <ThemeGallery aiReady={aiReady} />
          </>
        )}
      </div>
    </SuperAdminLayout>
  );
};

export default SuperAdminArtThemes;
