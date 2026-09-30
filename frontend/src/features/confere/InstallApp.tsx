import React, { useEffect, useState } from 'react';
import { Download, Share, SquarePlus, X } from 'lucide-react';

/**
 * Botão "Instalar o app".
 *
 * Android (Chrome, Edge, Samsung): o navegador avisa que dá para instalar
 * (beforeinstallprompt) e nós mostramos o botão que abre o convite. iPhone:
 * o Safari não tem convite — o jeito é Compartilhar → "Adicionar à Tela de
 * Início", então mostramos o passo a passo. Instalado, o botão some.
 */

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// O evento pode chegar antes da tela montar: guardamos desde o carregamento do módulo.
let deferred: InstallEvent | null =
  typeof window !== 'undefined' ? ((window as unknown as { __confereInstall?: InstallEvent }).__confereInstall ?? null) : null;
const listeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}

const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const InstallApp: React.FC<{ tone?: 'light' | 'dark' }> = ({ tone = 'light' }) => {
  const [, force] = useState(0);
  const [iosHelp, setIosHelp] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);

  if (done || isStandalone()) return null;
  const ios = isIos();
  if (!deferred && !ios) return null;

  const install = async () => {
    if (ios) { setIosHelp(true); return; }
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    if (choice.outcome === 'accepted') setDone(true);
    deferred = null;
  };

  return (
    <>
      {tone === 'dark' ? (
        <button type="button" onClick={install}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#B6F36A] text-lg font-bold text-[#0F1A14]">
          <Download className="h-5 w-5" aria-hidden="true" />Instalar o app no celular
        </button>
      ) : (
        <button type="button" onClick={install}
          className="flex w-full items-center gap-3 rounded-3xl bg-white p-4 text-left ring-1 ring-[#DCE5DF] active:scale-[0.99]">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#E3F4EA] text-[#0A7A3D]"><Download className="h-5 w-5" aria-hidden="true" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-bold">Instalar o app no celular</span>
            <span className="block text-sm text-[#5B6B62]">Abre direto da tela inicial, em tela cheia</span>
          </span>
        </button>
      )}
      {iosHelp && (
        <div className="fixed inset-0 z-40 flex items-end bg-black/50" role="dialog" aria-modal="true" aria-labelledby="ios-install-title" onClick={() => setIosHelp(false)}>
          <div className="w-full rounded-t-3xl bg-white p-6 pb-10" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 id="ios-install-title" className="text-2xl font-extrabold">Instalar no iPhone</h2>
              <button type="button" onClick={() => setIosHelp(false)} aria-label="Fechar" className="flex h-12 w-12 items-center justify-center rounded-full bg-stone-100"><X className="h-6 w-6" /></button>
            </div>
            <ol className="mt-4 flex flex-col gap-4 text-lg">
              <li className="flex items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100 font-bold text-green-800">1</span>
                <span>Toque em <Share className="inline h-6 w-6 text-blue-600" aria-label="Compartilhar" /> <strong>Compartilhar</strong>, na barra do Safari.</span></li>
              <li className="flex items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100 font-bold text-green-800">2</span>
                <span>Escolha <SquarePlus className="inline h-6 w-6" aria-hidden="true" /> <strong>Adicionar à Tela de Início</strong>.</span></li>
              <li className="flex items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100 font-bold text-green-800">3</span>
                <span>Toque em <strong>Adicionar</strong>. O Confere aparece junto dos seus apps.</span></li>
            </ol>
            <p className="mt-4 text-base text-stone-600">Precisa ser no Safari: outros navegadores do iPhone não instalam apps.</p>
          </div>
        </div>
      )}
    </>
  );
};

export default InstallApp;
