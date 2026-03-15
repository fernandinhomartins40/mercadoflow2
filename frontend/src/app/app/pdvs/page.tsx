'use client';

import { Suspense } from 'react';
import PDVs from '@/screens/PDVs';

export default function PdvsPage() {
  return (
    <Suspense fallback={<div className="card flex min-h-[220px] items-center justify-center text-base font-medium text-[color:var(--text-muted)]">Carregando...</div>}>
      <PDVs />
    </Suspense>
  );
}