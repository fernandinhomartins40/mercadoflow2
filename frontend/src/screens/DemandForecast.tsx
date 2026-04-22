import React, { useEffect, useMemo, useState } from 'react';
import Layout from '../components/layout/Layout';
import Button from '../components/common/Button';
import { marketService } from '../services/market.service';
import { useAuth } from '../context/AuthContext';
import { Minus, Plus, RefreshCw } from 'lucide-react';

interface ForecastRow {
  forecastDate: string;
  productId: string;
  productName: string;
  predictedQuantity: number;
}

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

  // Group by date
  const grouped = useMemo(() => {
    const map = new Map<string, ForecastRow[]>();
    rows.forEach((r) => {
      const key = r.forecastDate;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [rows]);

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Previsão de vendas</h1>
            <p className="text-sm text-gray-500">Antecipe a demanda dos próximos dias</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white">
              <button type="button" onClick={() => setDays((d) => Math.max(1, d - 1))} className="px-2 py-1.5 text-gray-500 hover:text-gray-900">
                <Minus className="h-4 w-4" />
              </button>
              <span className="min-w-[3ch] text-center text-sm font-semibold text-gray-900">{days}</span>
              <button type="button" onClick={() => setDays((d) => Math.min(30, d + 1))} className="px-2 py-1.5 text-gray-500 hover:text-gray-900">
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <span className="text-sm text-gray-500">dias</span>
            <Button variant="secondary" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <span className="text-xs font-medium uppercase tracking-wider text-gray-500">Produtos previstos</span>
            <p className="mt-1 text-2xl font-bold text-gray-900">{rows.length}</p>
          </div>
          <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <span className="text-xs font-medium uppercase tracking-wider text-gray-500">Volume estimado</span>
            <p className="mt-1 text-2xl font-bold text-gray-900">{totalPredicted.toFixed(0)} un</p>
          </div>
          <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <span className="text-xs font-medium uppercase tracking-wider text-gray-500">Maior demanda</span>
            <p className="mt-1 text-2xl font-bold text-emerald-600">{rows[0] ? `${Number(rows[0].predictedQuantity).toFixed(0)} un` : '—'}</p>
            {rows[0] && <p className="text-xs text-gray-500">{rows[0].productName}</p>}
          </div>
        </div>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}

        {/* Forecast */}
        {loading ? (
          <div className="flex min-h-[200px] items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-gray-100 bg-white p-8 text-center shadow-sm">
            <p className="text-gray-500">Nenhuma previsão disponível.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {grouped.map(([date, items]) => (
              <div key={date}>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <span className="rounded bg-gray-100 px-2 py-0.5 text-xs">{new Date(date).toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                  <span className="text-xs font-normal text-gray-400">{items.length} produtos</span>
                </h3>
                <div className="flex flex-col gap-2">
                  {items.map((row, idx) => {
                    const pct = (Number(row.predictedQuantity || 0) / maxQty) * 100;
                    return (
                      <div key={`${row.productId}-${idx}`} className="flex items-center gap-3 rounded-lg border border-gray-100 bg-white p-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[10px] font-bold text-gray-500">
                          {idx + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-gray-900">{row.productName || row.productId}</p>
                          <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.max(pct, 2)}%` }} />
                          </div>
                        </div>
                        <span className="shrink-0 text-sm font-bold text-gray-900">{Number(row.predictedQuantity || 0).toFixed(0)} un</span>
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
