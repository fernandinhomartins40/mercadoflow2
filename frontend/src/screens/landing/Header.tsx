import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Menu, X } from 'lucide-react';
import { LANDING } from './theme';

/** Altura do cabeçalho fixo; usada para a rolagem não esconder o título da seção. */
const HEADER_OFFSET = 76;

/** Anel de foco visível e consistente em todo o topo da página. */
export const FOCUS_RING =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#047857]';

/**
 * Rola suavemente até a seção (#id) descontando o cabeçalho fixo. Respeita quem
 * pediu menos movimento no sistema. Se a seção não existir, deixa o link seguir.
 */
export const scrollToSection = (e: React.MouseEvent<HTMLAnchorElement>, hash: string) => {
  const el = document.getElementById(hash.replace('#', ''));
  if (!el) return;
  e.preventDefault();
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const top = el.getBoundingClientRect().top + window.scrollY - HEADER_OFFSET;
  window.scrollTo({ top, behavior: reduce ? 'auto' : 'smooth' });
  if (window.history?.replaceState) window.history.replaceState(null, '', hash);
};

const NAV = [
  { href: '#funcionalidades', label: 'Funcionalidades' },
  { href: '#como-funciona', label: 'Como funciona' },
  { href: '#planos', label: 'Planos' },
];

const Header: React.FC = () => {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Fecha o menu do celular com Esc e ao voltar para tela larga.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onResize = () => window.innerWidth >= 1024 && setOpen(false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  const solid = scrolled || open;

  return (
    <header
      className="sticky top-0 z-50 transition-[background-color,box-shadow,border-color] duration-200"
      style={{
        background: solid ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0)',
        backdropFilter: solid ? 'saturate(180%) blur(14px)' : undefined,
        WebkitBackdropFilter: solid ? 'saturate(180%) blur(14px)' : undefined,
        borderBottom: `1px solid ${solid ? LANDING.line : 'transparent'}`,
      }}
    >
      <div className="mx-auto flex h-[68px] w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link to="/" className={`flex min-h-[44px] items-center rounded-md no-underline ${FOCUS_RING}`} aria-label="MercadoFlow, página inicial">
          <img src="/logomercadoflow-color.png" alt="MercadoFlow" className="h-7 w-auto sm:h-8" />
        </Link>

        <nav aria-label="Navegação principal" className="hidden items-center gap-8 lg:flex">
          {NAV.map((n) => (
            <a
              key={n.href}
              href={n.href}
              onClick={(e) => scrollToSection(e, n.href)}
              className={`inline-flex min-h-[44px] items-center rounded-md text-sm font-medium no-underline transition-colors hover:text-[#0f172a] ${FOCUS_RING}`}
              style={{ color: LANDING.text }}
            >
              {n.label}
            </a>
          ))}
          <Link
            to="/para-industria"
            className={`inline-flex min-h-[44px] items-center rounded-md text-sm font-semibold no-underline transition-colors hover:text-[#065f46] ${FOCUS_RING}`}
            style={{ color: LANDING.green700 }}
          >
            Para indústria
          </Link>
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            to="/login"
            className={`hidden min-h-[44px] items-center rounded-lg px-3 text-sm font-semibold no-underline transition-colors hover:bg-slate-100 sm:inline-flex ${FOCUS_RING}`}
            style={{ color: LANDING.ink }}
          >
            Entrar
          </Link>
          <Link
            to="/register"
            className={`hidden min-h-[44px] items-center gap-1.5 rounded-full px-5 text-sm font-semibold text-white no-underline shadow-sm transition-colors hover:bg-[#065f46] sm:inline-flex ${FOCUS_RING}`}
            style={{ background: LANDING.green900 }}
          >
            Começar grátis
          </Link>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={open}
            aria-controls="landing-menu-celular"
            className={`inline-flex h-11 w-11 items-center justify-center rounded-lg transition-colors hover:bg-slate-100 lg:hidden ${FOCUS_RING}`}
            style={{ color: LANDING.ink }}
          >
            {open ? <X className="h-6 w-6" aria-hidden /> : <Menu className="h-6 w-6" aria-hidden />}
          </button>
        </div>
      </div>

      {open && (
        <nav
          id="landing-menu-celular"
          aria-label="Menu"
          className="border-t lg:hidden"
          style={{ borderColor: LANDING.line, background: '#ffffff' }}
        >
          <ul className="mx-auto flex w-full max-w-6xl flex-col px-4 py-3 sm:px-6">
            {NAV.map((n) => (
              <li key={n.href}>
                <a
                  href={n.href}
                  onClick={(e) => {
                    setOpen(false);
                    scrollToSection(e, n.href);
                  }}
                  className={`flex min-h-[48px] items-center rounded-lg px-2 text-base font-medium no-underline hover:bg-slate-50 ${FOCUS_RING}`}
                  style={{ color: LANDING.ink }}
                >
                  {n.label}
                </a>
              </li>
            ))}
            <li>
              <Link
                to="/para-industria"
                onClick={() => setOpen(false)}
                className={`flex min-h-[48px] items-center rounded-lg px-2 text-base font-semibold no-underline hover:bg-slate-50 ${FOCUS_RING}`}
                style={{ color: LANDING.green700 }}
              >
                Para indústria
              </Link>
            </li>
            <li className="mt-3 grid grid-cols-2 gap-3 border-t pt-4" style={{ borderColor: LANDING.line }}>
              <Link
                to="/login"
                className={`flex min-h-[48px] items-center justify-center rounded-full border text-sm font-semibold no-underline ${FOCUS_RING}`}
                style={{ color: LANDING.ink, borderColor: LANDING.line }}
              >
                Entrar
              </Link>
              <Link
                to="/register"
                className={`flex min-h-[48px] items-center justify-center gap-1.5 rounded-full text-sm font-semibold text-white no-underline ${FOCUS_RING}`}
                style={{ background: LANDING.green900 }}
              >
                Começar grátis <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
};

export default Header;
