'use client';

import { Suspense } from 'react';
import DemandForecast from '@/screens/DemandForecast';

export default function DemandForecastPage() {
  return (
    <Suspense fallback={<div className="card flex min-h-[220px] items-center justify-center text-base font-medium text-[color:var(--text-muted)]">Carregando...</div>}>
      <DemandForecast />
    </Suspense>
  );
}