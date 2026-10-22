import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { LEGAL_VERSION, UPDATED_AT } from '../screens/legal/LegalPage';

/**
 * Tela de aceite (S1 do parecer LGPD): aparece quando o /me traz
 * legalAcceptanceRequired, antes de usar o painel ou o Bipaê. Não fecha:
 * só sai aceitando ou saindo da conta. O DPA só vale para o dono da loja.
 */

const link: React.CSSProperties = { color: '#045e48', fontWeight: 600, textDecoration: 'underline' };

const LegalAcceptanceGate: React.FC = () => {
  const { role, acceptLegal, logout } = useAuth();
  const owner = role === 'MARKET_OWNER';
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = async () => {
    if (!checked) return;
    setBusy(true);
    setError(null);
    try {
      await acceptLegal();
    } catch {
      setError('Não foi possível registrar o aceite. Confira a internet e tente de novo.');
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="legal-gate-title"
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: '#f4f8f6', overflowY: 'auto', display: 'flex', justifyContent: 'center', padding: '24px 16px' }}
    >
      <div style={{ width: '100%', maxWidth: 560, margin: 'auto 0', background: '#fff', border: '1px solid #dde7e2', borderRadius: 20, padding: 24, color: '#10231c', lineHeight: 1.55, fontSize: 17 }}>
        <h1 id="legal-gate-title" style={{ margin: '0 0 8px', fontSize: 24, lineHeight: 1.2 }}>Atualizamos os nossos termos</h1>
        <p style={{ margin: '0 0 12px', color: '#4f6159' }}>
          Para continuar usando o MercadoFlow, leia e aceite a versão de {UPDATED_AT} (versão {LEGAL_VERSION}).
          Os links abrem numa nova aba.
        </p>
        <ul style={{ margin: '0 0 16px', paddingLeft: 20 }}>
          <li><a href="/termos" target="_blank" rel="noopener noreferrer" style={link}>Termos de uso</a></li>
          <li><a href="/privacidade" target="_blank" rel="noopener noreferrer" style={link}>Política de privacidade</a></li>
          {owner && (
            <li><a href="/contrato-operador" target="_blank" rel="noopener noreferrer" style={link}>Contrato de tratamento de dados (operador)</a></li>
          )}
        </ul>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: 14, borderRadius: 14, background: '#f4f8f6', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            style={{ width: 22, height: 22, marginTop: 3, flexShrink: 0, accentColor: '#157A3D' }}
          />
          <span>
            {owner
              ? 'Li e aceito os Termos de uso, a Política de privacidade e o Contrato de tratamento de dados (operador), e declaro que posso representar a empresa.'
              : 'Li e aceito os Termos de uso e a Política de privacidade.'}
          </span>
        </label>
        {error && <p role="alert" style={{ margin: '12px 0 0', color: '#991b1b' }}>{error}</p>}
        <button
          type="button"
          onClick={() => { void accept(); }}
          disabled={!checked || busy}
          style={{
            marginTop: 16, width: '100%', minHeight: 52, borderRadius: 14, border: 0, fontSize: 18, fontWeight: 700,
            color: '#fff', background: !checked || busy ? '#9bb5a8' : '#157A3D', cursor: !checked || busy ? 'not-allowed' : 'pointer',
          }}
        >
          {busy ? 'Registrando…' : 'Aceitar e continuar'}
        </button>
        <button
          type="button"
          onClick={() => { void logout(); }}
          style={{ marginTop: 10, width: '100%', minHeight: 44, borderRadius: 14, border: '1px solid #dde7e2', background: '#fff', color: '#4f6159', fontSize: 16, cursor: 'pointer' }}
        >
          Sair da conta
        </button>
      </div>
    </div>
  );
};

export default LegalAcceptanceGate;
