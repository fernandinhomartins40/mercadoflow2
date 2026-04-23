import React from 'react';
import { Copy, Factory } from 'lucide-react';
import Button from '../../components/common/Button';
import OfferProductImage from '../../components/offers/OfferProductImage';
import type {
  OfferCampaignKit,
  OfferCatalogProduct,
  OfferMarketProfile,
  OfferOverview,
} from '../../types/offers.types';
import {
  StudioAssetStatus,
  StudioCollapsibleSection,
  StudioSearchResultCard,
  StudioSelectField,
} from './StudioPrimitives';

type SelectOption = { value: string; label: string };

type OfferStudioMarketingPanelsProps = {
  activeTool: string;
  collapsedConfigSections: Record<string, boolean | undefined>;
  toggleConfigSection: (key: string) => void;
  selectedBrandKitId: string;
  setSelectedBrandKitId: (value: string) => void;
  brandKitOptions: SelectOption[];
  selectedCampaignKitId: string;
  setSelectedCampaignKitId: (value: string) => void;
  campaignKitOptions: SelectOption[];
  marketProfile: OfferMarketProfile | null;
  handleMarketProfileField: (field: string, value: string) => void;
  handleUploadMarketLogo: (slot: 'PRIMARY' | 'SECONDARY', file?: File) => void;
  uploadingAsset: string | null;
  handleSaveMarketProfile: () => void;
  savingMarketProfile: boolean;
  selectedCampaignKit: OfferCampaignKit | null;
  overview: OfferOverview | null;
  selectedProductIds: Set<string>;
  addProductById: (productId: string) => void;
  handleCopyText: () => void;
  copying: boolean;
  textMode: string;
  setTextMode: (value: string) => void;
  colorMode: string;
  setColorMode: (value: string) => void;
  footerMode: string;
  setFooterMode: (value: string) => void;
  campaignKicker: string;
  setCampaignKicker: (value: string) => void;
  campaignBadgeLabel: string;
  setCampaignBadgeLabel: (value: string) => void;
  campaignHeadline: string;
  setCampaignHeadline: (value: string) => void;
  campaignSubheadline: string;
  setCampaignSubheadline: (value: string) => void;
  socialCopy: string;
  textModeOptions: SelectOption[];
  colorModeOptions: SelectOption[];
  footerOptions: SelectOption[];
};

