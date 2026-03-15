'use client';

import { Suspense } from 'react';
import SuperAdminCrawlerConfig from '@/screens/SuperAdminCrawlerConfig';

export default function SuperAdminCrawlerConfigPage() {
  return (
    <Suspense fallback={<div className="card flex min-h-[220px] items-center justify-center text-base font-medium text-[color:var(--text-muted)]">Carregando...</div>}>
      <SuperAdminCrawlerConfig />
    </Suspense>
  );
}