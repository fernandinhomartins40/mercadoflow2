'use client';

import { Suspense } from 'react';
import Products from '@/screens/Products';

export default function ProductsPage() {
  return (
    <Suspense fallback={<div className="card flex min-h-[220px] items-center justify-center text-base font-medium text-[color:var(--text-muted)]">Carregando...</div>}>
      <Products />
    </Suspense>
  );
}