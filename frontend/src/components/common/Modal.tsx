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
      className="catalog-admin-modal-backdrop"
      role="presentation"
      onClick={() => { if (!preventClose) onClose(); }}
    >
      <div
        className={cn('catalog-admin-modal card', className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="catalog-admin-modal-head">
          <div>
            {kicker ? <span className="section-kicker">{kicker}</span> : null}
            {typeof title === 'string' ? (
              <h3 id={titleId}>{title}</h3>
            ) : (
              title
            )}
          </div>
          {headerActions ? (
            <div className="catalog-admin-modal-head-actions">
              {headerActions}
            </div>
          ) : null}
        </div>
        <div className={cn('catalog-admin-modal-body', bodyClassName)}>
          {children}
        </div>
      </div>
    </div>
  );
};

export default Modal;
