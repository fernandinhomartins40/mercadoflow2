import React from 'react';
import Section from '../ui/Section';

interface PanelSectionProps {
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
  compactHead?: boolean;
  kicker?: React.ReactNode;
  title?: React.ReactNode;
  as?: 'section' | 'article' | 'div';
  reveal?: boolean;
}

/**
 * @deprecated Use `Section` de components/ui. Mantido como alias para as telas
 * que ainda importam este caminho; toda a aparência vem de Section.
 */
const PanelSection: React.FC<PanelSectionProps> = ({ reveal = true, ...props }) => (
  <Section reveal={reveal} {...props} />
);

export default PanelSection;
