import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Coins,
  Info,
  Package,
  RefreshCw,
  Snowflake,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import ProductImage from '../product/ProductImage';
import workingCapitalService, {
  CapitalStatus,
  PurchaseLine,
  PurchasePlan,
} from '../../services/workingCapital.service';

/**
 * Plano de capital de giro.
 *
 * Responde à pergunta central do supermercadista: com o dinheiro que tenho,
 * o que comprar para faturar mais — e onde meu capital está preso hoje.
 */

const fmtMoney = (v?: number | null) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v || 0));

const fmtNumber = (v?: number | null, digits = 1) =>
  new Intl.NumberFormat('pt-BR', { maximumFractionDigits: digits }).format(Number(v || 0));

const STATUS_META: Record<CapitalStatus, { label: string; color: string; bg: string; hint: string }> = {
  INVEST: {
    label: 'Investir',
    color: '#15803d',
    bg: '#dcfce7',
    hint: 'Gira bem e devolve o capital rápido',
  },
  MANTER: {
    label: 'Manter',
    color: '#1d4ed8',
    bg: '#dbeafe',
    hint: 'Dentro do esperado, siga o ciclo atual',
  },
  REDUZIR: {
    label: 'Reduzir',
    color: '#b45309',
    bg: '#fef3c7',
    hint: 'Capital exposto além do giro',
  },
  LIQUIDAR: {
    label: 'Liquidar',
    color: '#b91c1c',
    bg: '#fee2e2',
    hint: 'Parado na prateleira, libere o caixa',
  },
};

const StatusBadge: React.FC<{ status: CapitalStatus }> = ({ status }) => {
  const meta = STATUS_META[status];
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap"
      style={{ background: meta.bg, color: meta.color }}
      title={meta.hint}
    >
      {meta.label}
    </span>
  );
};

const StatTile: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone?: 'neutral' | 'good' | 'warn';
}> = ({ icon, label, value, hint, tone = 'neutral' }) => {
  const toneColor =
    tone === 'good' ? 'var(--brand-600, #16a34a)' : tone === 'warn' ? '#b45309' : 'var(--text-primary)';
  return (
    <div
      className="flex flex-col gap-1 rounded-xl p-4"
      style={{ background: 'var(--surface-base)', border: '1px solid var(--border-soft)' }}
    >
      <div className="flex items-center gap-2 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
        {icon}
        {label}
      </div>
      <div className="text-xl font-bold" style={{ color: toneColor }}>
        {value}
      </div>
      {hint && (
        <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
          {hint}
        </div>
      )}
    </div>
  );
};

/** Marca números derivados do estoque estimado, que é aproximado por construção. */
const ConfidenceMark: React.FC<{ confidence?: number | null }> = ({ confidence }) => {
  const value = Number(confidence || 0);
  if (value >= 0.6) return null;
  const label = value <= 0 ? 'Sem compras registradas' : 'Estoque estimado com baixa confiança';
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px]"
      style={{ color: '#b45309' }}
      title={`${label}. Registre as compras para melhorar a precisão.`}
    >
      <Info size={11} />
      estimado
    </span>
  );
};

const LineRow: React.FC<{ line: PurchaseLine; showUnits?: boolean }> = ({ line, showUnits = true }) => (
  <div
    className="flex items-start gap-3 rounded-xl p-3"
    style={{ background: 'var(--surface-base)', border: '1px solid var(--border-soft)' }}
  >
    <ProductImage src={line.imageUrl} alt={line.name} className="h-12 w-12 shrink-0 rounded-lg" />

    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="truncate text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          {line.name}
        </span>
        <StatusBadge status={line.capitalStatus} />
        <span
          className="rounded px-1.5 py-0.5 text-[10px] font-bold"
          style={{ background: 'var(--surface-soft)', color: 'var(--text-muted)' }}
          title="Curva ABC (peso na receita) e XYZ (previsibilidade da demanda)"
        >
          {line.abcClass}
          {line.xyzClass}
        </span>
        <ConfidenceMark confidence={line.inventoryConfidence} />
      </div>

      <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        {line.reason}
      </p>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
        {line.gmroi != null && (
          <span title="Margem bruta por real investido no estoque">
            GMROI <strong style={{ color: 'var(--text-primary)' }}>{fmtNumber(line.gmroi, 2)}</strong>
          </span>
        )}
        {line.marginPercent != null && <span>Margem {fmtNumber(line.marginPercent, 1)}%</span>}
        {line.dailyVelocity != null && <span>{fmtNumber(line.dailyVelocity, 2)} un./dia</span>}
        {line.coverageDays != null && <span>{fmtNumber(line.coverageDays, 0)} dias de estoque</span>}
      </div>
    </div>

    <div className="shrink-0 text-right">
      {showUnits && (
        <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
          {fmtNumber(line.units, 0)} un.
        </div>
      )}
      <div className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
        {fmtMoney(line.value)}
      </div>
    </div>
  </div>
);

