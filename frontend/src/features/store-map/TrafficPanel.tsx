import React, { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Download, KeyRound, ShieldCheck } from 'lucide-react';
import { storeMapService } from '../../services/storeMap.service';
import type { StorePlan, StoreTraffic } from '../../types/storeMap.types';
import { FIXTURES, fixtureName } from './model';

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-700)]';
const INSTALLER = 'https://mercadoflow.com/api/v1/downloads/cameras-installer';
const PERIODS = [[7, '7 dias'], [30, '30 dias'], [90, '90 dias']] as const;
const HOURS = [['Dia todo', 0, 23], ['Manhã', 6, 11], ['Tarde', 12, 17], ['Noite', 18, 23]] as const;

export interface TrafficState {
  data: StoreTraffic | null;
  loading: boolean;
  days: number;
  setDays: (d: number) => void;
  hours: number;
  setHours: (i: number) => void;
  layer: { size: number; max: number; cells: StoreTraffic['cells'] } | null;
}

/** Busca o movimento só quando a aba está aberta. */
export function useTraffic(marketId: string | null | undefined, active: boolean): TrafficState {
  const [data, setData] = useState<StoreTraffic | null>(null);
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState(30);
  const [hours, setHours] = useState(0);
  useEffect(() => {
    if (!active || !marketId) return undefined;
    let cancelled = false;
    setLoading(true);
    storeMapService.getTraffic(marketId, days, HOURS[hours][1], HOURS[hours][2])
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [marketId, active, days, hours]);
  const layer = useMemo(() => (data?.cells.length
    ? { size: data.cellSize, max: Math.max(...data.cells.map((c) => c.seconds)), cells: data.cells }
    : null), [data]);
  return { data, loading, days, setDays, hours, setHours, layer };
}

/** Presença ao redor de cada móvel (até 1 m da borda), do mais movimentado ao menos. */
export function rankFixtures(plan: StorePlan, data: StoreTraffic) {
  const reach = 1;
  return plan.fixtures
    .filter((f) => !FIXTURES[f.type].noProducts)
    .map((f) => {
      let seconds = 0;
      for (const c of data.cells) {
        const x = (c.x + 0.5) * data.cellSize;
        const y = (c.y + 0.5) * data.cellSize;
        if (x >= f.x - reach && x <= f.x + f.w + reach && y >= f.y - reach && y <= f.y + f.h + reach) seconds += c.seconds;
      }
      return { f, seconds };
    })
    .filter((r) => r.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds);
}

const Chip: React.FC<{ on: boolean; onClick: () => void; children: React.ReactNode }> = ({ on, onClick, children }) => (
  <button type="button" aria-pressed={on} onClick={onClick} className={`min-h-[40px] rounded-full px-3 text-sm ${FOCUS}`}
    style={on ? { background: 'var(--brand-700)', color: '#fff' } : { border: '1px solid var(--border-soft)', color: 'var(--text-primary)' }}>
    {children}
  </button>
);

/** Passos para ligar as câmeras: baixar o app e gerar a chave. */
const Setup: React.FC<{ marketId: string }> = ({ marketId }) => {
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const create = async () => {
    setBusy(true); setError(null);
    try {
      setKey(await storeMapService.createCameraKey(marketId));
    } catch {
      setError('Não foi possível gerar a chave. Só o dono ou o gerente da loja pode gerar.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <ol className="flex flex-col gap-3 text-sm" style={{ color: 'var(--text-primary)' }}>
      <li className="flex flex-col gap-2">
        <span><strong>1.</strong> No computador da loja que enxerga as câmeras (Windows 10 ou 11), instale o app.</span>
        <a href={INSTALLER} className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-3 font-semibold text-white ${FOCUS}`} style={{ background: 'var(--brand-700)' }}>
          <Download className="h-4 w-4" aria-hidden="true" /> Baixar MercadoFlow Câmeras
        </a>
      </li>
      <li className="flex flex-col gap-2">
        <span><strong>2.</strong> Gere a chave da loja e cole no app.</span>
        {key ? (
          <>
            <code className="break-all rounded-lg p-2 text-xs" style={{ background: 'var(--surface-soft)' }}>{key}</code>
            <button type="button" onClick={() => { void navigator.clipboard?.writeText(key); setCopied(true); }}
              className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-3 font-semibold ${FOCUS}`} style={{ border: '1px solid var(--border-strong)' }}>
              {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />} {copied ? 'Copiada' : 'Copiar a chave'}
            </button>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Ela só aparece agora. Guarde até colar no app.</span>
          </>
        ) : (
          <button type="button" onClick={create} disabled={busy} className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-3 font-semibold disabled:opacity-50 ${FOCUS}`} style={{ border: '1px solid var(--border-strong)' }}>
            <KeyRound className="h-4 w-4" aria-hidden="true" /> {busy ? 'Gerando…' : 'Gerar a chave'}
          </button>
        )}
        {error && <span role="alert" style={{ color: '#b91c1c' }}>{error}</span>}
      </li>
      <li><strong>3.</strong> No app, cadastre cada câmera e marque 4 pontos do piso na imagem e na planta. O calor começa a aparecer aqui em minutos.</li>
    </ol>
  );
};

const Box: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="flex flex-col gap-3 rounded-2xl p-4" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}>
    <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h2>
    {children}
  </section>
);

const TrafficPanel: React.FC<{ marketId: string; plan: StorePlan; state: TrafficState; onShow: (ids: string[], note: string) => void }> = ({ marketId, plan, state, onShow }) => {
  const { data, loading, days, setDays, hours, setHours } = state;
  const ranked = useMemo(() => (data ? rankFixtures(plan, data) : []), [plan, data]);
  const hasData = !!data && (data.cameras > 0 || data.cells.length > 0);
  const maxHour = Math.max(1, ...(data?.byHour ?? [1]));
  const top = ranked[0]?.seconds ?? 1;

  return (
    <>
      <Box title="Movimento da loja">
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Onde as pessoas passam e param, medido pelas câmeras da própria loja.</p>
        <p className="flex items-start gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--brand-700)' }} aria-hidden="true" />
          As imagens ficam no computador da loja. Só chegam aqui números: tempo de presença em cada ponto do piso. Mantenha o aviso de câmeras visível na loja.
        </p>
        {hasData && (
          <>
            <div className="flex flex-wrap gap-1.5">{PERIODS.map(([d, l]) => <Chip key={d} on={days === d} onClick={() => setDays(d)}>{l}</Chip>)}</div>
            <div className="flex flex-wrap gap-1.5">{HOURS.map(([l], i) => <Chip key={l} on={hours === i} onClick={() => setHours(i)}>{l}</Chip>)}</div>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {data!.cameras} {data!.cameras === 1 ? 'câmera' : 'câmeras'}{data!.lastAt ? ` · último envio em ${new Date(data!.lastAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}` : ''}
            </p>
            {data!.cells.length === 0 && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Nenhum movimento neste período e horário.</p>}
          </>
        )}
        {!hasData && loading && <p role="status" className="text-sm" style={{ color: 'var(--text-muted)' }}>Carregando…</p>}
      </Box>

      {hasData ? (
        <>
          <Box title="Movimento por hora">
            <div className="flex h-20 items-end gap-px" role="img" aria-label={`Hora de maior movimento: ${data!.byHour.indexOf(Math.max(...data!.byHour))} horas`}>
              {data!.byHour.map((v, h) => (
                <span key={h} title={`${h}h`} className="min-w-0 flex-1 rounded-t" style={{ height: `${Math.max(2, (v / maxHour) * 100)}%`, background: 'var(--brand-500)' }} />
              ))}
            </div>
            <div className="flex justify-between text-[11px]" style={{ color: 'var(--text-muted)' }}><span>0h</span><span>12h</span><span>23h</span></div>
          </Box>
          {ranked.length > 0 && (
            <Box title="Móveis com mais gente por perto">
              <ol className="flex flex-col gap-1">
                {ranked.slice(0, 8).map(({ f, seconds }, i) => (
                  <li key={f.id}>
                    <button type="button" onClick={() => onShow([f.id], fixtureName(f))} className={`flex min-h-[44px] w-full flex-col justify-center gap-1 rounded-lg px-2 py-1 text-left hover:bg-[var(--surface-soft)] ${FOCUS}`}>
                      <span className="flex w-full items-center gap-2 text-sm">
                        <span className="w-5 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{i + 1}</span>
                        <span className="min-w-0 flex-1 truncate" style={{ color: 'var(--text-primary)' }}>{fixtureName(f)}</span>
                        <span className="shrink-0 text-xs" style={{ color: 'var(--text-muted)' }}>{Math.round(seconds / 3600).toLocaleString('pt-BR')} h</span>
                      </span>
                      <span aria-hidden="true" className="ml-7 h-1.5 rounded-full" style={{ width: `calc(${Math.max(4, (seconds / top) * 100)}% - 1.75rem)`, background: 'var(--brand-500)' }} />
                    </button>
                  </li>
                ))}
              </ol>
            </Box>
          )}
          <Box title="Outra câmera"><Setup marketId={marketId} /></Box>
        </>
      ) : (
        !loading && <Box title="Ligar as câmeras"><Setup marketId={marketId} /></Box>
      )}
    </>
  );
};

export default TrafficPanel;