const OfferStudioMarketingPanels: React.FC<OfferStudioMarketingPanelsProps> = ({
  activeTool,
  collapsedConfigSections,
  toggleConfigSection,
  selectedBrandKitId,
  setSelectedBrandKitId,
  brandKitOptions,
  selectedCampaignKitId,
  setSelectedCampaignKitId,
  campaignKitOptions,
  marketProfile,
  handleMarketProfileField,
  handleUploadMarketLogo,
  uploadingAsset,
  handleSaveMarketProfile,
  savingMarketProfile,
  selectedCampaignKit,
  overview,
  selectedProductIds,
  addProductById,
  handleCopyText,
  copying,
  textMode,
  setTextMode,
  colorMode,
  setColorMode,
  footerMode,
  setFooterMode,
  campaignKicker,
  setCampaignKicker,
  campaignBadgeLabel,
  setCampaignBadgeLabel,
  campaignHeadline,
  setCampaignHeadline,
  campaignSubheadline,
  setCampaignSubheadline,
  socialCopy,
  textModeOptions,
  colorModeOptions,
  footerOptions,
}) => {
  if (activeTool !== 'customize') return null;

  return (
    <div className="offer-studio-panel-stack">
      <div className="offer-studio-panel-header compact">
        <div>
          <span className="section-kicker">Personalizar</span>
          <h2>Ajuste seu encarte</h2>
        </div>
        <Button type="button" variant="secondary" onClick={handleCopyText} disabled={copying}>
          <Copy size={16} strokeWidth={2.1} />
          {copying ? 'Copiando...' : 'Copiar texto'}
        </Button>
      </div>

      {/* ── Identidade visual ──────────────────────────────────── */}
      <StudioCollapsibleSection
        title="Identidade visual"
        description="Escolha o estilo visual e o tema do encarte."
        collapsed={Boolean(collapsedConfigSections.brandIdentity)}
        onToggle={() => toggleConfigSection('brandIdentity')}
      >
        <div className="offer-studio-edit-grid">
          <StudioSelectField
            label="Estilo visual"
            value={selectedBrandKitId}
            onChange={setSelectedBrandKitId}
            options={brandKitOptions.length ? brandKitOptions : [{ value: '', label: 'Estilo padrão' }]}
          />
          <StudioSelectField
            label="Tema da campanha"
            value={selectedCampaignKitId}
            onChange={setSelectedCampaignKitId}
            options={campaignKitOptions.length ? campaignKitOptions : [{ value: '', label: 'Sem tema' }]}
          />
        </div>
        {selectedCampaignKit && (
          <div className="mt-3 rounded-xl border border-gray-200 bg-white/85 px-4 py-3 text-sm text-gray-500">
            <strong className="block text-base text-gray-900">{selectedCampaignKit.name}</strong>
            {selectedCampaignKit.description && <p className="mt-1">{selectedCampaignKit.description}</p>}
          </div>
        )}
      </StudioCollapsibleSection>

      {/* ── Textos do encarte ──────────────────────────────────── */}
      <StudioCollapsibleSection
        title="Textos do encarte"
        description="Defina o título, subtítulo e selo que aparecem no topo do encarte."
        collapsed={Boolean(collapsedConfigSections.copyText)}
        onToggle={() => toggleConfigSection('copyText')}
      >
        <div className="offer-studio-edit-grid">
          <label className="offer-studio-text-field">
            <span>Chamada (topo)</span>
            <input className="input" value={campaignKicker} onChange={(event) => setCampaignKicker(event.target.value)} placeholder="Ex.: Ofertão da semana" />
          </label>
          <label className="offer-studio-text-field">
            <span>Selo de destaque</span>
            <input className="input" value={campaignBadgeLabel} onChange={(event) => setCampaignBadgeLabel(event.target.value)} placeholder="Ex.: Oferta" />
          </label>
          <label className="offer-studio-text-field md:col-span-2">
            <span>Título principal</span>
            <input className="input" value={campaignHeadline} onChange={(event) => setCampaignHeadline(event.target.value)} placeholder="Ex.: Ofertas da semana" />
          </label>
          <label className="offer-studio-text-field md:col-span-2">
            <span>Subtítulo</span>
            <textarea
              className="textarea"
              rows={3}
              value={campaignSubheadline}
              onChange={(event) => setCampaignSubheadline(event.target.value)}
              placeholder="Ex.: Confira as melhores ofertas selecionadas para você."
            />
          </label>
        </div>
      </StudioCollapsibleSection>

      {/* ── Estilo visual ──────────────────────────────────────── */}
      <StudioCollapsibleSection
        title="Estilo dos textos e cores"
        description="Ajuste o visual geral dos textos, cores e rodapé do encarte."
        collapsed={Boolean(collapsedConfigSections.copyMode)}
        onToggle={() => toggleConfigSection('copyMode')}
      >
        <div className="offer-studio-edit-grid">
          <StudioSelectField label="Tamanho dos textos" value={textMode} onChange={setTextMode} options={textModeOptions} />
          <StudioSelectField label="Paleta de cores" value={colorMode} onChange={setColorMode} options={colorModeOptions} />
          <StudioSelectField label="Estilo do rodapé" value={footerMode} onChange={setFooterMode} options={footerOptions} />
        </div>
      </StudioCollapsibleSection>

      {/* ── Logos e rodapé ─────────────────────────────────────── */}
      <StudioCollapsibleSection
        title="Logos e rodapé"
        description="Configure as logos e os textos que aparecem no rodapé do encarte."
        collapsed={Boolean(collapsedConfigSections.marketLogos)}
        onToggle={() => toggleConfigSection('marketLogos')}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="offer-studio-panel-subhead">
              <span className="section-kicker">Logo principal</span>
            </div>
            <div className="mb-4 flex h-28 items-center justify-center rounded-xl border border-gray-200 bg-white">
              {marketProfile?.primaryLogoUrl ? (
                <OfferProductImage src={marketProfile.primaryLogoUrl} alt="Logo principal" className="h-full w-full object-contain p-4" />
              ) : (
                <span className="text-sm text-gray-500">Nenhuma logo enviada</span>
              )}
            </div>
            <div className="mb-4">
              <StudioAssetStatus
                label="Logo principal"
                storageKey={marketProfile?.primaryLogoStorageKey}
                hasAsset={Boolean(marketProfile?.primaryLogoUrl)}
              />
            </div>
            <label className="offer-studio-text-field">
              <span>Enviar logo</span>
              <input
                className="input"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                onChange={(event) => handleUploadMarketLogo('PRIMARY', event.target.files?.[0])}
                disabled={uploadingAsset === 'market-primary'}
              />
            </label>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="offer-studio-panel-subhead">
              <span className="section-kicker">Logo secundária</span>
            </div>
            <div className="mb-4 flex h-28 items-center justify-center rounded-xl border border-gray-200 bg-white">
              {marketProfile?.secondaryLogoUrl ? (
                <OfferProductImage src={marketProfile.secondaryLogoUrl} alt="Logo secundária" className="h-full w-full object-contain p-4" />
              ) : (
                <span className="text-sm text-gray-500">Nenhuma logo enviada</span>
              )}
            </div>
            <div className="mb-4">
              <StudioAssetStatus
                label="Logo secundária"
                storageKey={marketProfile?.secondaryLogoStorageKey}
                hasAsset={Boolean(marketProfile?.secondaryLogoUrl)}
              />
            </div>
            <label className="offer-studio-text-field">
              <span>Enviar logo</span>
              <input
                className="input"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                onChange={(event) => handleUploadMarketLogo('SECONDARY', event.target.files?.[0])}
                disabled={uploadingAsset === 'market-secondary'}
              />
            </label>
          </div>
        </div>

        <div className="offer-studio-edit-grid mt-4">
          <label className="offer-studio-text-field md:col-span-2">
            <span>Texto do rodapé</span>
            <textarea
              className="textarea"
              rows={3}
              value={marketProfile?.footerContent || ''}
              onChange={(event) => handleMarketProfileField('footerContent', event.target.value)}
              placeholder="Ex.: Ofertas válidas no fim de semana. Endereço da loja, horário."
            />
          </label>
          <label className="offer-studio-text-field md:col-span-2">
            <span>Aviso legal</span>
            <textarea
              className="textarea"
              rows={2}
              value={marketProfile?.footerLegalText || ''}
              onChange={(event) => handleMarketProfileField('footerLegalText', event.target.value)}
              placeholder="Ex.: Imagens meramente ilustrativas. Consulte disponibilidade."
            />
          </label>
        </div>

        <div className="offer-studio-inline-actions wrap">
          <Button type="button" onClick={handleSaveMarketProfile} disabled={savingMarketProfile}>
            <Factory size={16} strokeWidth={2.1} />
            {savingMarketProfile ? 'Salvando...' : 'Salvar perfil do mercado'}
          </Button>
        </div>
      </StudioCollapsibleSection>

      {/* ── Sugestões de produtos ──────────────────────────────── */}
      {overview && (overview.seasonalSuggestions?.length > 0 || overview.promotionSuggestions?.length > 0) && (
        <StudioCollapsibleSection
          title="Sugestões de produtos"
          description="Produtos com potencial para o seu encarte, com base nas suas vendas."
          collapsed={Boolean(collapsedConfigSections.calendarCampaign)}
          onToggle={() => toggleConfigSection('calendarCampaign')}
        >
          {overview.seasonalSuggestions?.length > 0 && (
            <section className="offer-studio-insight-block">
              <div className="offer-studio-panel-subhead">
                <span className="section-kicker">Produtos em alta</span>
                <small>{overview.seasonalSuggestions.length} itens</small>
              </div>
              <div className="offer-studio-mini-list">
                {overview.seasonalSuggestions.slice(0, 6).map((product) => (
                  <StudioSearchResultCard
                    key={product.productId}
                    product={product as unknown as OfferCatalogProduct}
                    inQueue={selectedProductIds.has(product.productId)}
                    onAdd={() => addProductById(product.productId)}
                  />
                ))}
              </div>
            </section>
          )}

          {overview.promotionSuggestions?.length > 0 && (
            <section className="offer-studio-insight-block">
              <div className="offer-studio-panel-subhead">
                <span className="section-kicker">Respondem bem a desconto</span>
                <small>{overview.promotionSuggestions.length} itens</small>
              </div>
              <div className="offer-studio-mini-list">
                {overview.promotionSuggestions.slice(0, 5).map((product) => (
                  <StudioSearchResultCard
                    key={product.productId}
                    product={product as unknown as OfferCatalogProduct}
                    inQueue={selectedProductIds.has(product.productId)}
                    onAdd={() => addProductById(product.productId)}
                  />
                ))}
              </div>
            </section>
          )}
        </StudioCollapsibleSection>
      )}

      {/* ── Legenda para redes sociais ─────────────────────────── */}
      <StudioCollapsibleSection
        title="Legenda para redes sociais"
        description="Texto sugerido para postar nas redes sociais junto com o encarte."
        collapsed={Boolean(collapsedConfigSections.copySocial)}
        onToggle={() => toggleConfigSection('copySocial')}
      >
        <div className="offer-studio-copy-box">
          <p>Texto gerado automaticamente com base nos produtos e no tema do encarte.</p>
          <textarea className="textarea" rows={12} value={socialCopy} readOnly />
        </div>
      </StudioCollapsibleSection>
    </div>
  );
};

export default OfferStudioMarketingPanels;
