'use client';

import { Suspense } from 'react';
import PublicAgentDownload from '@/screens/PublicAgentDownload';

export default function PublicAgentDownloadPage() {
  return (
    <Suspense fallback={<div className="card flex min-h-[220px] items-center justify-center text-base font-medium text-[color:var(--text-muted)]">Carregando...</div>}>
      <PublicAgentDownload />
    </Suspense>
  );
}