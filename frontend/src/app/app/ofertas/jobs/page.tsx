'use client';

import { Suspense } from 'react';
import OfferJobs from '@/screens/OfferJobs';

export default function OfferJobsPage() {
  return (
    <Suspense fallback={<div className="card flex min-h-[220px] items-center justify-center text-base font-medium text-[color:var(--text-muted)]">Carregando...</div>}>
      <OfferJobs />
    </Suspense>
  );
}