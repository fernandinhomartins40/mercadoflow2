'use client';

import { Suspense } from 'react';
import OffersDashboard from '@/screens/OffersDashboard';

export default function OffersDashboardPage() {
  return (
    <Suspense fallback={<div className="card flex min-h-[220px] items-center justify-center text-base font-medium text-[color:var(--text-muted)]">Carregando...</div>}>
      <OffersDashboard />
    </Suspense>
  );
}