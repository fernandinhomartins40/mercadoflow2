import React from 'react';
import { Link } from 'react-router-dom';
import { ClipboardCheck, Plug } from 'lucide-react';
import { Card } from '../flow/Flow';
import { useCached } from '../../hooks/useCached';
import { decisionInputsService } from '../../services/decisionInputs.service';

/**
 * Quanto do que a loja vende tem custo real e estoque conhecido. Sem custo,
 * margem e promoção são chute; o caminho sem digitar é conferir as notas no
 * Confere ou ligar o ERP. Some quando a cobertura está boa.
 */
const Meter: React.FC<{ label: string; share: number }> = ({ label, share }) => {
  const pct = Math.round(share * 100);
  const tone = pct >= 80 ? 'var(--fx-green)' : pct >= 50 ? 'var(--fx-amber)' : 'var(--fx-red)';
  return (
    <div style={{ flex: '1 1 180px', minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 14 }}>
        <span>{label}</span><b className="fx-num">{pct}%</b>
      </div>
      <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}
        style={{ height: 8, borderRadius: 99, background: 'var(--fx-card-2)', marginTop: 6, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: tone, borderRadius: 99 }} />
      </div>
    </div>
  );
};

/** withCount: mostra também a contagem rápida (o Início junta aqui os caminhos para medir). */
const CostCoverageCard: React.FC<{ marketId: string | null | undefined; compact?: boolean; withCount?: boolean }> = ({ marketId, compact, withCount }) => {
  const { data } = useCached(marketId ? `${marketId}:cost-coverage` : null, () => decisionInputsService.coverage(marketId!), 5 * 60_000);
  if (!data || Number(data.revenue) <= 0) return null;
  const good = data.costShare >= 0.9 && data.stockShare >= 0.9 && data.pendingNfe === 0;
  if (good) return null;
  const pending = Number(data.pendingNfe) || 0;

  return (
    <Card as="section" aria-label="Custo e estoque conhecidos">
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: '2 1 260px', minWidth: 0 }}>
          <b style={{ display: 'block', fontSize: compact ? 15 : 16.5 }}>
            {data.costShare < 0.5 ? 'Margem e promoção ainda no escuro' : 'Quanto do que você vende tem custo e estoque'}
          </b>
          <span className="fx-muted" style={{ fontSize: 13.5 }}>
            Pelo faturamento dos últimos 90 dias. Sem custo, o Tino pede que você informe na hora de decidir.
          </span>
        </div>
        <div style={{ display: 'flex', gap: 18, flex: '3 1 320px', flexWrap: 'wrap' }}>
          <Meter label="Com custo real" share={data.costShare} />
          <Meter label="Com estoque conhecido" share={data.stockShare} />
        </div>
      </div>
      <div className="fx-actions" style={{ marginTop: 14 }}>
        {pending > 0 && (
          <a href="/confere" className="fx-btn dark small">
            <ClipboardCheck aria-hidden="true" />Conferir {pending === 1 ? 'a nota que chegou' : `as ${pending} notas que chegaram`}
          </a>
        )}
        {withCount && <Link to="/app/contar" className={`fx-btn ${pending > 0 ? 'ghost' : 'dark'} small`}><ClipboardCheck aria-hidden="true" />Contar os 20 que mais vendem (5 min)</Link>}
        <Link to="/app/integracoes" className="fx-btn ghost small"><Plug aria-hidden="true" />Ligar o seu ERP</Link>
      </div>
      {pending > 0 && !compact && (
        <p className="fx-muted" style={{ margin: '10px 0 0', fontSize: 13.5 }}>
          As notas de entrada já estão aqui: conferir no Confere grava o custo e a entrada no estoque, sem digitar.
        </p>
      )}
    </Card>
  );
};

export default CostCoverageCard;
