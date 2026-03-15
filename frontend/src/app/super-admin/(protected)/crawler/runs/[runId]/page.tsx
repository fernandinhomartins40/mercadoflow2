'use client';

import { Suspense } from 'react';
import SuperAdminCrawlerRunDetails from '@/screens/SuperAdminCrawlerRunDetails';

export default function SuperAdminCrawlerRunDetailsPage() {
  return (
    <Suspense fallback={<div className="card flex min-h-[220px] items-center justify-center text-base font-medium text-[color:var(--text-muted)]">Carregando...</div>}>
      <SuperAdminCrawlerRunDetails />
    </Suspense>
  );
}