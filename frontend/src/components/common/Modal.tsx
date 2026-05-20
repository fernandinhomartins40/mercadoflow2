import React, { useEffect } from 'react';
import { cn } from '../../lib/cn';

/**
 * Modal reutilizável com backdrop, cabeçalho e corpo scrollável.
 * Bloqueia scroll do body quando aberto e suporta fechar com Escape.
 *
 * Todas as labels e aria devem estar em pt-BR.
 */

interface ModalProps {
  /** Controla visibilidade do modal */
  open: boolean;
  /** Callback para fechar o modal */
  onClose: () => void;
  /** Impede o fechamento (ex: durante salvamento) */
  preventClose?: boolean;
  /** Kicker (categoria/subtítulo acima do título) */
  kicker?: React.ReactNode;
  /** Título do modal */
  title: React.ReactNode;
  /** ID para aria-labelledby */
  titleId?: string;
  /** Ações do cabeçalho (botões Cancelar, Salvar, etc.) */
  headerActions?: React.ReactNode;
  /** Conteúdo do corpo */
  children: React.ReactNode;
  /** Classe extra para o painel do modal */
  className?: string;
  /** Classe extra para o body do modal */
  bodyClassName?: string;
}

const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  preventClose = false,
  kicker,
  title,
  titleId,
  headerActions,
  children,
  className,
  bodyClassName,
}) => {
  useEffect(() => {
    if (!open) return undefined;
    const originalOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !preventClose) {
        onClose();
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, preventClose, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      role="presentation"
      onClick={() => { if (!preventClose) onClose(); }}
    >
      <div
        className={cn('mx-4 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_24px_60px_rgba(0,0,0,0.15)]', className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-4">
          <div>
            {kicker ? <span className="text-xs font-medium uppercase tracking-wider text-slate-400">{kicker}</span> : null}
            {typeof title === 'string' ? (
              <h3 id={titleId} className="text-lg font-semibold text-slate-900">{title}</h3>
            ) : (
              title
            )}
          </div>
          {headerActions ? (
            <div className="flex items-center gap-2">
              {headerActions}
            </div>
          ) : null}
        </div>
        <div className={cn('flex-1 overflow-y-auto px-6 py-4', bodyClassName)}>
          {children}
        </div>
      </div>
    </div>
  );
};

export default Modal;
