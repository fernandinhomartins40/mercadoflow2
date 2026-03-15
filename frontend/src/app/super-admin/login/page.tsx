'use client';

import { Suspense } from 'react';
import SuperAdminLogin from '@/screens/SuperAdminLogin';

export default function SuperAdminLoginPage() {
  return (
    <Suspense fallback={<div className="card flex min-h-[220px] items-center justify-center text-base font-medium text-[color:var(--text-muted)]">Carregando...</div>}>
      <SuperAdminLogin />
    </Suspense>
  );
}