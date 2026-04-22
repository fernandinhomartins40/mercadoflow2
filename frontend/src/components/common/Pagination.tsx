import React from 'react';
import Button from './Button';

/**
 * Controle de paginação reutilizável.
 * Exibe botões Anterior/Próxima com controle de estado da página.
 *
 * Labels em pt-BR obrigatório.
 */

interface PaginationProps {
  /** Página atual (0-indexed) */
  page: number;
  /** Total de páginas */
  totalPages: number;
  /** Callback para mudar de página */
  onPageChange: (page: number) => void;
  /** Texto do botão anterior */
  previousLabel?: string;
  /** Texto do botão próxima */
  nextLabel?: string;
  /** Classe extra para o container */
  className?: string;
}

const Pagination: React.FC<PaginationProps> = ({
  page,
  totalPages,
  onPageChange,
  previousLabel = 'Anterior',
  nextLabel = 'Próxima',
  className = 'flex items-center justify-center gap-3 mt-3',
}) => (
  <div className={className}>
    <Button
      variant="secondary"
      onClick={() => onPageChange(Math.max(0, page - 1))}
      disabled={page <= 0}
    >
      {previousLabel}
    </Button>
    <span className="text-sm text-gray-500">
      {totalPages > 0 ? `${page + 1} / ${totalPages}` : '—'}
    </span>
    <Button
      variant="secondary"
      onClick={() => onPageChange(page + 1)}
      disabled={totalPages === 0 || page >= totalPages - 1}
    >
      {nextLabel}
    </Button>
  </div>
);

export default Pagination;
