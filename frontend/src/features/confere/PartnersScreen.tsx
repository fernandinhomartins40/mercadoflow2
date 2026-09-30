import React, { useState } from 'react';
import { Factory, ShieldCheck } from 'lucide-react';
import { confereService } from '../../services/confere.service';
import type { ConfereStatus } from '../../types/confere.types';
import { BigButton, Shell, TopBar, errorText } from './ui';

/**
 * Parceria com fabricantes: por padrão o mercado só entra nos números
 * agregados e anônimos. Aqui ele escolhe, se quiser, aparecer com o nome para
 * os fabricantes dos produtos que compra — e receber ofertas feitas para ele.
 */
const PartnersScreen: React.FC<{ status: ConfereStatus; marketId: string; onChange: (s: ConfereStatus) => void }> = ({ status, marketId, onChange }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agree, setAgree] = useState(false);
  const on = status.manufacturerVisibility;

  const save = async (visible: boolean) => {
    setBusy(true);
    setError(null);
    try {
      onChange(await confereService.setManufacturerVisibility(marketId, visible));
      setAgree(false);
    } catch (e) {
      setError(errorText(e, 'Não foi possível salvar a sua escolha.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      <TopBar title="Fabricantes" />
      <div className="flex flex-col gap-4 px-4 pb-10">
        <section className="rounded-3xl bg-white p-5">
          <ShieldCheck className="h-9 w-9 text-green-700" aria-hidden="true" />
          <h2 className="mt-2 text-xl font-extrabold">Como já é hoje</h2>
          <p className="mt-1 text-lg text-stone-700">
            As notas entram nos números do ecossistema só somadas com as de outros mercados da região, sem o nome do seu mercado
            e sem o do fornecedor. Um bairro ou cidade só aparece quando tem várias lojas, para ninguém descobrir quem é quem.
          </p>
        </section>

        <section className={`rounded-3xl p-5 ${on ? 'bg-green-700 text-white' : 'bg-white'}`}>
          <Factory className={`h-9 w-9 ${on ? 'text-yellow-300' : 'text-green-700'}`} aria-hidden="true" />
          <h2 className="mt-2 text-xl font-extrabold">{on ? 'Você aparece para os fabricantes' : 'Receber ofertas dos fabricantes'}</h2>
          <p className={`mt-1 text-lg ${on ? 'text-green-50' : 'text-stone-700'}`}>
            Se você autorizar, os fabricantes dos produtos que você compra veem o nome e o bairro do seu mercado e quanto você
            comprou de cada produto deles, por mês. Com isso eles podem oferecer preço e condição feitos para o seu volume.
            Preço de venda, clientes e o fornecedor de cada nota nunca aparecem.
          </p>
          {on && status.manufacturerVisibilityAt && (
            <p className="mt-2 text-base font-semibold">Autorizado em {new Date(status.manufacturerVisibilityAt).toLocaleDateString('pt-BR')}. Você pode retirar quando quiser.</p>
          )}
        </section>

        {error && <p role="alert" className="rounded-2xl bg-red-50 p-4 text-lg text-red-800">{error}</p>}

        {on ? (
          <BigButton tone="white" onClick={() => save(false)} disabled={busy}>{busy ? 'Salvando…' : 'Retirar a autorização'}</BigButton>
        ) : (
          <>
            <label className="flex items-start gap-3 rounded-2xl bg-white p-4 text-base">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1 h-6 w-6 shrink-0 accent-green-700" />
              <span>Autorizo o MercadoFlow a mostrar o nome e o bairro de <strong>{status.marketName}</strong> e as quantidades compradas aos fabricantes desses produtos.</span>
            </label>
            <BigButton onClick={() => save(true)} disabled={busy || !agree}>{busy ? 'Salvando…' : 'Autorizar'}</BigButton>
          </>
        )}
      </div>
    </Shell>
  );
};

export default PartnersScreen;
