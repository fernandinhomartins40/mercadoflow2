import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowRightLeft, CheckCircle2, Flame, Hammer, LayoutGrid, Lightbulb, MapPin, Minus, Plus, Search,
  Snowflake, Star, Store,
} from 'lucide-react';
import Layout from '../components/layout/Layout';
import SegmentedTabs from '../components/ui/SegmentedTabs';
import ProductImage from '../components/product/ProductImage';
import { useAuth } from '../context/AuthContext';
import { storeMapService } from '../services/storeMap.service';
import { formatMoney } from '../utils/formatters';
import type {
  DepartmentsReport, Fixture, FixtureType, InsightKind, LocatedProduct, StoreInsight, StorePlan,
} from '../types/storeMap.types';
import PlanView from '../features/store-map/PlanView';
import FixtureEditor from '../features/store-map/FixtureEditor';
import SetupWizard from '../features/store-map/SetupWizard';
import { DEPT_BY_KEY, FIXTURES, deptLabel, fixtureName, newId, revenuePerFixture } from '../features/store-map/model';

/**
 * Loja Viva (F17, D-022): a planta da loja vista de cima, montada em um toque
 * a partir do tamanho da loja, com cada produto localizado sozinho pelo NCM da
 * nota. Três modos: Montar, Calor de vendas e Sugestões — mais "Onde fica?".
 */

type Mode = 'montar' | 'calor' | 'sugestoes';
const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-700)]';
const SAVE_DELAY_MS = 1200;

