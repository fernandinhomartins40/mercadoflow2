export interface TestLoginCredentials {
  label: string;
  email: string;
  password: string;
}

const SHOW_TEST_LOGINS = import.meta.env.DEV || import.meta.env.VITE_SHOW_TEST_LOGINS === 'true';

export const ADMIN_TEST_LOGINS: TestLoginCredentials[] = SHOW_TEST_LOGINS ? [
  {
    label: 'Admin local',
    email: 'admin@demo.com',
    password: 'admin123',
  },
  {
    label: 'Admin VPS',
    email: 'admin@mercadoflow.com',
    password: 'MercadoFlow@2026',
  },
] : [];

export const SUPER_ADMIN_TEST_LOGINS: TestLoginCredentials[] = SHOW_TEST_LOGINS ? [
  {
    label: 'Super admin local',
    email: 'superadmin@demo.com',
    password: 'superadmin123',
  },
  {
    label: 'Super admin VPS',
    email: 'superadmin@mercadoflow.com',
    password: 'SuperAdmin@2026',
  },
] : [];
