'use client';

import React from 'react';
import RequireSuperAdminAuth from '@/components/auth/RequireSuperAdminAuth';

export default function SuperAdminProtectedLayout({ children }: { children: React.ReactNode }) {
  return <RequireSuperAdminAuth>{children}</RequireSuperAdminAuth>;
}