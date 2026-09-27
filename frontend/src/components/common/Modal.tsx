import React from 'react';
import { cn } from '../../lib/cn';
import useModalBehavior from '../../hooks/useModalBehavior';

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
  /** Largura máxima do painel em telas grandes */
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const SIZE_CLASS: Record<NonNullable<ModalProps['size']>, string> = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-2xl',
  lg: 'sm:max-w-4xl',
  xl: 'sm:max-w-6xl',
};

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
  size = 'md',
}) => {
  // Mesmo comportamento dos overlays montados à mão: Esc fecha só o diálogo
  // de cima e o scroll volta quando o último fecha.
  useModalBehavior(open, onClose, { preventClose });

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="presentation"
      onClick={() => { if (!preventClose) onClose(); }}
    >
      <div
        className={cn(
          // Mobile: folha colada ao rodape, ocupando a largura toda.
          // sm+: cartao centralizado com largura maxima por `size`.
          'flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-[0_24px_60px_rgba(0,0,0,0.15)]',
          'sm:max-h-[90vh] sm:rounded-xl',
          SIZE_CLASS[size],
          className,
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:gap-4 sm:px-6 sm:py-4">
          <div className="min-w-0 flex-1">
            {kicker ? <span className="text-xs font-medium uppercase tracking-wider text-slate-400">{kicker}</span> : null}
            {typeof title === 'string' ? (
              <h3 id={titleId} className="text-base font-semibold text-slate-900 sm:text-lg">{title}</h3>
            ) : (
              title
            )}
          </div>
          {headerActions ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {headerActions}
            </div>
          ) : null}
        </div>
        <div className={cn('flex-1 overflow-y-auto overflow-x-hidden px-4 py-3 sm:px-6 sm:py-4', bodyClassName)}>
          {children}
        </div>
      </div>
    </div>
  );
};

export default Modal;
