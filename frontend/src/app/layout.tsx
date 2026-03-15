import type { Metadata } from 'next';
import React, { Suspense } from 'react';
import './globals.css';
import Providers from './providers';

export const metadata: Metadata = {
  title: 'MercadoFlow',
  description: 'MercadoFlow',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <Suspense
          fallback={
            <div className="card flex min-h-screen items-center justify-center text-base font-medium text-[color:var(--text-muted)]">
              Carregando...
            </div>
          }
        >
          <Providers>{children}</Providers>
        </Suspense>
      </body>
    </html>
  );
}
