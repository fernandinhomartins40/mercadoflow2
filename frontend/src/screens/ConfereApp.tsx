import React, { useCallback, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { confereService } from '../services/confere.service';
import type { ConfereStatus } from '../types/confere.types';
import { Shell, Spinner, errorText } from '../features/confere/ui';
import { PENDING_ACCEPT, TermsScreen, Welcome } from '../features/confere/Welcome';
import Home from '../features/confere/Home';
import ReadScreen from '../features/confere/ReadScreen';
import Credits from '../features/confere/Credits';
import CertificateScreen from '../features/confere/CertificateScreen';
import ImportXml from '../features/confere/ImportXml';
import ConferenceScreen from '../features/confere/ConferenceScreen';
import PartnersScreen from '../features/confere/PartnersScreen';
import NotesScreen from '../features/confere/NotesScreen';
import AccountScreen from '../features/confere/AccountScreen';
import { TabLayout } from '../features/confere/TabBar';
import '../features/confere/confere.css';

/**
 * MercadoFlow Confere (PWA): conferência de mercadoria pela nota do
 * fornecedor. Grátis e ilimitado com o certificado A1; sem ele, leituras de
 * crédito (as primeiras grátis para testar). Porta de entrada do MercadoFlow.
 */

const NotaRoute: React.FC<{ marketId: string }> = ({ marketId }) => {
  const { docId } = useParams();
  return <Shell><ConferenceScreen marketId={marketId} docId={docId ?? ''} /></Shell>;
};

const ConfereApp: React.FC = () => {
  const { marketId, loading, email } = useAuth();
  const [status, setStatus] = useState<ConfereStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/confere-sw.js', { scope: '/confere/' }).catch(() => {});
    }
  }, []);

  const refresh = useCallback(() => {
    if (!marketId) return;
    confereService.status(marketId).then(async (s) => {
      // Aceite feito no formulário de cadastro: registra e libera as leituras grátis.
      const pending = sessionStorage.getItem(PENDING_ACCEPT);
      let current = s;
      if (!s.termsAccepted && pending && pending === s.termsVersion) {
        sessionStorage.removeItem(PENDING_ACCEPT);
        current = await confereService.acceptTerms(marketId, s.termsVersion);
      }
      setStatus(current);
    }).catch((e) => setError(errorText(e, 'Não foi possível abrir o Confere.')));
  }, [marketId]);

  useEffect(() => { refresh(); }, [refresh]);

  if (loading) return <Spinner />;
  if (!email) return <Welcome />;
  if (!marketId) return <Shell><p className="p-6 text-lg">Esta conta não está ligada a um mercado. Entre com a conta do mercado.</p></Shell>;
  if (error) return <Shell><p className="p-6 text-lg text-red-800">{error}</p></Shell>;
  if (!status) return <Spinner />;
  if (!status.termsAccepted) return <TermsScreen status={status} marketId={marketId} onAccepted={setStatus} />;

  return (
    <Routes>
      {/* Abas com a barra inferior. */}
      <Route element={<TabLayout />}>
        <Route index element={<Home status={status} marketId={marketId} />} />
        <Route path="notas" element={<NotesScreen marketId={marketId} />} />
        <Route path="creditos" element={<Credits status={status} marketId={marketId} refresh={refresh} />} />
        <Route path="conta" element={<AccountScreen status={status} />} />
        <Route path="certificado" element={<CertificateScreen status={status} marketId={marketId} refresh={refresh} />} />
        <Route path="importar" element={<ImportXml marketId={marketId} />} />
        <Route path="fabricantes" element={<PartnersScreen status={status} marketId={marketId} onChange={setStatus} />} />
      </Route>
      {/* Tarefa em tela cheia: ler e conferir. */}
      <Route path="ler" element={<Shell><ReadScreen marketId={marketId} onBalance={(balance) => setStatus((s) => (s ? { ...s, balance } : s))} /></Shell>} />
      <Route path="nota/:docId" element={<NotaRoute marketId={marketId} />} />
      <Route path="*" element={<Navigate to="/confere/" replace />} />
    </Routes>
  );
};

export default ConfereApp;
