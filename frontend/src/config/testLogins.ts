export interface TestLoginCredentials {
  label: string;
  email: string;
  password: string;
}

const SHOW_TEST_LOGINS = import.meta.env.DEV || import.meta.env.VITE_SHOW_TEST_LOGINS === 'true';

// Apenas credenciais do seed de desenvolvimento local (DevSeeder).
// Credenciais de producao NUNCA devem aparecer aqui.
export const ADMIN_TEST_LOGINS: TestLoginCredentials[] = SHOW_TEST_LOGINS ? [
  {
    label: 'Admin local',
    email: 'admin@demo.com',
    password: 'admin123',
  },
] : [];

export const SUPER_ADMIN_TEST_LOGINS: TestLoginCredentials[] = SHOW_TEST_LOGINS ? [
  {
    label: 'Super admin local',
    email: 'superadmin@demo.com',
    password: 'superadmin123',
  },
] : [];
