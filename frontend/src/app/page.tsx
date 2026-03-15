'use client';

import { Suspense } from 'react';
import Landing from '@/screens/Landing';

export default function HomePage() {
  return (
    <Suspense fallback={<div className="card flex min-h-[220px] items-center justify-center text-base font-medium text-[color:var(--text-muted)]">Carregando...</div>}>
      <Landing />
    </Suspense>
  );
}