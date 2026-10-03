import React from 'react';
import { PageHero } from '../flow/Flow';

interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

/** Título de página no visual Flow (telas que ainda não têm título próprio). */
const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, actions }) => (
  <PageHero title={title} subtitle={subtitle} side={actions} />
);

export default PageHeader;
