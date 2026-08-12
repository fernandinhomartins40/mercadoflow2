import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Percent, Loader2, Lock, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';
import { priceSimulationService, PriceScenario } from '../../services/advanced.service';

/**
 * "Se eu baixar 8%, o que acontece?"
 *
 * A elasticidade já era calculada pelo PromoEffectiveness e nunca usada para
 * recomendar preço. Aqui ela projeta volume, receita e margem.
 *
 * A tela mostra vários descontos LADO A LADO de propósito: comparar 10% contra
 * 20% é o que transforma o número em decisão. Um único cenário deixaria o
 * lojista adivinhando qual pedir.
 *
 * As ressalvas aparecem sempre, nunca escondidas atrás de um "ver mais": o
 * risco deste recurso não é errar a conta, é dar aparência de certeza a uma
 * decisão de margem.
 */

const fmt = {
  money: (v?: number | null) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
      .format(Number(v || 0)),
  pct: (v?: number | null) => {
    if (v == null) return '--';
    const n = Number(v);
    return `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;
  },
};

const toneOf = (v?: number | null) =>
  v == null ? 'var(--text-muted)' : Number(v) >= 0 ? '#15803d' : '#b91c1c';

const PriceSimulator: React.FC<{ marketId: string; productId: string }> = ({
  marketId, productId,
}) => {
  const [scenarios, setScenarios] = useState<PriceScenario[]>([]);
  const [locked, setLocked] = useState<{ mensagem?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | undefined>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await priceSimulationService.simulate(marketId, productId);
      if (res.bloqueadoPorPlano) {
        setLocked({ mensagem: res.mensagem });
        return;
      }
      setLocked(null);
      setScenarios(res.cenarios || []);
      setMessage(res.mensagem);
    } catch {
      setMessage('Não foi possível simular agora.');
    } finally {
      setLoading(false);
    }
  }, [marketId, productId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
        <Loader2 className="h-4 w-4 animate-spin" /> Simulando…
      </div>
    );
  }

  if (locked) {
    return (
      <Link
        to="/app/planos"
        className="flex flex-col gap-2 rounded-xl p-4 transition hover:opacity-90"
        style={{ border: '1px dashed var(--border-strong)', background: 'var(--surface-soft)' }}
      >
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4" style={{ color: 'var(--brand-500)' }} />
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Antes de dar desconto, veja o efeito
          </p>
        </div>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          {locked.mensagem}
        </p>
        <span className="text-xs font-semibold" style={{ color: 'var(--brand-700)' }}>
          Ver o plano Profissional
        </span>
      </Link>
    );
  }

  if (scenarios.length === 0) {
    return (
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
        {message || 'Sem dados suficientes para simular desconto neste produto.'}
      </p>
    );
  }

  // As ressalvas são as mesmas em todos os cenários (exceto extrapolação);
  // mostrar uma vez evita repetir o mesmo aviso cinco vezes.
  const commonWarnings = scenarios[0].ressalvas.filter(
    r => !r.includes('nunca passou'),
  );
  const first = scenarios[0];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-3 text-xs"
        style={{ color: 'var(--text-muted)' }}>
        <span>
          Preço atual <strong style={{ color: 'var(--text-primary)' }}>
            {fmt.money(first.precoAtual)}
          </strong>
        </span>
        <span>
          Reação medida: cada 1% de desconto vende{' '}
          <strong style={{ color: 'var(--text-primary)' }}>
            {first.elasticidade.toFixed(1)}%
          </strong> a mais
        </span>
        {!first.confiavel && (
          <span style={{ color: '#9a3412' }}>· estimativa, sem histórico de promoção</span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ color: 'var(--text-muted)' }}>
              <th className="pb-2 text-left font-medium">Desconto</th>
              <th className="pb-2 text-right font-medium">Preço</th>
              <th className="pb-2 text-right font-medium">Volume/dia</th>
              <th className="pb-2 text-right font-medium">Receita/dia</th>
              <th className="pb-2 text-right font-medium">Margem/dia</th>
            </tr>
          </thead>
          <tbody>
            {scenarios.map(s => (
              <tr key={s.descontoPercent} className="border-t"
                style={{ borderColor: 'var(--border-soft)' }}>
                <td className="py-2.5" style={{ color: 'var(--text-primary)' }}>
                  −{s.descontoPercent}%
                  {s.extrapolando && (
                    <span className="ml-1.5 text-[0.65rem]" style={{ color: '#9a3412' }}>
                      fora da faixa
                    </span>
                  )}
                </td>
                <td className="py-2.5 text-right" style={{ color: 'var(--text-primary)' }}>
                  {fmt.money(s.precoSimulado)}
                </td>
                <td className="py-2.5 text-right" style={{ color: toneOf(s.variacaoQuantidadePercent) }}>
                  {fmt.pct(s.variacaoQuantidadePercent)}
                </td>
                <td className="py-2.5 text-right" style={{ color: toneOf(s.variacaoReceitaPercent) }}>
                  {fmt.pct(s.variacaoReceitaPercent)}
                </td>
                <td className="py-2.5 text-right font-semibold"
                  style={{ color: toneOf(s.variacaoMargemPercent) }}>
                  {s.variacaoMargemPercent == null ? '--' : fmt.pct(s.variacaoMargemPercent)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* O veredito do cenário mais provável, em linguagem de loja. */}
      <div className="flex items-start gap-2 rounded-lg px-3 py-2"
        style={{ background: 'var(--surface-soft)' }}>
        {(first.variacaoMargemPercent ?? 0) >= 0
          ? <TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: '#15803d' }} />
          : <TrendingDown className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: '#b91c1c' }} />}
        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-primary)' }}>
          Com {first.descontoPercent}% de desconto: {first.veredito}
        </p>
      </div>

      {commonWarnings.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {commonWarnings.map((r, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" style={{ color: '#9a3412' }} />
              <p className="text-[0.7rem] leading-relaxed" style={{ color: 'var(--text-soft)' }}>
                {r}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PriceSimulator;
