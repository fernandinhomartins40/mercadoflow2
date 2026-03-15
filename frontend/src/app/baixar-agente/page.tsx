import { redirect } from 'next/navigation';

export default function LegacyAgentDownloadRedirect() {
  redirect('/download-agente');
}