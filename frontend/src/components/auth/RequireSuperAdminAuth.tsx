'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSuperAdminAuth } from '../../context/SuperAdminAuthContext';

const RequireSuperAdminAuth: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const router = useRouter();
  const { userId, role, loading } = useSuperAdminAuth();

  useEffect(() => {
    if (!loading && (!userId || role !== 'SUPER_ADMIN')) {
      router.replace('/super-admin/login');
    }
  }, [loading, role, router, userId]);

  if (loading || !userId || role !== 'SUPER_ADMIN') {
    return (
      <div className="card flex min-h-[220px] items-center justify-center text-base font-medium text-[color:var(--text-muted)]">
        Carregando...
      </div>
    );
  }

  return <>{children}</>;
};

export default RequireSuperAdminAuth;
