import React, { useState } from 'react';
import { ExternalLink, Loader2, LocateFixed, MapPin, RefreshCw } from 'lucide-react';
import { Card, Chip, PanelTitle, brl } from '../flow/Flow';
import { useCached, invalidateCached } from '../../hooks/useCached';
import { localPriceService, positionOf, type LocalPriceSnapshot } from '../../services/localPrice.service';

/**
 * "Preço na vizinhança" — só para lojas no Paraná, e a tela diz isso com todas
 * as letras: é o único estado com portal público (Menor Preço, do Nota
 * Paraná) que busca preço por código de barras e localização.
 *
 * Com {@code productId}, mostra o preço daquele produto nas lojas próximas;
 * sem, mostra o estado da função (localização da loja e cobertura).
 */
const errorText = (e: unknown, fallback: string) =>
  (e as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;

const NeighborhoodPrice: React.FC<{ marketId: string; productId?: string; ownPrice?: number | null }> = ({ marketId, productId, ownPrice }) => {
  const status = useCached(`${marketId}:vizinhanca`, () => localPriceService.status(marketId), 60_000);
  const snap = useCached<LocalPriceSnapshot[]>(productId && status.data?.available ? `${marketId}:vizinhanca:${productId}` : null,
    () => localPriceService.products(marketId, [productId!]), 5 * 60_000);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const st = status.data;
  const s = snap.data?.[0] ?? null;

  const locate = () => {
    if (!navigator.geolocation) { setNote('Este navegador não informa a localização.'); return; }
    setBusy(true); setNote(null);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        await localPriceService.setLocation(marketId, pos.coords.latitude, pos.coords.longitude);
        invalidateCached(`${marketId}:vizinhanca`);
        await status.refresh();
        setNote('Localização da loja salva.');
      } catch (e) {
        setNote(errorText(e, 'Não foi possível salvar a localização.'));
      } finally {
        setBusy(false);
      }
    }, () => { setBusy(false); setNote('Permita o acesso à localização, de preferência estando na loja.'); }, { enableHighAccuracy: true, timeout: 15000 });
  };

  const refresh = async () => {
    setBusy(true); setNote(null);
    try {
      await localPriceService.refresh(marketId);
      setNote('Buscando agora os 60 produtos que mais vendem. Leva alguns minutos; volte daqui a pouco.');
      invalidateCached(`${marketId}:vizinhanca`);
    } catch (e) {
      setNote(errorText(e, 'Não foi possível buscar agora.'));
    } finally {
      setBusy(false);
    }
  };

  const source = st && (
    <p className="fx-muted" style={{ margin: '12px 0 0', fontSize: 12.5 }}>
      Fonte: <a href={st.providerUrl} target="_blank" rel="noopener noreferrer">{st.provider} <ExternalLink size={11} aria-hidden="true" /></a>, com
      os preços das notas fiscais das lojas a até 10 km. Só o Paraná oferece esse serviço.
    </p>
  );

  if (!st) return <Card><Loader2 className="animate-spin" aria-label="Carregando" /></Card>;

  if (!st.inParana) {
    return (
      <Card>
        <PanelTitle icon={MapPin} title="Preço na vizinhança" sub="Só para lojas no Paraná" />
        <p style={{ margin: '12px 0 0', lineHeight: 1.55 }}>{st.onlyParana}</p>
        <p className="fx-muted" style={{ margin: '8px 0 0', fontSize: 13.5 }}>
          {st.knownLocation ? `Sua loja está em ${st.city ?? 'outra cidade'}${st.uf ? ` (${st.uf})` : ''}.` : 'O endereço da loja ainda não chegou pelas notas.'}{' '}
          Outros estados não têm portal aberto para isso: a Bahia exige captcha, e o Menor Preço Brasil exige login GOV.BR.
        </p>
      </Card>
    );
  }

  const header = (
    <PanelTitle icon={MapPin} title="Preço na vizinhança"
      sub={st.geoSource === 'LOJA' ? `Lojas a até 10 km da sua loja${st.city ? `, em ${st.city}` : ''}` : `Lojas a até 10 km do centro de ${st.city ?? 'sua cidade'}`}
      right={st.geoSource !== 'LOJA' ? (
        <button type="button" className="fx-btn ghost small" onClick={locate} disabled={busy}><LocateFixed aria-hidden="true" />Marcar a loja</button>
      ) : undefined} />
  );

  if (!productId) {
    return (
      <Card>
        {header}
        <p style={{ margin: '12px 0 0' }}>
          {st.productsChecked > 0
            ? <>{st.productsWithReference} de {st.productsChecked} produtos consultados têm referência na vizinhança{st.lastCollectedOn ? ` (última busca ${new Date(st.lastCollectedOn).toLocaleDateString('pt-BR', { timeZone: 'UTC' })})` : ''}.</>
            : 'Ainda nenhum produto consultado. A busca roda toda madrugada, pelos produtos que mais vendem.'}
        </p>
        <div className="fx-actions" style={{ marginTop: 12 }}>
          <button type="button" className="fx-btn dark small" onClick={refresh} disabled={busy || st.running}>
            {busy || st.running ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}{st.running ? 'Buscando…' : 'Buscar agora'}
          </button>
        </div>
        {note && <p role="status" className="fx-muted" style={{ margin: '10px 0 0', fontSize: 13.5 }}>{note}</p>}
        {source}
      </Card>
    );
  }

  const own = ownPrice ?? (s?.own_price != null ? Number(s.own_price) : null);
  const pos = positionOf(own, s);
  return (
    <Card>
      {header}
      {!s ? (
        <p style={{ margin: '12px 0 0' }}>Este produto ainda não foi consultado. Ele entra na busca da madrugada se estiver entre os que mais vendem.</p>
      ) : s.status !== 'OK' ? (
        <p style={{ margin: '12px 0 0' }}>
          {s.status === 'POUCAS_LOJAS'
            ? `Só ${s.stores} ${s.stores === 1 ? 'loja informou' : 'lojas informaram'} este código de barras por perto: pouco para dizer qual é o preço da região.`
            : 'Nenhuma loja por perto informou este código de barras nos últimos 15 dias.'}
        </p>
      ) : (
        <>
          <div className="fx-kpis" style={{ marginTop: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
            <div className="fx-kpi"><span>Preço típico</span><b className="fx-num">{brl(s.p25_price)} a {brl(s.p75_price)}</b><small className="fx-muted">mediana {brl(s.median_price)}</small></div>
            <div className="fx-kpi"><span>Mais barato</span><b className="fx-num">{brl(s.min_price)}</b><small className="fx-muted">{s.min_store}{s.min_distance_km != null ? `, a ${Number(s.min_distance_km).toFixed(1).replace('.', ',')} km` : ''}</small></div>
            <div className="fx-kpi"><span>Seu preço</span><b className="fx-num">{own != null ? brl(own) : '—'}</b><span><Chip tone={pos.tone}>{pos.text}</Chip></span></div>
          </div>
          <p className="fx-muted" style={{ margin: '10px 0 0', fontSize: 13 }}>
            {s.stores} lojas a até {s.radius_km} km, preços dos últimos 15 dias{s.discarded > 0 ? `; ${s.discarded} descartados (outro produto no mesmo código, fardo, bar ou posto, preço fora da curva)` : ''}.
          </p>
        </>
      )}
      {note && <p role="status" className="fx-muted" style={{ margin: '10px 0 0', fontSize: 13.5 }}>{note}</p>}
      {source}
    </Card>
  );
};

export default NeighborhoodPrice;

/** Linha curta para a hora de decidir preço de promoção ou liquidação. */
export const NeighborhoodLine: React.FC<{ snapshot: LocalPriceSnapshot | null | undefined }> = ({ snapshot: s }) => {
  if (!s || s.status !== 'OK') return null;
  return (
    <p className="fx-muted" style={{ margin: '8px 0 0', fontSize: 13 }}>
      <MapPin size={13} aria-hidden="true" style={{ verticalAlign: '-2px' }} /> Na vizinhança (Menor Preço, PR): {brl(s.p25_price)} a {brl(s.p75_price)};
      mais barato {brl(s.min_price)}{s.min_store ? ` em ${s.min_store}` : ''}{s.min_distance_km != null ? `, a ${Number(s.min_distance_km).toFixed(1).replace('.', ',')} km` : ''}.
    </p>
  );
};
