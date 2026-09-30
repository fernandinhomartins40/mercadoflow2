import React from 'react';

/** Marca no alto das telas de entrada (login, cadastro, super-admin). */
const AuthBrand: React.FC<{ badge?: string }> = ({ badge }) => (
  <div className="flex items-center gap-3">
    <span className="lg-tinted flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-sm font-bold" aria-hidden="true">MF</span>
    <span className="min-w-0 flex-1 text-lg font-bold tracking-tight text-[#1d1d1f]">MercadoFlow</span>
    {badge ? <span className="lg-st-green rounded-full px-3 py-1 text-xs font-semibold">{badge}</span> : null}
  </div>
);

export default AuthBrand;
