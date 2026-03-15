'use client';

import { Suspense } from 'react';
import AgentDownload from '@/screens/AgentDownload';

export default function AgentDownloadPage() {
  return (
    <Suspense fallback={<div className="card flex min-h-[220px] items-center justify-center text-base font-medium text-[color:var(--text-muted)]">Carregando...</div>}>
      <AgentDownload />
    </Suspense>
  );
}