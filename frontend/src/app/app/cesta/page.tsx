'use client';

import { Suspense } from 'react';
import MarketBasket from '@/screens/MarketBasket';

export default function MarketBasketPage() {
  return (
    <Suspense fallback={<div className="card flex min-h-[220px] items-center justify-center text-base font-medium text-[color:var(--text-muted)]">Carregando...</div>}>
      <MarketBasket />
    </Suspense>
  );
}