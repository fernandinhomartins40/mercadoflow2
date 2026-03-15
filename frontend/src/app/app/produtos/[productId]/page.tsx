'use client';

import { Suspense } from 'react';
import ProductDetail from '@/screens/ProductDetail';

export default function ProductDetailPage() {
  return (
    <Suspense fallback={<div className="card flex min-h-[220px] items-center justify-center text-base font-medium text-[color:var(--text-muted)]">Carregando...</div>}>
      <ProductDetail />
    </Suspense>
  );
}