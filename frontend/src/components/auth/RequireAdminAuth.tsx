'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';

const RequireAdminAuth: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const router = useRouter();
  const { userId, loading } = useAuth();

  useEffect(() => {
    if (!loading && !userId) {
      router.replace('/login');
    }
  }, [loading, router, userId]);

  if (loading || !userId) {
    return (
      <div className="card flex min-h-[220px] items-center justify-center text-base font-medium text-[color:var(--text-muted)]">
        Carregando...
      </div>
    );
  }

  return <>{children}</>;
};

export default RequireAdminAuth;
