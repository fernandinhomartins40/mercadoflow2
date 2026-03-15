'use client';

import { Suspense } from 'react';
import OfferTemplates from '@/screens/OfferTemplates';

export default function OfferTemplatesPage() {
  return (
    <Suspense fallback={<div className="card flex min-h-[220px] items-center justify-center text-base font-medium text-[color:var(--text-muted)]">Carregando...</div>}>
      <OfferTemplates />
    </Suspense>
  );
}