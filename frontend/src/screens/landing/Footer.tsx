import React from 'react';
import { Link } from 'react-router-dom';
import { Container, LANDING } from './theme';

type FooterLink = { label: string; href?: string; to?: string };

const CONTACT_EMAIL = 'fuseagencia10@gmail.com';

const COLUMNS: { title: string; links: FooterLink[] }[] = [
  {
    title: 'Produto',
    links: [
      { label: 'Funcionalidades', href: '#funcionalidades' },
      { label: 'Planos', href: '#planos' },
      { label: 'Para indústria', to: '/para-industria' },
      { label: 'Como funciona', href: '#como-funciona' },
      { label: 'Baixar agente', to: '/download-agente' },
    ],
  },
  {
    title: 'Empresa',
    links: [
      // A seção "Por que MercadoFlow" precisa ter id="por-que-mercadoflow".
      { label: 'Sobre o MercadoFlow', href: '#por-que-mercadoflow' },
      { label: 'Política de privacidade', to: '/privacidade' },
      { label: 'Termos de uso', to: '/termos' },
      { label: 'Contrato de tratamento de dados', to: '/contrato-operador' },
    ],
  },
  {
    title: 'Contato',
    links: [
      { label: CONTACT_EMAIL, href: `mailto:${CONTACT_EMAIL}` },
      { label: 'Ajuda e suporte', href: `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Ajuda e suporte MercadoFlow')}` },
      { label: 'Administração', to: '/super-admin/login' },
    ],
  },
];

// #94a3b8 sobre #0f172a dá 6,9:1 (AA); o hover clareia para quase branco.
const LINK_COLOR = '#94a3b8';
const LINK_HOVER = '#f1f5f9';
const linkClass =
  'inline-flex min-h-[44px] max-w-full items-center break-all text-sm no-underline transition-colors sm:break-normal';

const FooterAnchor: React.FC<{ link: FooterLink }> = ({ link }) => {
  const handlers = {
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => (e.currentTarget.style.color = LINK_HOVER),
    onMouseLeave: (e: React.MouseEvent<HTMLElement>) => (e.currentTarget.style.color = LINK_COLOR),
  };
  return link.to ? (
    <Link to={link.to} className={linkClass} style={{ color: LINK_COLOR }} {...handlers}>
      {link.label}
    </Link>
  ) : (
    <a href={link.href} className={linkClass} style={{ color: LINK_COLOR }} {...handlers}>
      {link.label}
    </a>
  );
};

/** Rodapé em azul-marinho: marca, três colunas de links e linha da empresa. */
const Footer: React.FC = () => (
  <footer style={{ background: LANDING.navy, borderTop: `1px solid ${LANDING.navy800}` }} className="pb-8 pt-14">
    <Container>
      <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1.2fr_1.2fr] lg:gap-8">
        <div className="min-w-0">
          <Link to="/" className="inline-flex min-h-[44px] items-center no-underline" aria-label="MercadoFlow, início">
            <img src="/logomercadoflow-branco.png" alt="MercadoFlow" className="h-7 w-auto" />
          </Link>
          <p className="mt-3 max-w-xs text-sm leading-relaxed" style={{ color: LINK_COLOR }}>
            Inteligência de dados para o varejo alimentar. Transforme os dados do seu PDV em melhores decisões.
          </p>
        </div>

        {COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title} className="min-w-0">
            <h3 className="text-sm font-semibold text-white">{col.title}</h3>
            <ul className="mt-2 flex flex-col">
              {col.links.map((l) => (
                <li key={l.label}>
                  <FooterAnchor link={l} />
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="mt-10 border-t pt-6" style={{ borderColor: LANDING.navy800 }}>
        <p className="text-center text-xs leading-relaxed sm:text-left" style={{ color: LINK_COLOR }}>
          &copy; {new Date().getFullYear()} MercadoFlow · FUSE AGENCIA LTDA · CNPJ 42.761.086/0001-15
        </p>
      </div>
    </Container>
  </footer>
);

export default Footer;
