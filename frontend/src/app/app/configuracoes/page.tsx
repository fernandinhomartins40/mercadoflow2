'use client';

import { Suspense } from 'react';
import Settings from '@/screens/Settings';

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="card flex min-h-[220px] items-center justify-center text-base font-medium text-[color:var(--text-muted)]">Carregando...</div>}>
      <Settings />
    </Suspense>
  );
}