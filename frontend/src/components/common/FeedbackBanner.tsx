import React from 'react';
import { cn } from '../../lib/cn';

/**
 * Banner de feedback reutilizável para mensagens de erro e sucesso.
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
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {success}
        </div>
      ) : null}
    </div>
  );
};

export default FeedbackBanner;
