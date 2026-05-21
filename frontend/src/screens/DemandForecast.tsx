import React, { useEffect, useMemo, useState } from 'react';
import Layout from '../components/layout/Layout';
import Button from '../components/common/Button';
import { marketService } from '../services/market.service';
import { useAuth } from '../context/AuthContext';
import { Minus, Plus, RefreshCw, TrendingUp, TrendingDown, Minus as Minus2 } from 'lucide-react';

interface ForecastRow {
  forecastDate: string;
  productId: string;
  productName: string;
  predictedQuantity: number;
  confidenceLow?: number;
  confidenceHigh?: number;
  trendDirection?: 'UP' | 'DOWN' | 'STABLE';
}

const TrendIcon: React.FC<{ direction?: string }> = ({ direction }) => {
  if (direction === 'UP') return <TrendingUp className="h-3.5 w-3.5 text-green-500" />;
  if (direction === 'DOWN') return <TrendingDown className="h-3.5 w-3.5 text-red-400" />;
  return <Minus2 className="h-3.5 w-3.5" style={{ color: 'var(--text-soft)' }} />;
};

const DemandForecast: React.FC = () => {
  const { marketId } = useAuth();
  const [days, setDays] = useState(14);
  const [rows, setRows] = useState<ForecastRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!marketId) return;
    setLoading(true);
    try {
      const data = await marketService.getDemandForecast(marketId, days);
      setRows((data || []).sort((a: ForecastRow, b: ForecastRow) => Number(b.predictedQuantity || 0) - Number(a.predictedQuantity || 0)));
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Erro ao carregar previsão');
      setRows([]);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [marketId, days]);

  const totalPredicted = useMemo(() => rows.reduce((s, r) => s + Number(r.predictedQuantity || 0), 0), [rows]);
  const maxQty = useMemo(() => Math.max(...rows.map((r) => Number(r.predictedQuantity || 0)), 1), [rows]);

  const grouped = useMemo(() => {
    const map = new Map<string, ForecastRow[]>();
    rows.forEach((r) => {
      if (!map.has(r.forecastDate)) map.set(r.forecastDate, []);
      map.get(r.forecastDate)!.push(r);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [rows]);

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Previsão de vendas</h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Antecipe a demanda dos próximos dias</p>
          </div>
          <div className="flex items-center gap-2">
            <div
              className="flex items-center gap-1 rounded-lg"
              style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)' }}
            >
              <button
                type="button"
                onClick={() => setDays((d) => Math.max(1, d - 1))}
                className="px-2 py-1.5 transition"
                style={{ color: 'var(--text-muted)' }}
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="min-w-[3ch] text-center text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{days}</span>
              <button
                type="button"
                onClick={() => setDays((d) => Math.min(30, d + 1))}
                className="px-2 py-1.5 transition"
                style={{ color: 'var(--text-muted)' }}
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>dias</span>
            <Button variant="secondary" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { label: 'Produtos previstos', value: rows.length, color: 'var(--text-primary)' },
            { label: 'Volume estimado', value: `${totalPredicted.toFixed(0)} un`, color: 'var(--text-primary)' },
            {
              label: 'Maior demanda',
              value: rows[0] ? `${Number(rows[0].predictedQuantity).toFixed(0)} un` : '—',
              color: 'var(--brand-700)',
              sub: rows[0]?.productName,
            },
          ].map((kpi) => (
            <div key={kpi.label} className="rounded-xl p-4" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}>
              <span className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{kpi.label}</span>
              <p className="mt-1 text-2xl font-bold" style={{ color: kpi.color }}>{kpi.value}</p>
              {'sub' in kpi && kpi.sub && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{kpi.sub}</p>}
            </div>
          ))}
        </div>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}

        {/* Forecast */}
        {loading ? (
          <div className="flex min-h-[200px] items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl p-8 text-center" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}>
            <p style={{ color: 'var(--text-muted)' }}>Nenhuma previsão disponível.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {grouped.map(([date, items]) => (
              <div key={date}>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  <span
                    className="rounded px-2 py-0.5 text-xs"
                    style={{ background: 'var(--surface-muted)', color: 'var(--text-muted)' }}
                  >
                    {new Date(date).toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })}
                  </span>
                  <span className="text-xs font-normal" style={{ color: 'var(--text-soft)' }}>{items.length} produtos</span>
                </h3>
                <div className="flex flex-col gap-2">
                  {items.map((row, idx) => {
                    const pct = (Number(row.predictedQuantity || 0) / maxQty) * 100;
                    return (
                      <div
                        key={`${row.productId}-${idx}`}
                        className="flex items-center gap-3 rounded-lg p-3"
                        style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}
                      >
                        <span
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                          style={{ background: 'var(--surface-muted)', color: 'var(--text-soft)' }}
                        >
                          {idx + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="truncate text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{row.productName || row.productId}</p>
                            <TrendIcon direction={row.trendDirection} />
                          </div>
                          <div className="mt-1 h-2 w-full overflow-hidden rounded-full" style={{ background: 'var(--surface-muted)' }}>
                            <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${Math.max(pct, 2)}%` }} />
                          </div>
                          {row.confidenceLow != null && row.confidenceHigh != null && (
                            <p className="mt-0.5 text-[11px]" style={{ color: 'var(--text-soft)' }}>
                              Intervalo: {Number(row.confidenceLow).toFixed(0)}–{Number(row.confidenceHigh).toFixed(0)} un
                            </p>
                          )}
                        </div>
                        <span className="shrink-0 text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                          {Number(row.predictedQuantity || 0).toFixed(0)} un
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default DemandForecast;
