import React from 'react';
import EmptyState from '../common/EmptyState';

interface EmptyProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Açúcar sintático sobre EmptyState para quando só há uma mensagem.
 *
 * Mantido porque a forma `<Empty>texto</Empty>` é mais direta que a prop
 * `message`, mas a aparência vem toda de EmptyState — não duplique estilo aqui.
 * Para ícone ou ação, use EmptyState diretamente.
 */
const Empty: React.FC<EmptyProps> = ({ children, className }) => (
  <EmptyState message={children} className={className} compact />
);

export default Empty;
