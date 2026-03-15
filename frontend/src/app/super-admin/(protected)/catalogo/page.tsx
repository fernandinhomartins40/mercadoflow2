'use client';

import { Suspense } from 'react';
import SuperAdminCatalogManager from '@/screens/SuperAdminCatalogManager';

export default function SuperAdminCatalogManagerPage() {
  return (
    <Suspense fallback={<div className="card flex min-h-[220px] items-center justify-center text-base font-medium text-[color:var(--text-muted)]">Carregando...</div>}>
      <SuperAdminCatalogManager />
    </Suspense>
  );
}