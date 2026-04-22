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
            <h1 className="text-xl font-bold text-gray-900">Promoções</h1>
            <p className="text-sm text-gray-500">Crie ações e veja o resultado real</p>
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
          <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <span className="text-xs font-medium uppercase tracking-wider text-gray-500">Promoções</span>
            <p className="mt-1 text-2xl font-bold text-gray-900">{items.length}</p>
          </div>
          <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <span className="text-xs font-medium uppercase tracking-wider text-gray-500">Com resultado</span>
            <p className="mt-1 text-2xl font-bold text-gray-900">{impacts.length}</p>
          </div>
          <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <span className="text-xs font-medium uppercase tracking-wider text-gray-500">Melhor resultado</span>
            <p className="mt-1 text-2xl font-bold text-emerald-600">
              {bestImpact ? `+${Number(bestImpact.revenueLiftPercent || 0).toFixed(1)}%` : '—'}
            </p>
          </div>
        </div>

        {/* Create form */}
        {showForm && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-5">
            <h3 className="mb-3 text-sm font-semibold text-gray-900">Nova promoção</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <input className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-emerald-500" placeholder="Nome da promoção" value={name} onChange={(e) => setName(e.target.value)} />
              <input className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-emerald-500" placeholder="Descrição (opcional)" value={description} onChange={(e) => setDescription(e.target.value)} />
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">Data início</label>
                <input type="date" className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-emerald-500" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">Data fim</label>
                <input type="date" className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-emerald-500" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <Button onClick={create}>Criar promoção</Button>
              <Button variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
            </div>
          </div>
        )}

        {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}

        {/* Campaign list */}
        {loading ? (
          <div className="flex min-h-[200px] items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {items.length === 0 ? (
              <div className="rounded-xl border border-gray-100 bg-white p-8 text-center shadow-sm">
                <p className="text-gray-500">Nenhuma promoção cadastrada. Crie a primeira!</p>
              </div>
            ) : (
              items.map((campaign) => {
                const impact = impacts.find((i) => i.campaignId === campaign.id);
                const lift = Number(impact?.revenueLiftPercent || 0);
                return (
                  <article key={campaign.id} className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-base font-semibold text-gray-900">{campaign.name}</h3>
                        {campaign.description && <p className="mt-0.5 text-sm text-gray-500">{campaign.description}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-gray-400" />
                        <span className="text-xs text-gray-500">{formatDate(campaign.startDate)} — {formatDate(campaign.endDate)}</span>
                      </div>
                    </div>
                    {impact && (
                      <div className="mt-4 grid gap-3 sm:grid-cols-4">
                        <div className="rounded-lg bg-gray-50 p-3">
                          <span className="text-xs text-gray-500">Antes</span>
                          <p className="text-sm font-semibold text-gray-900">{formatMoney(impact.beforeRevenue)}</p>
                        </div>
                        <div className="rounded-lg bg-emerald-50 p-3">
                          <span className="text-xs text-gray-500">Durante</span>
                          <p className="text-sm font-semibold text-emerald-700">{formatMoney(impact.duringRevenue)}</p>
                        </div>
                        <div className="rounded-lg bg-gray-50 p-3">
                          <span className="text-xs text-gray-500">Depois</span>
                          <p className="text-sm font-semibold text-gray-900">{formatMoney(impact.afterRevenue)}</p>
                        </div>
                        <div className={`rounded-lg p-3 ${lift > 0 ? 'bg-emerald-50' : lift < 0 ? 'bg-red-50' : 'bg-gray-50'}`}>
                          <span className="text-xs text-gray-500">Resultado</span>
                          <div className="flex items-center gap-1">
                            <TrendingUp className={`h-4 w-4 ${lift > 0 ? 'text-emerald-600' : 'text-red-500'}`} />
                            <p className={`text-sm font-bold ${lift > 0 ? 'text-emerald-700' : 'text-red-600'}`}>
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
