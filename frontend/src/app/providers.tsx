'use client';

import React from 'react';
import { AuthProvider } from '../context/AuthContext';
import { SuperAdminAuthProvider } from '../context/SuperAdminAuthContext';

const Providers: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <AuthProvider>
      <SuperAdminAuthProvider>{children}</SuperAdminAuthProvider>
    </AuthProvider>
  );
};

export default Providers;
