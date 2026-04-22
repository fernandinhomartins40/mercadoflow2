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
}) => (
  <>
    {activeTool === 'brand' ? (
      <div className="offer-studio-panel-stack">
        <div className="offer-studio-panel-header compact">
          <div>
            <span className="section-kicker">Marca</span>
            <h2>Identidade da campanha</h2>
          </div>
        </div>

        <StudioCollapsibleSection
          title="Identidade visual"
          description="Selecione a combinacao visual principal do encarte, como no fluxo de skins do qrofertas."
          collapsed={Boolean(collapsedConfigSections.brandIdentity)}
          onToggle={() => toggleConfigSection('brandIdentity')}
        >
          <div className="offer-studio-edit-grid">
            <StudioSelectField
              label="Brand kit"
              value={selectedBrandKitId}
              onChange={setSelectedBrandKitId}
              options={brandKitOptions.length ? brandKitOptions : [{ value: '', label: 'Sem brand kit' }]}
            />
            <StudioSelectField
              label="Campanha principal"
              value={selectedCampaignKitId}
              onChange={setSelectedCampaignKitId}
              options={campaignKitOptions.length ? campaignKitOptions : [{ value: '', label: 'Sem campanha' }]}
            />
          </div>
        </StudioCollapsibleSection>

        <StudioCollapsibleSection
          title="Textos institucionais"
          description="Defina os textos fixos que acompanham a identidade visual do mercado."
          collapsed={Boolean(collapsedConfigSections.marketFooter)}
          onToggle={() => toggleConfigSection('marketFooter')}
        >
          <div className="offer-studio-edit-grid">
            <label className="offer-studio-text-field md:col-span-2">
              <span>Conteudo principal do rodape</span>
              <textarea
                className="textarea"
                rows={4}
                value={marketProfile?.footerContent || ''}
                onChange={(event) => handleMarketProfileField('footerContent', event.target.value)}
                placeholder="Ex.: ofertas validas no fim de semana, endereco da loja, horario ou mensagem principal."
              />
            </label>
            <label className="offer-studio-text-field md:col-span-2">
              <span>Aviso legal do rodape</span>
              <textarea
                className="textarea"
                rows={4}
                value={marketProfile?.footerLegalText || ''}
                onChange={(event) => handleMarketProfileField('footerLegalText', event.target.value)}
                placeholder="Ex.: imagens meramente ilustrativas. consulte disponibilidade na loja."
              />
            </label>
          </div>
        </StudioCollapsibleSection>

        <StudioCollapsibleSection
          title="Logos do rodape"
          description="Essas imagens sao aplicadas nas areas reservadas pelo template."
          collapsed={Boolean(collapsedConfigSections.marketLogos)}
          onToggle={() => toggleConfigSection('marketLogos')}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="offer-studio-panel-subhead">
                <span className="section-kicker">Logo principal</span>
                <small>Slot esquerdo</small>
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
                <span>Upload da logo principal</span>
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
                <span className="section-kicker">Logo secundaria</span>
                <small>Slot direito</small>
              </div>
              <div className="mb-4 flex h-28 items-center justify-center rounded-xl border border-gray-200 bg-white">
                {marketProfile?.secondaryLogoUrl ? (
                  <OfferProductImage src={marketProfile.secondaryLogoUrl} alt="Logo secundaria" className="h-full w-full object-contain p-4" />
                ) : (
                  <span className="text-sm text-gray-500">Nenhuma logo enviada</span>
                )}
              </div>
              <div className="mb-4">
                <StudioAssetStatus
                  label="Logo secundaria"
                  storageKey={marketProfile?.secondaryLogoStorageKey}
                  hasAsset={Boolean(marketProfile?.secondaryLogoUrl)}
                />
              </div>
              <label className="offer-studio-text-field">
                <span>Upload da logo secundaria</span>
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
          <div className="offer-studio-inline-actions wrap">
            <Button type="button" onClick={handleSaveMarketProfile} disabled={savingMarketProfile}>
              <Factory size={16} strokeWidth={2.1} />
              {savingMarketProfile ? 'Salvando...' : 'Salvar perfil do mercado'}
            </Button>
          </div>
        </StudioCollapsibleSection>
      </div>
    ) : null}

    {activeTool === 'dates' ? (
      <div className="offer-studio-panel-stack">
        <div className="offer-studio-panel-header compact">
          <div>
            <span className="section-kicker">Datas</span>
            <h2>Sugestoes inteligentes</h2>
          </div>
        </div>

        <StudioCollapsibleSection
          title="Agenda da campanha"
          description="Escolha a campanha sazonal que orienta tema, selo e calendario comercial."
          collapsed={Boolean(collapsedConfigSections.calendarCampaign)}
          onToggle={() => toggleConfigSection('calendarCampaign')}
        >
          <div className="offer-studio-edit-grid">
            <StudioSelectField
              label="Campanha sazonal"
              value={selectedCampaignKitId}
              onChange={setSelectedCampaignKitId}
              options={campaignKitOptions.length ? campaignKitOptions : [{ value: '', label: 'Sem campanha' }]}
            />
            <label className="offer-studio-text-field">
              <span>Foco atual</span>
              <input className="input" value={selectedCampaignKit?.seasonKey || 'Campanha livre'} readOnly />
            </label>
          </div>
        </StudioCollapsibleSection>

        <section className="offer-studio-insight-block">
          <div className="offer-studio-panel-subhead">
            <span className="section-kicker">Campaign kit ativo</span>
            <small>{selectedCampaignKit?.seasonKey || 'Campanha livre'}</small>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white/85 px-4 py-4 text-sm text-gray-500">
            <strong className="block text-base text-gray-900">{selectedCampaignKit?.name || 'Sem campanha selecionada'}</strong>
            <p className="mt-2">{selectedCampaignKit?.description || 'Escolha uma campanha para aplicar headline, selo e tokens sazonais ao template.'}</p>
          </div>
        </section>

        <section className="offer-studio-insight-block">
          <div className="offer-studio-panel-subhead">
            <span className="section-kicker">Sazonalidade proxima</span>
            <small>{overview?.seasonalSuggestions?.length || 0} itens</small>
          </div>
          <div className="offer-studio-mini-list">
            {overview?.seasonalSuggestions?.slice(0, 6).map((product) => (
              <StudioSearchResultCard
                key={product.productId}
                product={product as unknown as OfferCatalogProduct}
                inQueue={selectedProductIds.has(product.productId)}
                onAdd={() => addProductById(product.productId)}
              />
            ))}
          </div>
        </section>

        <section className="offer-studio-insight-block">
          <div className="offer-studio-panel-subhead">
            <span className="section-kicker">Promocoes com maior resposta</span>
            <small>{overview?.promotionSuggestions?.length || 0} itens</small>
          </div>
          <div className="offer-studio-mini-list">
            {overview?.promotionSuggestions?.slice(0, 5).map((product) => (
              <StudioSearchResultCard
                key={product.productId}
                product={product as unknown as OfferCatalogProduct}
                inQueue={selectedProductIds.has(product.productId)}
                onAdd={() => addProductById(product.productId)}
              />
            ))}
          </div>
        </section>
      </div>
    ) : null}

    {activeTool === 'fonts' ? (
      <div className="offer-studio-panel-stack">
        <div className="offer-studio-panel-header compact">
          <div>
            <span className="section-kicker">Fontes</span>
            <h2>Tipografia e copy</h2>
          </div>
          <Button type="button" variant="secondary" onClick={handleCopyText} disabled={copying}>
            <Copy size={16} strokeWidth={2.1} />
            {copying ? 'Copiando...' : 'Copiar texto'}
          </Button>
        </div>
        <StudioCollapsibleSection
          title="Preset visual"
          description="Ajuste o comportamento do texto, da paleta e do rodape para a arte inteira."
          collapsed={Boolean(collapsedConfigSections.copyMode)}
          onToggle={() => toggleConfigSection('copyMode')}
        >
          <div className="offer-studio-edit-grid">
            <StudioSelectField label="Estilo de texto" value={textMode} onChange={setTextMode} options={textModeOptions} />
            <StudioSelectField label="Paleta da arte" value={colorMode} onChange={setColorMode} options={colorModeOptions} />
            <StudioSelectField label="Formato do rodape" value={footerMode} onChange={setFooterMode} options={footerOptions} />
          </div>
        </StudioCollapsibleSection>
        <StudioCollapsibleSection
          title="Texto da arte"
          description="Esses campos alimentam o topo do template e o tom geral da campanha."
          collapsed={Boolean(collapsedConfigSections.copyText)}
          onToggle={() => toggleConfigSection('copyText')}
        >
          <div className="offer-studio-edit-grid">
            <label className="offer-studio-text-field">
              <span>Kicker</span>
              <input className="input" value={campaignKicker} onChange={(event) => setCampaignKicker(event.target.value)} placeholder="Ex.: Ofertao da semana" />
            </label>
            <label className="offer-studio-text-field">
              <span>Selo</span>
              <input className="input" value={campaignBadgeLabel} onChange={(event) => setCampaignBadgeLabel(event.target.value)} placeholder="Ex.: Oferta" />
            </label>
            <label className="offer-studio-text-field md:col-span-2">
              <span>Titulo</span>
              <input className="input" value={campaignHeadline} onChange={(event) => setCampaignHeadline(event.target.value)} placeholder="Ex.: Ofertas da semana" />
            </label>
            <label className="offer-studio-text-field md:col-span-2">
              <span>Subtitulo</span>
              <textarea
                className="textarea"
                rows={4}
                value={campaignSubheadline}
                onChange={(event) => setCampaignSubheadline(event.target.value)}
                placeholder="Ex.: selecione produtos para montar a arte automaticamente."
              />
            </label>
          </div>
        </StudioCollapsibleSection>
        <StudioCollapsibleSection
          title="Legenda sugerida"
          description="Texto pronto para postar, revisar e reutilizar nos canais da campanha."
          collapsed={Boolean(collapsedConfigSections.copySocial)}
          onToggle={() => toggleConfigSection('copySocial')}
        >
          <div className="offer-studio-copy-box">
            <p>Gere um texto de apoio para redes sociais e comunicacao acessivel com base nos produtos selecionados e na campanha ativa.</p>
            <textarea className="textarea" rows={18} value={socialCopy} readOnly />
          </div>
        </StudioCollapsibleSection>
      </div>
    ) : null}
  </>
);

export default OfferStudioMarketingPanels;
