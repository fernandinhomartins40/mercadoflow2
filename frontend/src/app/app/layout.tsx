'use client';

import React from 'react';
import RequireAdminAuth from '@/components/auth/RequireAdminAuth';

export default function AdminAppLayout({ children }: { children: React.ReactNode }) {
  return <RequireAdminAuth>{children}</RequireAdminAuth>;
}