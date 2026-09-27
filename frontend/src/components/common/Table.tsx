import React from 'react';
import { cn } from '../../lib/cn';

/**
 * Tabela reutilizável com rolagem horizontal em telas estreitas.
 *
 * O wrapper (.table-shell) rola no eixo X, então tabelas largas nunca
 * estouram a página nem têm colunas cortadas no mobile.
 *
 * Cabeçalhos em pt-BR.
 */

export interface TableColumn {
  /** Rótulo exibido no cabeçalho */
  label: string;
  /** Alinhamento das células desta coluna */
  align?: 'left' | 'right' | 'center';
  /** Classe extra aplicada ao th e às td da coluna */
  className?: string;
}

interface TableProps {
  /** Colunas: strings simples ou objetos com alinhamento */
  headers: Array<string | TableColumn>;
  /** Linhas, cada uma com uma célula por coluna */
  rows: React.ReactNode[][];
  /** Conteúdo exibido quando não há linhas */
  emptyMessage?: React.ReactNode;
  /** Classe extra para o wrapper rolável */
  className?: string;
}

const alignClass = (align?: TableColumn['align']) =>
  align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : undefined;

const Table: React.FC<TableProps> = ({
  headers,
  rows,
  emptyMessage = 'Nenhum registro encontrado.',
  className,
}) => {
  const columns: TableColumn[] = headers.map((header) =>
    typeof header === 'string' ? { label: header } : header,
  );

  return (
    <div className={cn('table-shell', className)}>
      <table className="table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.label} className={cn(alignClass(column.align), column.className)}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-8 text-center text-sm"
                style={{ color: 'var(--text-muted)' }}
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => {
                  const column = columns[cellIndex];
                  return (
                    <td key={cellIndex} className={cn(alignClass(column?.align), column?.className)}>
                      {cell}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};

export default Table;
