'use client';

import { Suspense } from 'react';
import ShoppingList from '@/screens/ShoppingList';

export default function ShoppingListPage() {
  return (
    <Suspense fallback={<div className="card flex min-h-[220px] items-center justify-center text-base font-medium text-[color:var(--text-muted)]">Carregando...</div>}>
      <ShoppingList />
    </Suspense>
  );
}