interface CapitalPlanTabProps {
  marketId: string;
  /**
   * Permite jogar um item recomendado direto na lista de compras.
   * O retorno é ignorado: aceita handlers síncronos e assíncronos.
   */
  onAddToList?: (productId: string, units: number, reason: string) => void | Promise<unknown>;
}

const CapitalPlanTab: React.FC<CapitalPlanTabProps> = ({ marketId, onAddToList }) => {
  const [budgetInput, setBudgetInput] = useState('');
  const [appliedBudget, setAppliedBudget] = useState<number | null>(null);
  const [plan, setPlan] = useState<PurchasePlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (budget: number | null) => {
      setLoading(true);
      setError(null);
      try {
        const result = await workingCapitalService.getPurchasePlan(marketId, budget);
        setPlan(result);
      } catch (err: any) {
        setError(err?.message || 'Não foi possível calcular o plano de compra.');
        setPlan(null);
      } finally {
        setLoading(false);
      }
    },
    [marketId],
  );

  useEffect(() => {
    void load(null);
  }, [load]);

  const applyBudget = () => {
    const parsed = Number(budgetInput.replace(/\./g, '').replace(',', '.'));
    const budget = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    setAppliedBudget(budget);
    void load(budget);
  };

  const summary = plan?.summary;

  const coverageText = useMemo(() => {
    if (!plan || !plan.totalNeededValue) return null;
    if (!appliedBudget) return null;
    const pct = Math.min(100, (plan.allocatedValue / plan.totalNeededValue) * 100);
    return `${fmtNumber(pct, 0)}% da reposição ideal`;
  }, [plan, appliedBudget]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm" style={{ color: 'var(--text-muted)' }}>
        <RefreshCw size={16} className="animate-spin" />
        Analisando o giro e o capital do seu portfólio...
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="flex items-start gap-3 rounded-xl p-4"
        style={{ background: '#fef2f2', border: '1px solid #fecaca' }}
      >
        <AlertTriangle size={18} style={{ color: '#b91c1c' }} />
        <div>
          <p className="text-sm font-semibold" style={{ color: '#991b1b' }}>
            {error}
          </p>
          <button
            type="button"
            onClick={() => load(appliedBudget)}
            className="mt-2 text-xs font-semibold underline"
            style={{ color: '#b91c1c' }}
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  if (!plan || summary?.productCount === 0) {
    return (
      <div
        className="rounded-xl p-6 text-center text-sm"
        style={{ background: 'var(--surface-soft)', color: 'var(--text-muted)' }}
      >
        Ainda não há vendas suficientes para analisar o capital de giro. Assim que o agente enviar
        as primeiras notas, esta tela mostra onde investir.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Resumo do portfólio */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          icon={<Package size={13} />}
          label="Capital em estoque"
          value={fmtMoney(summary?.totalInventoryValue)}
          hint={`${summary?.productCount ?? 0} produtos analisados`}
        />
        <StatTile
          icon={<Snowflake size={13} />}
          label="Capital parado"
          value={fmtMoney(summary?.frozenCapital)}
          hint={`${fmtNumber(summary?.frozenCapitalPercent, 1)}% do estoque`}
          tone={Number(summary?.frozenCapitalPercent || 0) > 25 ? 'warn' : 'neutral'}
        />
        <StatTile
          icon={<Coins size={13} />}
          label="GMROI do portfólio"
          value={summary?.portfolioGmroi != null ? fmtNumber(summary.portfolioGmroi, 2) : '—'}
          hint="Margem por R$ 1 investido"
          tone={Number(summary?.portfolioGmroi || 0) >= 2 ? 'good' : 'neutral'}
        />
        <StatTile
          icon={<TrendingUp size={13} />}
          label="Repor para o ideal"
          value={fmtMoney(plan.totalNeededValue)}
          hint={`${plan.selected.length} itens sugeridos`}
        />
      </div>

      {/* Simulador de orçamento */}
      <div
        className="rounded-xl p-4"
        style={{ background: 'var(--surface-base)', border: '1px solid var(--border-soft)' }}
      >
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1" style={{ minWidth: '220px' }}>
            <label className="mb-1 block text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
              <Wallet size={13} className="mr-1 inline" />
              Quanto você tem para comprar?
            </label>
            <input
              value={budgetInput}
              onChange={(e) => setBudgetInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && applyBudget()}
              placeholder="Ex.: 5.000,00"
              inputMode="decimal"
              className="w-full rounded-lg px-3 py-2 text-sm"
              style={{
                border: '1px solid var(--border-strong)',
                background: 'var(--surface-base)',
                color: 'var(--text-primary)',
              }}
            />
          </div>
          <button
            type="button"
            onClick={applyBudget}
            className="rounded-lg px-4 py-2 text-sm font-semibold"
            style={{ background: 'var(--brand-500, #22c55e)', color: '#fff' }}
          >
            Calcular plano
          </button>
          {appliedBudget != null && (
            <button
              type="button"
              onClick={() => {
                setBudgetInput('');
                setAppliedBudget(null);
                void load(null);
              }}
              className="rounded-lg px-3 py-2 text-xs font-medium"
              style={{ color: 'var(--text-muted)' }}
            >
              Limpar
            </button>
          )}
        </div>

        {appliedBudget != null && (
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs" style={{ color: 'var(--text-muted)' }}>
            <span>
              Alocado{' '}
              <strong style={{ color: 'var(--text-primary)' }}>{fmtMoney(plan.allocatedValue)}</strong>
            </span>
            {plan.remainingBudget != null && <span>Sobra {fmtMoney(plan.remainingBudget)}</span>}
            {plan.expectedMargin > 0 && (
              <span>
                Margem esperada{' '}
                <strong style={{ color: 'var(--brand-600, #16a34a)' }}>
                  {fmtMoney(plan.expectedMargin)}
                </strong>
                {plan.expectedReturnPercent != null &&
                  ` (${fmtNumber(plan.expectedReturnPercent, 1)}% sobre o investido)`}
              </span>
            )}
            {coverageText && <span>{coverageText}</span>}
          </div>
        )}
      </div>

      {/* Onde investir */}
      <section>
        <header className="mb-2 flex items-center gap-2">
          <TrendingUp size={16} style={{ color: 'var(--brand-600, #16a34a)' }} />
          <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
            Onde investir agora
          </h2>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            ordenado pelo retorno de cada real
          </span>
        </header>

        {plan.selected.length === 0 ? (
          <p className="rounded-xl p-4 text-sm" style={{ background: 'var(--surface-soft)', color: 'var(--text-muted)' }}>
            Nenhuma reposição necessária no momento — o estoque estimado cobre o giro atual.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {plan.selected.slice(0, 30).map((line) => (
              <div key={line.productId} className="flex items-stretch gap-2">
                <div className="flex-1">
                  <LineRow line={line} />
                </div>
                {onAddToList && (
                  <button
                    type="button"
                    onClick={() => onAddToList(line.productId, line.units, line.reason)}
                    title="Adicionar à lista de compras"
                    className="flex shrink-0 items-center gap-1 rounded-xl px-3 text-xs font-semibold"
                    style={{
                      background: 'var(--surface-soft)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-soft)',
                    }}
                  >
                    Adicionar
                    <ArrowRight size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Fora do orçamento */}
      {plan.deferred.length > 0 && (
        <section>
          <header className="mb-2 flex items-center gap-2">
            <Info size={16} style={{ color: 'var(--text-muted)' }} />
            <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
              Ficou fora deste orçamento
            </h2>
          </header>
          <div className="flex flex-col gap-2">
            {plan.deferred.slice(0, 10).map((line) => (
              <LineRow key={line.productId} line={line} />
            ))}
          </div>
        </section>
      )}

      {/* Capital parado */}
      {plan.frozen.length > 0 && (
        <section>
          <header className="mb-2 flex items-center gap-2">
            <TrendingDown size={16} style={{ color: '#b91c1c' }} />
            <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
              Capital parado na prateleira
            </h2>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {fmtMoney(plan.frozenCapital)} a liberar
            </span>
          </header>
          <div className="flex flex-col gap-2">
            {plan.frozen.slice(0, 20).map((line) => (
              <LineRow key={line.productId} line={line} showUnits />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default CapitalPlanTab;
