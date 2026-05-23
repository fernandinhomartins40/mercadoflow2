import React, { useMemo } from 'react';
import Layout from '../components/layout/Layout';
import { useAuth } from '../context/AuthContext';
import { Building2, Copy, Check, LogOut, ShieldCheck, User } from 'lucide-react';
import { useState } from 'react';

const Settings: React.FC = () => {
  const { marketId, role, name, email, logout } = useAuth();
  const [copied, setCopied] = useState<string | null>(null);

  const apiBaseUrl = useMemo(() => {
    const configured = (import.meta.env.VITE_API_URL || '/api').trim();
    if (configured.startsWith('http://') || configured.startsWith('https://')) {
      return configured.replace(/\/api\/?$/, '').replace(/\/+$/, '');
    }
    return window.location.origin.replace(/\/+$/, '');
  }, []);

  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(c => c === label ? null : c), 1800);
    } catch { /* silent */ }
  };

  const userInitial = (name || email || '?').trim().charAt(0).toUpperCase();

  return (
    <Layout>
      <div className="flex flex-col gap-6 max-w-2xl">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Conta</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Seus dados de acesso e informações do mercado
          </p>
        </div>

        {/* Perfil do usuário */}
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}>
          <div className="flex items-center gap-3 px-5 py-4 border-b" style={{ borderColor: 'var(--border-soft)', background: 'var(--surface-soft)' }}>
            <User className="h-4 w-4" style={{ color: 'var(--text-muted)' }} />
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Perfil</p>
          </div>
          <div className="p-5 flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-xl font-bold text-white"
                style={{ background: 'var(--brand-500)' }}>
                {userInitial}
              </div>
              <div>
                <p className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>{name || '—'}</p>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{email || '—'}</p>
              </div>
              <span className="ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
                style={{ background: role === 'ADMIN' ? '#eff6ff' : 'var(--surface-success)', color: role === 'ADMIN' ? '#1d4ed8' : 'var(--brand-700)' }}>
                <ShieldCheck className="h-3.5 w-3.5" />
                {role === 'ADMIN' ? 'Administrador' : 'Operação'}
              </span>
            </div>
          </div>
        </div>

        {/* Dados do mercado */}
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}>
          <div className="flex items-center gap-3 px-5 py-4 border-b" style={{ borderColor: 'var(--border-soft)', background: 'var(--surface-soft)' }}>
            <Building2 className="h-4 w-4" style={{ color: 'var(--text-muted)' }} />
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Mercado</p>
          </div>
          <div className="flex flex-col divide-y" style={{ borderColor: 'var(--border-soft)' }}>
            {[
              { label: 'ID do mercado', value: marketId || '—', copyable: !!marketId, copyKey: 'market-id' },
              { label: 'URL da API', value: apiBaseUrl, copyable: true, copyKey: 'api-url' },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between gap-4 px-5 py-3.5">
                <div>
                  <p className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{row.label}</p>
                  <p className="mt-0.5 text-sm font-mono" style={{ color: 'var(--text-primary)' }}>{row.value}</p>
                </div>
                {row.copyable && (
                  <button type="button" onClick={() => copyText(row.value, row.copyKey)}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition hover:opacity-80"
                    style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-soft)', color: 'var(--text-muted)' }}>
                    {copied === row.copyKey ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
                    {copied === row.copyKey ? 'Copiado' : 'Copiar'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Sair */}
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}>
          <div className="px-5 py-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Sair da conta</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Encerra a sessão neste dispositivo</p>
            </div>
            <button type="button" onClick={() => { if (typeof logout === 'function') logout(); }}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition hover:opacity-80"
              style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}>
              <LogOut className="h-4 w-4" /> Sair
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Settings;
