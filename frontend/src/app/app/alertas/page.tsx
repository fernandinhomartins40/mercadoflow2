'use client';

import { Suspense } from 'react';
import Alerts from '@/screens/Alerts';

export default function AlertsPage() {
  return (
    <Suspense fallback={<div className="card flex min-h-[220px] items-center justify-center text-base font-medium text-[color:var(--text-muted)]">Carregando...</div>}>
      <Alerts />
    </Suspense>
  );
}