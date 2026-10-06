import React from 'react';
import { CloudDownload } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useCached } from '../../hooks/useCached';
import { tractionService, type DataCompleteness } from '../../services/traction.service';

const fmt = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });

/**
 * Enquanto o histórico de notas não está completo (agente ainda enviando o
 * atraso), toda tela avisa: as comparações usam só os dias completos e o que
 * falta aparece datado. Some sozinho quando os últimos 6 meses ficam cheios.
 */
const HistoryNotice: React.FC = () => {
  const { marketId } = useAuth();
  const { data } = useCached<DataCompleteness>(marketId ? `completude:${marketId}` : null,
    () => tractionService.completeness(marketId!), 10 * 60_000);
  if (!data || data.share180 >= 0.9) return null;
  const biggest = [...data.gaps].sort((a, b) => b.days - a.days)[0];
  return (
    <div role="status" className="fx-card" style={{ padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'center', borderColor: 'var(--fx-amber, #d97706)' }}>
      <CloudDownload size={20} aria-hidden="true" style={{ flexShrink: 0, color: 'var(--fx-amber, #d97706)' }} />
      <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.45 }}>
        <b>Histórico chegando: {Math.round(data.share180 * 100)}% dos últimos 6 meses já têm todas as notas.</b>{' '}
        Tendências, sazonalidade e comparações usam só os dias completos.
        {biggest ? ` Maior falta: ${fmt(biggest.from)} a ${fmt(biggest.to)}.` : ''}
      </p>
    </div>
  );
};

export default HistoryNotice;
