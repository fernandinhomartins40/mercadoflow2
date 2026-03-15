'use client';

import { Suspense } from 'react';
import Login from '@/screens/Login';

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="card flex min-h-[220px] items-center justify-center text-base font-medium text-[color:var(--text-muted)]">Carregando...</div>}>
      <Login />
    </Suspense>
  );
}