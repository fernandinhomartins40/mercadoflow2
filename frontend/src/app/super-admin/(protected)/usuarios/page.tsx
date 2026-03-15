import { redirect } from 'next/navigation';

export default function LegacySuperAdminUsersRedirect() {
  redirect('/super-admin/saas');
}