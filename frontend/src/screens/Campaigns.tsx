import React, { useEffect, useMemo, useState } from 'react';
import Layout from '../components/layout/Layout';
import Button from '../components/common/Button';
import { marketService } from '../services/market.service';
import { useAuth } from '../context/AuthContext';
import { CampaignImpact } from '../types/analytics.types';
import { Plus, Calendar, TrendingUp, RefreshCw } from 'lucide-react';

interface CampaignItem {
  id: string;
  name: string;
  description?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  createdAt?: string | null;
}

const formatMoney = (v?: number | null) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v || 0));
const formatDate = (v?: string | null) => (v ? new Date(v).toLocaleDateString('pt-BR') : '—');

const inputCls = 'h-10 rounded-lg px-3 text-sm outline-none transition focus:ring-2 focus:ring-green-500/20';
const inputStyle = {
  border: '1px solid var(--border-strong)',
  background: 'var(--surface-base)',
  color: 'var(--text-primary)',
  ['--tw-ring-color' as any]: 'var(--brand-500)',
} as React.CSSProperties;

const Campaigns: React.FC = () => {
  const { marketId } = useAuth();
  const [items, setItems] = useState<CampaignItem[]>([]);
  const [impacts, setImpacts] = useState<CampaignImpact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const bestImpact = useMemo(() => [...impacts].sort((a, b) => Number(b.revenueLiftPercent || 0) - Number(a.revenueLiftPercent || 0))[0], [impacts]);

  const load = async () => {
    if (!marketId) return;
    setLoading(true);
    try {
      const [campaigns, impactRows] = await Promise.all([marketService.getCampaigns(marketId), marketService.getCampaignImpact(marketId)]);
      setItems(campaigns || []);
      setImpacts(impactRows || []);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Erro ao carregar promoções');
      setItems([]);
      setImpacts([]);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [marketId]);

  const create = async () => {
    if (!marketId || !name.trim()) { setError('Informe o nome da promoção'); return; }
    await marketService.createCampaign(marketId, {
      name: name.trim(),
      description: description.trim() || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    });
    setName(''); setDescription(''); setStartDate(''); setEndDate(''); setShowForm(false);
    await load();
  };

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Promoções</h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Crie ações e veja o resultado real</p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
            </Button>
            <Button onClick={() => setShowForm(!showForm)}>
              <Plus className="h-4 w-4" /> Nova promoção
            </Button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { label: 'Promoções', value: items.length, color: 'var(--text-primary)' },
            { label: 'Com resultado', value: impacts.length, color: 'var(--text-primary)' },
            { label: 'Melhor resultado', value: bestImpact ? `+${Number(bestImpact.revenueLiftPercent || 0).toFixed(1)}%` : '—', color: 'var(--brand-700)' },
          ].map((kpi) => (
            <div key={kpi.label} className="rounded-xl p-4" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}>
              <span className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{kpi.label}</span>
              <p className="mt-1 text-2xl font-bold" style={{ color: kpi.color }}>{kpi.value}</p>
            </div>
          ))}
        </div>

        {/* Create form */}
        {showForm && (
          <div className="rounded-xl p-5" style={{ border: '1px solid var(--border-success)', background: 'var(--surface-success)' }}>
            <h3 className="mb-3 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Nova promoção</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <input className={inputCls} style={inputStyle} placeholder="Nome da promoção" value={name} onChange={(e) => setName(e.target.value)} />
              <input className={inputCls} style={inputStyle} placeholder="Descrição (opcional)" value={description} onChange={(e) => setDescription(e.target.value)} />
              <div className="flex flex-col gap-1">
                <label className="text-xs" style={{ color: 'var(--text-muted)' }}>Data início</label>
                <input type="date" className={inputCls} style={inputStyle} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs" style={{ color: 'var(--text-muted)' }}>Data fim</label>
                <input type="date" className={inputCls} style={inputStyle} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <Button onClick={create}>Criar promoção</Button>
              <Button variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>
        )}

        {/* Campaign list */}
        {loading ? (
          <div className="flex min-h-[200px] items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {items.length === 0 ? (
              <div className="rounded-xl p-8 text-center" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}>
                <p style={{ color: 'var(--text-muted)' }}>Nenhuma promoção cadastrada. Crie a primeira!</p>
              </div>
            ) : (
              items.map((campaign) => {
                const impact = impacts.find((i) => i.campaignId === campaign.id);
                const lift = Number(impact?.revenueLiftPercent || 0);
                return (
                  <article key={campaign.id} className="rounded-xl p-5" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{campaign.name}</h3>
                        {campaign.description && (
                          <p className="mt-0.5 text-sm" style={{ color: 'var(--text-muted)' }}>{campaign.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4" style={{ color: 'var(--text-soft)' }} />
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{formatDate(campaign.startDate)} — {formatDate(campaign.endDate)}</span>
                      </div>
                    </div>
                    {impact && (
                      <div className="mt-4 grid gap-3 sm:grid-cols-4">
                        <div className="rounded-lg p-3" style={{ background: 'var(--surface-soft)' }}>
                          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Antes</span>
                          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{formatMoney(impact.beforeRevenue)}</p>
                        </div>
                        <div className="rounded-lg p-3" style={{ background: 'var(--surface-success)' }}>
                          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Durante</span>
                          <p className="text-sm font-semibold" style={{ color: 'var(--brand-700)' }}>{formatMoney(impact.duringRevenue)}</p>
                        </div>
                        <div className="rounded-lg p-3" style={{ background: 'var(--surface-soft)' }}>
                          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Depois</span>
                          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{formatMoney(impact.afterRevenue)}</p>
                        </div>
                        <div
                          className="rounded-lg p-3"
                          style={{ background: lift > 0 ? 'var(--surface-success)' : lift < 0 ? 'var(--surface-danger)' : 'var(--surface-soft)' }}
                        >
                          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Resultado</span>
                          <div className="flex items-center gap-1">
                            <TrendingUp className={`h-4 w-4 ${lift > 0 ? 'text-green-600' : 'text-red-500'}`} />
                            <p className={`text-sm font-bold ${lift > 0 ? 'text-green-700' : 'text-red-600'}`}>
                              {lift > 0 ? '+' : ''}{lift.toFixed(1)}% vendas
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })
            )}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Campaigns;
