'use client';

import { Suspense } from 'react';
import SuperAdminUsers from '@/screens/SuperAdminUsers';

export default function SuperAdminUsersPage() {
  return (
    <Suspense fallback={<div className="card flex min-h-[220px] items-center justify-center text-base font-medium text-[color:var(--text-muted)]">Carregando...</div>}>
      <SuperAdminUsers />
    </Suspense>
  );
}