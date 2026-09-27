import React from 'react';
import { cn } from '../../lib/cn';

export interface SegmentedTab<K extends string> {
  key: K;
  label: string;
  icon?: React.ReactNode;
  /** Contador ao lado do rótulo (ex.: pedidos em rascunho). */
  badge?: number;
}

interface SegmentedTabsProps<K extends string> {
  tabs: Array<SegmentedTab<K>>;
  value: K;
  onChange: (key: K) => void;
  /** Largura do conteúdo a partir de sm (padrão: ocupa a linha toda). */
  fit?: boolean;
  className?: string;
  /** Nome do grupo para leitor de tela. */
  label?: string;
}

/**
 * Abas de alternância de conteúdo dentro da tela.
 *
 * No celular vira grade (2 colunas com 4 abas; uma linha com 2 ou 3, quebrando
 * o texto): em linha, as abas não cabiam em 360 px e a última saía da tela. A
 * partir de sm volta a ser a barra em linha.
 */
function SegmentedTabs<K extends string>({ tabs, value, onChange, fit = false, className, label }: SegmentedTabsProps<K>) {
  const mobileColumns = tabs.length === 4 ? 2 : Math.min(tabs.length, 3);
  return (
    <div
      role="group"
      aria-label={label}
      className={cn('grid gap-1 rounded-xl p-1 sm:flex', fit && 'sm:w-fit', className)}
      style={{
        gridTemplateColumns: `repeat(${mobileColumns}, minmax(0, 1fr))`,
        background: 'var(--surface-soft)',
        border: '1px solid var(--border-soft)',
      }}
    >
      {tabs.map((tab) => {
        const active = tab.key === value;
        return (
          <button
            key={tab.key}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(tab.key)}
            className={cn(
              // flex-wrap: em coluna estreita o contador desce em vez de cobrir o texto.
              'flex min-h-[44px] min-w-0 flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-lg px-2 py-2 text-center text-sm font-medium leading-tight transition sm:px-3',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-700)]',
              !fit && 'sm:flex-1',
              fit && 'sm:px-4',
            )}
            style={active
              ? { background: 'var(--surface-base)', color: 'var(--text-primary)', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }
              : { color: 'var(--text-muted)' }}
          >
            {tab.icon ? <span className="shrink-0" aria-hidden="true">{tab.icon}</span> : null}
            <span className="min-w-0">{tab.label}</span>
            {tab.badge ? (
              <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold" style={{ background: 'var(--brand-500)', color: '#fff' }}>
                {tab.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export default SegmentedTabs;
