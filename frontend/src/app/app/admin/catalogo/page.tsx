'use client';

import { Suspense } from 'react';
import AdminCatalog from '@/screens/AdminCatalog';

export default function AdminCatalogPage() {
  return (
    <Suspense fallback={<div className="card flex min-h-[220px] items-center justify-center text-base font-medium text-[color:var(--text-muted)]">Carregando...</div>}>
      <AdminCatalog />
    </Suspense>
  );
}