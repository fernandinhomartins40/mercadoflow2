import React from 'react';
import { cn } from '../../lib/cn';
import PanelSection from '../dashboard/PanelSection';

/**
 * Banner de feedback reutilizável para mensagens de erro e sucesso.
 * Substitui o padrão repetido de PanelSection com text-color inline.
 *
 * Mensagens devem estar em pt-BR.
 */

interface FeedbackBannerProps {
  /** Mensagem de erro (prioridade sobre sucesso) */
  error?: string | null;
  /** Mensagem de sucesso */
  success?: string | null;
  /** Callback para limpar as mensagens */
  onDismiss?: () => void;
  /** Classe extra */
  className?: string;
}

const FeedbackBanner: React.FC<FeedbackBannerProps> = ({
  error,
  success,
  className,
}) => {
  if (!error && !success) return null;

  return (
    <div className={cn('grid gap-2', className)}>
      {error ? (
        <PanelSection reveal={false} className="text-[color:var(--danger)]">
          {error}
        </PanelSection>
      ) : null}
      {success ? (
        <PanelSection reveal={false} className="text-[color:var(--success)]">
          {success}
        </PanelSection>
      ) : null}
    </div>
  );
};

export default FeedbackBanner;