const compactMoney = (v: number) =>
  v >= 1000 ? `R$ ${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : `R$ ${Math.round(v).toLocaleString('pt-BR')}`;

const INSIGHT_ICON: Record<InsightKind, React.ElementType> = {
  PLACE: MapPin, COLD: Snowflake, CLOSER: ArrowRightLeft, MAGNET: Store, SLOW_SPOT: Flame, END_CAP: Star, EMPTY: LayoutGrid,
};

const Panel: React.FC<{ title: string; children: React.ReactNode; action?: React.ReactNode }> = ({ title, children, action }) => (
  <section className="flex flex-col gap-3 rounded-2xl p-4" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}>
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h2>
      {action}
    </div>
    {children}
  </section>
);

const StoreMap: React.FC = () => {
  const { marketId } = useAuth();
  const [plan, setPlan] = useState<StorePlan | null>(null);
  const [report, setReport] = useState<DepartmentsReport | null>(null);
  const [insights, setInsights] = useState<StoreInsight[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [reportLoading, setReportLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('montar');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<{ ids: string[]; connect?: [string, string] | null; note?: string } | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'pending' | 'saving' | 'saved' | 'error'>('idle');
  const [justCreated, setJustCreated] = useState(false);
  const [creating, setCreating] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const latestPlan = useRef<StorePlan | null>(null);

  // ── Carga ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!marketId) return;
    let cancelled = false;
    // A planta aparece assim que chega; as vendas (mais pesadas) completam depois.
    storeMapService.getPlan(marketId)
      .then((p) => { if (!cancelled) setPlan(p); })
      .catch(() => { if (!cancelled) setError('Não foi possível abrir a planta da loja.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    storeMapService.getDepartments(marketId)
      .then((r) => { if (!cancelled) setReport(r); })
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setReportLoading(false); });
    return () => { cancelled = true; };
  }, [marketId]);

  const loadInsights = useCallback(async () => {
    if (!marketId) return;
    try { setInsights(await storeMapService.getInsights(marketId)); } catch { setInsights([]); }
  }, [marketId]);

  useEffect(() => { if (mode === 'sugestoes' && plan && insights === null) loadInsights(); }, [mode, plan, insights, loadInsights]);

  // ── Gravação automática ─────────────────────────────────────────────────
  const persist = useCallback(async () => {
    if (!marketId || !latestPlan.current) return;
    setSaveState('saving');
    try {
      await storeMapService.savePlan(marketId, latestPlan.current);
      setSaveState('saved');
      setInsights(null); // sugestões dependem da planta: recalcula ao abrir
    } catch {
      setSaveState('error');
    }
  }, [marketId]);

  const update = useCallback((next: StorePlan, immediate = false) => {
    setPlan(next);
    latestPlan.current = next;
    setSaveState('pending');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(persist, immediate ? 0 : SAVE_DELAY_MS);
  }, [persist]);

  useEffect(() => () => {
    // Saiu da tela com alteração pendente: grava na hora.
    if (saveTimer.current) { clearTimeout(saveTimer.current); persist(); }
  }, [persist]);

  const patchFixture = (id: string, patch: Partial<Fixture>) => {
    if (!plan) return;
    update({ ...plan, fixtures: plan.fixtures.map((f) => (f.id === id ? { ...f, ...patch } : f)) });
  };

  const addFixture = (type: FixtureType) => {
    if (!plan) return;
    const m = FIXTURES[type];
    const offset = (plan.fixtures.length % 6) * 0.5;
    const f: Fixture = {
      id: newId(), type, label: `${m.label} ${plan.fixtures.filter((x) => x.type === type).length + 1}`,
      x: Math.max(0, plan.width / 2 - m.w / 2 + offset), y: Math.max(0, plan.height / 2 - m.h / 2 + offset),
      w: m.w, h: m.h, departments: [],
    };
    update({ ...plan, fixtures: [...plan.fixtures, f] });
    setSelectedId(f.id);
  };

  const createPlan = async (next: StorePlan) => {
    if (!marketId) return;
    setCreating(true);
    try {
      const saved = await storeMapService.savePlan(marketId, next);
      setPlan(saved);
      latestPlan.current = saved;
      setJustCreated(true);
      setSaveState('saved');
    } catch {
      setError('Não foi possível salvar a planta. Tente de novo.');
    } finally {
      setCreating(false);
    }
  };

  // ── Derivados ────────────────────────────────────────────────────────────
  const heat = useMemo(() => (plan ? revenuePerFixture(plan, report) : {}), [plan, report]);
  const selected = plan?.fixtures.find((f) => f.id === selectedId) ?? null;
  const placed = useMemo(() => new Set(plan?.fixtures.flatMap((f) => f.departments) ?? []), [plan]);
  const departments = (report?.departments ?? []).filter((d) => d.key !== 'OUTROS');
  const unplacedSelling = departments.filter((d) => !placed.has(d.key) && d.revenueShare >= 0.02);
  const highlightSet = useMemo(() => new Set(highlight?.ids ?? []), [highlight]);

  const showDepartment = (key: string) => {
    const ids = plan?.fixtures.filter((f) => f.departments.includes(key)).map((f) => f.id) ?? [];
    setHighlight({ ids, note: ids.length ? `${deptLabel(key)}: ${ids.length === 1 ? '1 móvel' : `${ids.length} móveis`}` : `${deptLabel(key)} ainda não tem lugar no mapa` });
  };

  const saveLabel = { idle: '', pending: 'Alterações não salvas…', saving: 'Salvando…', saved: 'Salvo', error: 'Não salvou — tente de novo' }[saveState];

  // ── Render ───────────────────────────────────────────────────────────────
  if (loading) {
    return <Layout><div className="flex min-h-[300px] items-center justify-center" role="status"><div className="h-6 w-6 animate-spin rounded-full border-2 border-green-500 border-t-transparent" /><span className="sr-only">Carregando o mapa</span></div></Layout>;
  }

  return (
    <Layout>
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Mapa da loja</h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Onde fica cada setor, onde a loja mais vende e o que mudar de lugar.</p>
          </div>
          {plan && saveLabel && (
            <span className="text-sm" role="status" style={{ color: saveState === 'error' ? '#b91c1c' : 'var(--text-muted)' }}>
              {saveState === 'saved' && <CheckCircle2 className="mr-1 inline h-4 w-4" style={{ color: 'var(--brand-700)' }} aria-hidden="true" />}
              {saveLabel}
              {saveState === 'error' && <button type="button" onClick={persist} className="ml-2 font-semibold underline">Tentar de novo</button>}
            </span>
          )}
        </div>

        {error && <p role="alert" className="rounded-lg px-4 py-3 text-sm" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b' }}>{error}</p>}

        {!plan ? (
          <SetupWizard report={report} onPick={createPlan} busy={creating} reading={reportLoading} />
        ) : (
          <>
            {justCreated && (
              <div className="flex items-start gap-3 rounded-2xl p-4" style={{ background: 'var(--surface-success)', border: '1px solid var(--border-success)' }}>
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" style={{ color: 'var(--brand-700)' }} aria-hidden="true" />
                <div className="min-w-0 flex-1 text-sm" style={{ color: 'var(--text-primary)' }}>
                  <p className="font-semibold">Planta pronta, com os setores já no lugar.</p>
                  <p style={{ color: 'var(--text-muted)' }}>Confira com a sua loja: arraste o que estiver em outro lugar e toque num móvel para trocar o setor. Tudo é salvo sozinho.</p>
                </div>
                <button type="button" onClick={() => setJustCreated(false)} className={`text-sm font-semibold ${FOCUS}`} style={{ color: 'var(--brand-700)' }}>Entendi</button>
              </div>
            )}

            <SegmentedTabs<Mode>
              tabs={[
                { key: 'montar', label: 'Montar', icon: <Hammer className="h-4 w-4" /> },
                { key: 'calor', label: 'Calor de vendas', icon: <Flame className="h-4 w-4" /> },
                { key: 'sugestoes', label: 'Sugestões', icon: <Lightbulb className="h-4 w-4" />, badge: insights?.filter((i) => i.priority >= 60).length || undefined },
              ]}
              value={mode}
              onChange={(m) => { setMode(m); setHighlight(null); if (m !== 'montar') setSelectedId(null); }}
              label="Modo do mapa"
            />

            <LocateSearch marketId={marketId!} plan={plan} onFound={(ids, note) => setHighlight({ ids, note })} />

            {highlight?.note && (
              <p className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm" role="status" style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' }}>
                <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" /> {highlight.note}
                <button type="button" onClick={() => setHighlight(null)} className="ml-auto font-semibold underline">Limpar</button>
              </p>
            )}

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
              {/* No desktop a planta fica à vista enquanto o painel ao lado rola. */}
              <div className="min-w-0 self-start rounded-2xl p-2 sm:p-3 lg:sticky lg:top-20" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}>
                <PlanView
                  plan={plan}
                  mode={mode === 'montar' ? 'edit' : mode === 'calor' ? 'heat' : 'view'}
                  selectedId={selectedId}
                  highlightIds={highlightSet}
                  connect={highlight?.connect ?? null}
                  heat={heat}
                  heatLabel={(id) => (heat[id] != null ? compactMoney(heat[id]) : 'sem setor')}
                  onSelect={setSelectedId}
                  onMove={(id, x, y) => patchFixture(id, { x, y })}
                />
                {mode === 'montar' && (
                  <p className="px-2 pb-1 pt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                    Toque num móvel para dizer o que tem nele. Arraste para mover.
                  </p>
                )}
                {mode === 'calor' && <HeatLegend />}
              </div>

              <div className="flex min-w-0 flex-col gap-4">
                {mode === 'montar' && (selected ? (
                  <Panel title={fixtureName(selected)}>
                    <FixtureEditor
                      fixture={selected}
                      report={report}
                      onChange={(patch) => patchFixture(selected.id, patch)}
                      onDuplicate={() => {
                        const copy = { ...selected, id: newId(), x: Math.min(plan.width - selected.w, selected.x + 1.5), label: `${fixtureName(selected)} (cópia)` };
                        update({ ...plan, fixtures: [...plan.fixtures, copy] });
                        setSelectedId(copy.id);
                      }}
                      onRemove={() => { update({ ...plan, fixtures: plan.fixtures.filter((f) => f.id !== selected.id) }); setSelectedId(null); }}
                      onClose={() => setSelectedId(null)}
                    />
                  </Panel>
                ) : (
                  <>
                    <Panel title="Setores da loja">
                      {departments.length === 0 ? (
                        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Os setores aparecem aqui assim que as vendas chegarem.</p>
                      ) : (
                        <>
                          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                            {unplacedSelling.length === 0
                              ? 'Todos os setores que vendem já têm lugar no mapa.'
                              : `${unplacedSelling.length} ${unplacedSelling.length === 1 ? 'setor ainda sem lugar' : 'setores ainda sem lugar'}. Toque num móvel e marque o setor.`}
                          </p>
                          <ul className="flex flex-col gap-1">
                            {departments.map((d) => (
                              <li key={d.key}>
                                <button type="button" onClick={() => showDepartment(d.key)}
                                  className={`flex min-h-[44px] w-full items-center gap-2 rounded-lg px-2 text-left text-sm transition hover:bg-[var(--surface-soft)] ${FOCUS}`}>
                                  <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: DEPT_BY_KEY[d.key]?.color }} />
                                  <span className="min-w-0 flex-1 truncate" style={{ color: 'var(--text-primary)' }}>{d.label}</span>
                                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{Math.round(d.revenueShare * 100)}%</span>
                                  {placed.has(d.key)
                                    ? <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: 'var(--brand-700)' }} aria-label="no mapa" />
                                    : <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: '#fffbeb', color: '#92400e' }}>sem lugar</span>}
                                </button>
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                    </Panel>

                    <Panel title="Adicionar móvel">
                      <div className="grid grid-cols-2 gap-2">
                        {(Object.keys(FIXTURES) as FixtureType[])
                          .filter((t) => t !== 'entrada' || !plan.fixtures.some((f) => f.type === 'entrada'))
                          .map((t) => {
                            const m = FIXTURES[t];
                            return (
                              <button key={t} type="button" onClick={() => addFixture(t)} title={m.hint}
                                className={`flex min-h-[48px] items-center gap-2 rounded-lg px-2 text-left text-sm font-medium ${FOCUS}`}
                                style={{ border: '1px solid var(--border-soft)', color: 'var(--text-primary)' }}>
                                <span aria-hidden="true" className="h-5 w-5 shrink-0 rounded" style={{ background: m.fill, border: `1.5px solid ${m.stroke}` }} />
                                <span className="min-w-0"><span className="block">{m.label}</span><span className="block truncate text-[11px] font-normal" style={{ color: 'var(--text-muted)' }}>{m.hint}</span></span>
                              </button>
                            );
                          })}
                      </div>
                    </Panel>

                    <Panel title="Tamanho da loja">
                      {([['Largura', 'width'], ['Profundidade', 'height']] as const).map(([label, key]) => (
                        <div key={key} className="flex items-center justify-between gap-2">
                          <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{label}</span>
                          <div className="flex items-center gap-1">
                            <button type="button" aria-label={`Diminuir ${label.toLowerCase()}`} onClick={() => update({ ...plan, [key]: Math.max(6, plan[key] - 1) })}
                              className={`inline-flex h-11 w-11 items-center justify-center rounded-lg ${FOCUS}`} style={{ border: '1px solid var(--border-strong)' }}><Minus className="h-4 w-4" /></button>
                            <span className="min-w-[3.5rem] text-center text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{plan[key]} m</span>
                            <button type="button" aria-label={`Aumentar ${label.toLowerCase()}`} onClick={() => update({ ...plan, [key]: Math.min(80, plan[key] + 1) })}
                              className={`inline-flex h-11 w-11 items-center justify-center rounded-lg ${FOCUS}`} style={{ border: '1px solid var(--border-strong)' }}><Plus className="h-4 w-4" /></button>
                          </div>
                        </div>
                      ))}
                      <button type="button" onClick={() => { if (window.confirm('Apagar a planta e escolher outra de novo?')) { setPlan(null); latestPlan.current = null; setSelectedId(null); } }}
                        className="self-start text-sm font-medium underline" style={{ color: 'var(--text-muted)' }}>
                        Recomeçar com outra planta
                      </button>
                    </Panel>
                  </>
                ))}

                {mode === 'calor' && (
                  <HeatPanel plan={plan} report={report} heat={heat} selectedId={selectedId} onSelect={setSelectedId} />
                )}

                {mode === 'sugestoes' && (
                  <InsightsPanel
                    insights={insights}
                    onShow={(ins) => setHighlight({
                      ids: ins.fixtureIds,
                      connect: ins.kind === 'CLOSER' && ins.fixtureIds.length === 2 ? [ins.fixtureIds[0], ins.fixtureIds[1]] : null,
                      note: ins.title,
                    })}
                    onFix={(ins) => {
                      setMode('montar');
                      setHighlight(null);
                      if (ins.fixtureIds[0]) setSelectedId(ins.fixtureIds[0]);
                    }}
                  />
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
};

// ── Onde fica? ─────────────────────────────────────────────────────────────

const LocateSearch: React.FC<{ marketId: string; plan: StorePlan; onFound: (ids: string[], note: string) => void }> = ({ marketId, plan, onFound }) => {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<LocatedProduct[] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) { setResults(null); return; }
    const t = setTimeout(() => {
      storeMapService.locate(marketId, q.trim()).then(setResults).catch(() => setResults([]));
    }, 300);
    return () => clearTimeout(t);
  }, [q, marketId]);

  const pick = (p: LocatedProduct) => {
    const fixtures = plan.fixtures.filter((f) => f.departments.includes(p.department));
    const names = fixtures.map(fixtureName);
    onFound(
      fixtures.map((f) => f.id),
      fixtures.length
        ? `${p.name} fica em ${p.departmentLabel}: ${names.slice(0, 3).join(', ')}${names.length > 3 ? '…' : ''}`
        : `${p.name} é de ${p.departmentLabel}, que ainda não tem lugar no mapa`,
    );
    setOpen(false);
    setQ(p.name);
  };

  return (
    <div className="relative">
      <label htmlFor="locate" className="sr-only">Onde fica um produto?</label>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} aria-hidden="true" />
      <input
        id="locate"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Onde fica? Digite um produto (ex.: detergente)"
        autoComplete="off"
        className={`h-12 w-full rounded-xl pl-9 pr-3 text-sm ${FOCUS}`}
        style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }}
      />
      {open && results && (
        <ul className="absolute z-20 mt-1 max-h-80 w-full overflow-y-auto rounded-xl p-1 shadow-lg" style={{ background: 'var(--surface-base)', border: '1px solid var(--border-soft)' }}>
          {results.length === 0 ? (
            <li className="px-3 py-3 text-sm" style={{ color: 'var(--text-muted)' }}>Nenhum produto vendido com esse nome nos últimos 90 dias.</li>
          ) : results.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => pick(p)} className={`flex min-h-[48px] w-full items-center gap-3 rounded-lg px-2 text-left transition hover:bg-[var(--surface-soft)] ${FOCUS}`}>
                <span className="h-9 w-9 shrink-0 overflow-hidden rounded-lg" style={{ background: 'var(--surface-soft)' }}>
                  <ProductImage src={p.imageUrl} alt="" className="h-full w-full object-contain" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{p.name}</span>
                  <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>{p.departmentLabel}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

// ── Calor ──────────────────────────────────────────────────────────────────

const HeatLegend: React.FC = () => (
  <div className="flex items-center gap-2 px-2 pb-1 pt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
    <span>Vende menos</span>
    <span aria-hidden="true" className="h-2.5 flex-1 rounded-full" style={{ background: 'linear-gradient(90deg, rgb(219,234,254), rgb(253,230,138), rgb(248,113,113), rgb(220,38,38))' }} />
    <span>Vende mais</span>
  </div>
);

const HeatPanel: React.FC<{
  plan: StorePlan; report: DepartmentsReport | null; heat: Record<string, number>;
  selectedId: string | null; onSelect: (id: string | null) => void;
}> = ({ plan, report, heat, selectedId, onSelect }) => {
  const ranked = plan.fixtures.filter((f) => heat[f.id] != null).sort((a, b) => heat[b.id] - heat[a.id]);
  const max = Math.max(1, ...ranked.map((f) => heat[f.id]));
  const selected = plan.fixtures.find((f) => f.id === selectedId);
  const deptStats = new Map((report?.departments ?? []).map((d) => [d.key, d]));

  if (!report || report.invoices === 0) {
    return <Panel title="Calor de vendas"><p className="text-sm" style={{ color: 'var(--text-muted)' }}>O calor aparece assim que houver vendas dos últimos 30 dias.</p></Panel>;
  }

  return (
    <>
      {selected && heat[selected.id] != null && (
        <Panel title={fixtureName(selected)} action={<button type="button" onClick={() => onSelect(null)} className="text-sm font-semibold" style={{ color: 'var(--brand-700)' }}>Fechar</button>}>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Vendeu cerca de <strong style={{ color: 'var(--text-primary)' }}>{formatMoney(heat[selected.id])}</strong> nos últimos {report.days} dias.
          </p>
          {selected.departments.map((key) => {
            const d = deptStats.get(key);
            if (!d) return <p key={key} className="text-sm" style={{ color: 'var(--text-muted)' }}>{deptLabel(key)}: sem vendas no período.</p>;
            return (
              <div key={key} className="flex flex-col gap-1.5">
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{d.label} · {Math.round(d.revenueShare * 100)}% da loja · em {Math.round(d.basketShare * 100)}% das compras</p>
                <ul className="flex flex-col">
                  {d.topProducts.slice(0, 5).map((p) => (
                    <li key={p.id} className="flex items-center gap-2 py-1 text-sm">
                      <span className="h-8 w-8 shrink-0 overflow-hidden rounded" style={{ background: 'var(--surface-soft)' }}><ProductImage src={p.imageUrl} alt="" className="h-full w-full object-contain" /></span>
                      <span className="min-w-0 flex-1 truncate" style={{ color: 'var(--text-primary)' }}>{p.name}</span>
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{formatMoney(p.revenue)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </Panel>
      )}
      <Panel title="Onde a loja mais vende">
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Últimos {report.days} dias. Quando um setor está em mais de um móvel, a venda é dividida entre eles.</p>
        <ol className="flex flex-col gap-1">
          {ranked.map((f, i) => (
            <li key={f.id}>
              <button type="button" onClick={() => onSelect(f.id)} aria-pressed={selectedId === f.id}
                className={`flex min-h-[44px] w-full flex-col justify-center gap-1 rounded-lg px-2 py-1 text-left transition hover:bg-[var(--surface-soft)] ${FOCUS}`}>
                <span className="flex w-full items-center gap-2 text-sm">
                  <span className="w-5 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate" style={{ color: 'var(--text-primary)' }}>{fixtureName(f)} <span style={{ color: 'var(--text-muted)' }}>· {f.departments.map(deptLabel).join(', ')}</span></span>
                  <span className="shrink-0 font-semibold" style={{ color: 'var(--text-primary)' }}>{compactMoney(heat[f.id])}</span>
                </span>
                <span aria-hidden="true" className="ml-7 h-1.5 rounded-full" style={{ width: `calc(${Math.max(4, (heat[f.id] / max) * 100)}% - 1.75rem)`, background: 'var(--brand-500)' }} />
              </button>
            </li>
          ))}
        </ol>
      </Panel>
    </>
  );
};

// ── Sugestões ──────────────────────────────────────────────────────────────

const InsightsPanel: React.FC<{
  insights: StoreInsight[] | null;
  onShow: (i: StoreInsight) => void;
  onFix: (i: StoreInsight) => void;
}> = ({ insights, onShow, onFix }) => {
  if (insights === null) {
    return <Panel title="Sugestões"><div className="h-24 animate-pulse rounded-xl" style={{ background: 'var(--surface-muted)' }} aria-hidden="true" /><span className="sr-only">Calculando sugestões</span></Panel>;
  }
  if (insights.length === 0) {
    return (
      <Panel title="Sugestões">
        <p className="flex items-start gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--brand-700)' }} aria-hidden="true" />
          Nada a mudar agora. As sugestões usam o que o cliente leva junto em cada compra e voltam a ser calculadas a cada alteração no mapa.
        </p>
      </Panel>
    );
  }
  return (
    <Panel title="Sugestões para a loja vender mais">
      <ul className="flex flex-col gap-2">
        {insights.map((ins, i) => {
          const Icon = INSIGHT_ICON[ins.kind] ?? AlertTriangle;
          return (
            <li key={`${ins.kind}-${i}`} className="flex flex-col gap-2 rounded-xl p-3" style={{ border: '1px solid var(--border-soft)', background: ins.priority >= 60 ? 'var(--surface-soft)' : 'var(--surface-base)' }}>
              <p className="flex items-start gap-2 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                <Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: ins.priority >= 60 ? '#b45309' : 'var(--brand-700)' }} aria-hidden="true" />
                {ins.title}
              </p>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{ins.text}</p>
              <div className="flex flex-wrap gap-2">
                {ins.fixtureIds.length > 0 && (
                  <button type="button" onClick={() => onShow(ins)} className={`inline-flex min-h-[40px] items-center rounded-lg px-3 text-sm font-semibold ${FOCUS}`} style={{ border: '1px solid var(--border-strong)', color: 'var(--text-primary)' }}>
                    Ver no mapa
                  </button>
                )}
                {(ins.kind === 'COLD' || ins.kind === 'EMPTY' || ins.kind === 'MAGNET' || ins.kind === 'SLOW_SPOT' || ins.kind === 'PLACE') && (
                  <button type="button" onClick={() => onFix(ins)} className={`inline-flex min-h-[40px] items-center rounded-lg px-3 text-sm font-semibold text-white ${FOCUS}`} style={{ background: 'var(--brand-700)' }}>
                    Ajustar
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
};

export default StoreMap;
