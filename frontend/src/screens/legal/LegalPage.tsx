import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';

/** Moldura simples das páginas públicas de política e termos. */

export const CONTROLLER = 'FUSE AGENCIA LTDA';
export const CONTROLLER_CNPJ = '42.761.086/0001-15';
export const DPO_NAME = 'Luiz Fernando Martins Oliveira';
export const PRIVACY_EMAIL = 'fuseagencia10@gmail.com';
export const UPDATED_AT = '22/10/2026';

export const LegalSection: React.FC<{ id?: string; title: string; children: React.ReactNode; highlight?: boolean }> = ({ id, title, children, highlight }) => (
  <section
    id={id}
    style={{
      background: highlight ? '#fff8e6' : '#fff',
      border: `1px solid ${highlight ? '#f5dc9a' : '#dde7e2'}`,
      borderRadius: 16,
      padding: '18px 20px',
      color: '#10231c',
      lineHeight: 1.6,
      fontSize: 16,
    }}
  >
    <h2 style={{ margin: '0 0 8px', fontSize: 19, color: '#045e48' }}>{title}</h2>
    {children}
  </section>
);

export const Mail: React.FC<{ subject?: string }> = ({ subject }) => (
  <a href={`mailto:${PRIVACY_EMAIL}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`} style={{ color: '#045e48', fontWeight: 600 }}>
    {PRIVACY_EMAIL}
  </a>
);

const LegalPage: React.FC<{ title: string; intro: string; children: React.ReactNode }> = ({ title, intro, children }) => {
  useEffect(() => {
    document.title = `${title} · MercadoFlow`;
  }, [title]);

  return (
    <div className="fx-app" style={{ minHeight: '100vh', background: '#f4f8f6' }}>
      <header className="fx-top">
        <Link to="/" className="fx-brand" style={{ textDecoration: 'none', color: 'inherit' }}>
          <span className="fx-logo" aria-hidden="true">MF</span><span className="fx-brandname">MercadoFlow</span>
        </Link>
      </header>
      <main style={{ maxWidth: 820, margin: '0 auto', padding: '24px 16px 64px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 'clamp(26px, 4vw, 38px)', letterSpacing: '-.02em', lineHeight: 1.15, color: '#10231c' }}>{title}</h1>
          <p style={{ margin: '8px 0 0', color: '#4f6159' }}>{intro} Atualizada em {UPDATED_AT}.</p>
        </div>
        {children}
        <p style={{ margin: '8px 0 0', fontSize: 14, color: '#4f6159', textAlign: 'center' }}>
          <Link to="/privacidade" style={{ color: '#045e48' }}>Política de privacidade</Link>
          {' · '}
          <Link to="/termos" style={{ color: '#045e48' }}>Termos de uso</Link>
          {' · '}
          <a href="/bipae/privacidade.html" style={{ color: '#045e48' }}>Privacidade do Bipaê</a>
          <br />
          MercadoFlow · {CONTROLLER} · CNPJ {CONTROLLER_CNPJ}
        </p>
      </main>
    </div>
  );
};

export default LegalPage;
