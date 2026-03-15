'use client';

import { Suspense } from 'react';
import SuperAdminDashboard from '@/screens/SuperAdminDashboard';

export default function SuperAdminDashboardPage() {
  return (
    <Suspense fallback={<div className="card flex min-h-[220px] items-center justify-center text-base font-medium text-[color:var(--text-muted)]">Carregando...</div>}>
      <SuperAdminDashboard />
    </Suspense>
  );
}