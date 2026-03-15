'use client';

import { Suspense } from 'react';
import OfferDesigner from '@/screens/OfferDesigner';

export default function OfferDesignerPage() {
  return (
    <Suspense fallback={<div className="card flex min-h-[220px] items-center justify-center text-base font-medium text-[color:var(--text-muted)]">Carregando...</div>}>
      <OfferDesigner />
    </Suspense>
  );
}