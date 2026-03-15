import { redirect } from 'next/navigation';

export default function LegacyRedirectPage() {
  redirect('/app/lista-compras');
}