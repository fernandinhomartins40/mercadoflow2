/**
 * Barrel único do design system.
 *
 * Importe daqui (`components/ui`) em vez de alcançar `components/common/*`
 * diretamente, para que as telas tenham uma só porta de entrada.
 */

// Primitivos de layout / conteúdo
export { default as Section } from './Section';
export { default as DataRow } from './DataRow';
export { default as Stat } from './Stat';
export { default as StatGrid } from './StatGrid';
export { default as Chip } from './Chip';
export { default as Empty } from './Empty';
export { default as RailCard } from './RailCard';
export { default as SegmentedTabs } from './SegmentedTabs';
export type { SegmentedTab } from './SegmentedTabs';

// Primitivos compartilhados
export { default as Button } from '../common/Button';
export { default as ButtonLink } from '../common/ButtonLink';
export { default as Card } from '../common/Card';
export { default as Modal } from '../common/Modal';
export { default as Table } from '../common/Table';
export type { TableColumn } from '../common/Table';
export { default as Pagination } from '../common/Pagination';
export { default as EmptyState } from '../common/EmptyState';
export { default as StatusPill } from '../common/StatusPill';
