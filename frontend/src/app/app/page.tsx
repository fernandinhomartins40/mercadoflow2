'use client';

import { Suspense } from 'react';
import Dashboard from '@/screens/Dashboard';

export default function AdminDashboardPage() {
  return (
    <Suspense fallback={<div className="card flex min-h-[220px] items-center justify-center text-base font-medium text-[color:var(--text-muted)]">Carregando...</div>}>
      <Dashboard />
    </Suspense>
  );
}