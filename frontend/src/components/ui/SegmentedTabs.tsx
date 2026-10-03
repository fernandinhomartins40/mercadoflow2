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
    <div role="group" aria-label={label} className={cn('fx-seg-tabs', fit && 'fit', className)}
      style={{ gridTemplateColumns: `repeat(${mobileColumns}, minmax(0, 1fr))` }}>
      {tabs.map((tab) => (
        <button key={tab.key} type="button" aria-pressed={tab.key === value} onClick={() => onChange(tab.key)}>
          {tab.icon ? <span className="shrink-0" aria-hidden="true">{tab.icon}</span> : null}
          <span className="min-w-0">{tab.label}</span>
          {tab.badge ? <span className="badge">{tab.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}

export default SegmentedTabs;
