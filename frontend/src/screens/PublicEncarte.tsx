import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Instagram, MapPin, MessageCircle, Phone, Share2 } from 'lucide-react';
import { artService } from '../services/art.service';
import type { PublicCampaign } from '../types/art.types';
import { brDate, formatPrice } from '../features/art-studio/render';

/**
 * Página de ofertas que o mercado manda no WhatsApp. Abre sem login, pensada
 * para o celular: as artes em sequência e, embaixo, a lista em texto (quem não
 * enxerga bem a arte ou tem internet fraca ainda lê o preço).
 */

const ORDER = ['story', 'post', 'square', 'a4', 'tv'];

const PublicEncarte: React.FC = () => {
  const { slug } = useParams();
  const [data, setData] = useState<PublicCampaign | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!slug) return;
    artService.publicCampaign(slug).then((d) => {
      setData(d);
      document.title = `${d.title} | ${d.marketName}`;
    }).catch(() => setMissing(true));
  }, [slug]);

  if (missing) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-stone-50 p-6 text-center">
        <div>
          <h1 className="text-xl font-bold text-stone-900">Estas ofertas não estão mais no ar</h1>
          <p className="mt-2 text-stone-600">Peça ao mercado o link do encarte novo.</p>
        </div>
      </main>
    );
  }
  if (!data) {
    return <main className="flex min-h-screen items-center justify-center bg-stone-50"><div className="h-8 w-8 animate-spin rounded-full border-2 border-red-600 border-t-transparent" role="status" aria-label="Carregando as ofertas" /></main>;
  }

  // No celular a arte em pé é a que se lê melhor.
  const sorted = [...data.images].sort((a, b) => ORDER.indexOf(a.format) - ORDER.indexOf(b.format));
  const images = sorted.some((img) => img.format !== 'tv') ? sorted.filter((img) => img.format !== 'tv') : sorted;
  const whatsapp = data.whatsapp?.replace(/\D/g, '');
  const validity = data.validUntil
    ? `Válidas ${data.validFrom ? `de ${brDate(data.validFrom)} ` : ''}até ${brDate(data.validUntil)} ou enquanto durarem os estoques`
    : 'Enquanto durarem os estoques';

  const share = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try { await navigator.share({ title: data.title, text: `${data.title} — ${data.marketName}`, url }); return; } catch { /* cancelado */ }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(`${data.title} — ${data.marketName}: ${url}`)}`, '_blank');
  };

  return (
    <main className="min-h-screen bg-stone-100 pb-28">
      <header className="bg-white">
        <div className="mx-auto flex max-w-xl items-center gap-3 px-4 py-4">
          {data.logoUrl
            ? <img src={data.logoUrl} alt={data.marketName} className="h-12 w-12 rounded-lg object-contain" />
            : <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-red-600 text-lg font-bold text-white">{data.marketName.charAt(0)}</span>}
          <div className="min-w-0">
            <p className="truncate font-semibold text-stone-900">{data.marketName}</p>
            {data.addressLine && <p className="flex items-center gap-1 truncate text-sm text-stone-600"><MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{data.addressLine}</p>}
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-xl px-4 pt-5">
        <h1 className="text-2xl font-extrabold leading-tight text-stone-900">{data.title}</h1>
        <p className="mt-1 text-sm text-stone-600">{validity}</p>
      </section>

      <section className="mx-auto mt-4 flex max-w-xl flex-col gap-4 px-4" aria-label="Artes do encarte">
        {images.map((img) => (
          <img key={img.url} src={img.url} alt={`Encarte ${data.title}`} className="w-full rounded-xl bg-white shadow-md" loading="lazy"
            width={img.width || undefined} height={img.height || undefined} />
        ))}
      </section>

      {data.products.length > 0 && (
        <section className="mx-auto mt-6 max-w-xl px-4" aria-labelledby="lista">
          <h2 id="lista" className="text-lg font-bold text-stone-900">Todas as ofertas</h2>
          <ul className="mt-3 divide-y divide-stone-200 overflow-hidden rounded-xl bg-white">
            {data.products.filter((p) => p.price != null).map((p, i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-stone-900">{p.name}</p>
                  <p className="text-sm text-stone-600">{[p.detail, p.deal].filter(Boolean).join(', ')}</p>
                </div>
                <div className="text-right tabular-nums">
                  {p.oldPrice != null && p.price != null && p.oldPrice > p.price && <p className="text-xs text-stone-500 line-through">{formatPrice(p.oldPrice)}</p>}
                  <p className="text-lg font-extrabold text-red-700">{formatPrice(p.price)}</p>
                  {p.unit && p.unit !== 'un' && <p className="text-xs text-stone-500">{p.unit === 'kg' ? 'o kg' : p.unit}</p>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="mx-auto mt-6 flex max-w-xl flex-col gap-2 px-4 text-sm text-stone-600">
        {data.phone && <a href={`tel:${data.phone.replace(/\D/g, '')}`} className="flex items-center gap-2"><Phone className="h-4 w-4" aria-hidden="true" />{data.phone}</a>}
        {data.instagram && <a href={`https://instagram.com/${data.instagram.replace(/^@/, '')}`} target="_blank" rel="noreferrer" className="flex items-center gap-2"><Instagram className="h-4 w-4" aria-hidden="true" />@{data.instagram.replace(/^@/, '')}</a>}
      </footer>

      <div className="fixed inset-x-0 bottom-0 border-t border-stone-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-xl gap-2 px-4 py-3">
          {whatsapp && (
            <a href={`https://wa.me/${whatsapp.length <= 11 ? `55${whatsapp}` : whatsapp}?text=${encodeURIComponent(`Olá! Vi as ofertas "${data.title}".`)}`} target="_blank" rel="noreferrer"
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-green-600 font-semibold text-white">
              <MessageCircle className="h-5 w-5" aria-hidden="true" />Chamar no WhatsApp
            </a>
          )}
          <button type="button" onClick={share} className={`flex h-12 items-center justify-center gap-2 rounded-xl border border-stone-300 font-semibold text-stone-800 ${whatsapp ? 'px-4' : 'flex-1'}`}>
            <Share2 className="h-5 w-5" aria-hidden="true" />Compartilhar
          </button>
        </div>
      </div>
    </main>
  );
};

export default PublicEncarte;
