import React from 'react';
import {
  Boxes,
  Check,
  Factory,
  FileText,
  ImageIcon,
  SendHorizontal,
  Target,
  WandSparkles,
} from 'lucide-react';
import Button from '../../components/common/Button';
import OfferProductImage from '../../components/offers/OfferProductImage';
import type {
  OfferCatalogProduct,
  OfferMarketProfile,
  OfferTemplate,
  OfferTemplateVariant,
} from '../../types/offers.types';
import {
  StudioCollapsibleSection,
  StudioSelectField,
} from './StudioPrimitives';

type SelectOption = { value: string; label: string };

type OfferStudioDistributionPanelsProps = {
  activeTool: string;
  collapsedConfigSections: Record<string, boolean | undefined>;
  toggleConfigSection: (key: string) => void;
  jobName: string;
  setJobName: (value: string) => void;
  outputType: string;
  setOutputType: (value: string) => void;
  generationMode: string;
  setGenerationMode: (value: string) => void;
  renderQuality: string;
  setRenderQuality: (value: string) => void;
  qualityOptions: SelectOption[];
  selectedVariantKey: string;
  setSelectedVariantKey: (value: string) => void;
  variantOptions: SelectOption[];
  gridPreset: string;
  setGridPreset: (value: string) => void;
  gridPresetOptions: SelectOption[];
  productBoxMode: string;
  setProductBoxMode: (value: string) => void;
  productBoxOptions: SelectOption[];
  coverEnabled: boolean;
  setCoverEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  selectedProducts: OfferCatalogProduct[];
  pageEstimate: number;
  selectedVariant: OfferTemplateVariant | null;
  selectedTemplate: OfferTemplate | null;
  refreshPreview: (mode: 'preview' | 'autofill') => void;
  handleSaveCampaign: () => void;
  saving: boolean;
  isEditingCampaign: boolean;
  selectedTemplateId: string;
  portalEnabled: boolean;
  togglePublishTarget: (target: string) => void;
  marketProfile: OfferMarketProfile | null;
  setActiveTool: (tool: string) => void;
  publishTargets: string[];
  publishTargetOptions: SelectOption[];
  draftCampaignCount: number;
  readyMediaCount: number;
  activeJobId: string;
  handlePublishCurrentCampaign: () => void;
  openStudioSheet: (sheet: 'campaigns' | 'media') => void;
};

const OfferStudioDistributionPanels: React.FC<OfferStudioDistributionPanelsProps> = ({
  activeTool,
  collapsedConfigSections,
  toggleConfigSection,
  jobName,
  setJobName,
  outputType,
  setOutputType,
  generationMode,
  setGenerationMode,
  renderQuality,
  setRenderQuality,
  qualityOptions,
  selectedVariantKey,
  setSelectedVariantKey,
  variantOptions,
  gridPreset,
  setGridPreset,
  gridPresetOptions,
  productBoxMode,
  setProductBoxMode,
  productBoxOptions,
  coverEnabled,
  setCoverEnabled,
  selectedProducts,
  pageEstimate,
  selectedVariant,
  selectedTemplate,
  refreshPreview,
  handleSaveCampaign,
  saving,
  isEditingCampaign,
  selectedTemplateId,
  portalEnabled,
  togglePublishTarget,
  marketProfile,
  setActiveTool,
  publishTargets,
  publishTargetOptions,
  draftCampaignCount,
  readyMediaCount,
  activeJobId,
  handlePublishCurrentCampaign,
  openStudioSheet,
}) => (
  <>
    {activeTool === 'leaflet' ? (
      <div className="offer-studio-panel-stack">
        <div className="offer-studio-panel-header compact">
          <div>
            <span className="section-kicker">Formato</span>
            <h2>Configure seu encarte</h2>
          </div>
        </div>
        <StudioCollapsibleSection
          title="Dados do encarte"
          description="Dê um nome ao encarte, escolha o formato e como os produtos serão organizados."
          collapsed={Boolean(collapsedConfigSections.publishConfig)}
          onToggle={() => toggleConfigSection('publishConfig')}
          containerClassName="offer-studio-publish-box"
        >
          <div className="offer-studio-edit-grid">
            <label className="offer-studio-text-field md:col-span-2">
              <span>Nome do encarte</span>
              <input className="input" value={jobName} onChange={(event) => setJobName(event.target.value)} placeholder="Ex.: Ofertas da semana" />
            </label>
            <label className="offer-studio-text-field">
              <span>Tipo de arquivo</span>
              <select className="input" value={outputType} onChange={(event) => setOutputType(event.target.value)}>
                <option value="PNG">PNG</option>
                <option value="PDF">PDF</option>
                <option value="MP4">MP4</option>
              </select>
            </label>
            <label className="offer-studio-text-field">
              <span>Tipo de encarte</span>
              <select className="input" value={generationMode} onChange={(event) => setGenerationMode(event.target.value)}>
                <option value="CATALOG">Vários produtos por página</option>
                <option value="INDIVIDUAL">Um produto por página</option>
              </select>
            </label>
            <label className="offer-studio-text-field">
              <span>Qualidade</span>
              <select className="input" value={renderQuality} onChange={(event) => setRenderQuality(event.target.value)}>
                {qualityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <StudioSelectField label="Formato" value={selectedVariantKey} onChange={setSelectedVariantKey} options={variantOptions.length ? variantOptions : [{ value: '', label: 'Formato principal' }]} />
          </div>
        </StudioCollapsibleSection>
        <StudioCollapsibleSection
          title="Layout da página"
          description="Defina quantos produtos aparecem por página e o estilo de exibição."
          collapsed={Boolean(collapsedConfigSections.publishChannels)}
          onToggle={() => toggleConfigSection('publishChannels')}
        >
          <div className="offer-studio-edit-grid">
            <StudioSelectField label="Produtos por página" value={gridPreset} onChange={setGridPreset} options={gridPresetOptions} />
            <StudioSelectField label="Estilo dos produtos" value={productBoxMode} onChange={setProductBoxMode} options={productBoxOptions} />
            <label className="offer-studio-toggle-field">
              <span>Gerar capa</span>
              <button type="button" className={`offer-studio-toggle ${coverEnabled ? 'active' : ''}`} onClick={() => setCoverEnabled((current) => !current)}>
                <span />
              </button>
            </label>
            <div className="offer-studio-summary-card">
              <strong>{selectedProducts.length} produtos</strong>
              <span>{pageEstimate} {pageEstimate === 1 ? 'página' : 'páginas'}</span>
              <span>{selectedVariant?.name || 'Formato principal'} · {selectedTemplate?.name || 'Sem modelo'}</span>
            </div>
          </div>
          <div className="offer-studio-inline-actions wrap">
            <Button type="button" variant="secondary" onClick={() => refreshPreview('autofill')}>
              <WandSparkles size={16} strokeWidth={2.1} />
              Preencher automático
            </Button>
            <Button type="button" onClick={handleSaveCampaign} disabled={saving || !selectedProducts.length || !selectedTemplateId}>
              <FileText size={16} strokeWidth={2.1} />
              {saving ? (isEditingCampaign ? 'Atualizando...' : 'Salvando...') : (isEditingCampaign ? 'Atualizar encarte' : 'Salvar encarte')}
            </Button>
          </div>
        </StudioCollapsibleSection>
      </div>
    ) : null}

    {activeTool === 'portal' ? (
      <div className="offer-studio-panel-stack">
        <div className="offer-studio-panel-header compact">
          <div>
            <span className="section-kicker">QR Code</span>
            <h2>Publicar online</h2>
          </div>
        </div>
        <StudioCollapsibleSection
          title="Portal de ofertas"
          description="Publique este encarte online com QR Code para seus clientes acessarem pelo celular."
          collapsed={Boolean(collapsedConfigSections.marketFooter)}
          onToggle={() => toggleConfigSection('marketFooter')}
        >
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => togglePublishTarget('PORTAL')}
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${portalEnabled ? 'border-transparent bg-emerald-600 text-white shadow-[0_14px_24px_rgba(5,150,105,0.22)]' : 'border-gray-200 bg-white text-gray-900'}`}
              >
                {portalEnabled ? <Check size={14} strokeWidth={2.1} /> : <Target size={14} strokeWidth={2.1} />}
                {portalEnabled ? 'Portal ativo' : 'Ativar portal'}
              </button>
            </div>
            <div className="offer-studio-summary-card">
              <strong>{portalEnabled ? 'Portal habilitado' : 'Portal desabilitado'}</strong>
              <span>{marketProfile?.footerContent || 'Configure o texto institucional na aba Marca.'}</span>
              <span>{marketProfile?.footerLegalText || 'Sem texto legal definido.'}</span>
            </div>
          </div>
        </StudioCollapsibleSection>
        <StudioCollapsibleSection
          title="Logo do seu mercado"
          description="Essas logos aparecem no encarte e no portal online."
          collapsed={Boolean(collapsedConfigSections.marketLogos)}
          onToggle={() => toggleConfigSection('marketLogos')}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <span className="section-kicker">Logo principal</span>
              <div className="mt-3 flex h-24 items-center justify-center rounded-xl border border-gray-200 bg-white">
                {marketProfile?.primaryLogoUrl ? (
                  <OfferProductImage src={marketProfile.primaryLogoUrl} alt="Logo principal" className="h-full w-full object-contain p-4" />
                ) : (
                  <span className="text-sm text-gray-500">Nenhuma logo enviada</span>
                )}
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <span className="section-kicker">Logo secundaria</span>
              <div className="mt-3 flex h-24 items-center justify-center rounded-xl border border-gray-200 bg-white">
                {marketProfile?.secondaryLogoUrl ? (
                  <OfferProductImage src={marketProfile.secondaryLogoUrl} alt="Logo secundaria" className="h-full w-full object-contain p-4" />
                ) : (
                  <span className="text-sm text-gray-500">Nenhuma logo enviada</span>
                )}
              </div>
            </div>
          </div>
          <div className="offer-studio-inline-actions wrap">
            <Button type="button" variant="secondary" onClick={() => setActiveTool('brand')}>
              <Factory size={16} strokeWidth={2.1} />
              Ajustar identidade
            </Button>
          </div>
        </StudioCollapsibleSection>
      </div>
    ) : null}

    {activeTool === 'publish' ? (
      <div className="offer-studio-panel-stack">
        <div className="offer-studio-panel-header compact">
          <div>
            <span className="section-kicker">Publicar</span>
            <h2>Gerar e compartilhar</h2>
          </div>
        </div>
        <StudioCollapsibleSection
          title="Onde compartilhar"
          description="Escolha onde seu encarte será publicado e gere os arquivos."
          collapsed={Boolean(collapsedConfigSections.publishTargets)}
          onToggle={() => toggleConfigSection('publishTargets')}
          containerClassName="offer-studio-publish-box"
        >
          <div className="offer-studio-summary-card">
            <strong>{jobName.trim() || 'Encarte sem nome'}</strong>
            <span>{draftCampaignCount} {draftCampaignCount === 1 ? 'rascunho salvo' : 'rascunhos salvos'}</span>
            <span>{readyMediaCount} {readyMediaCount === 1 ? 'arquivo pronto' : 'arquivos prontos'}</span>
          </div>
          <div className="space-y-3">
            <span className="section-kicker">Onde compartilhar</span>
            <div className="flex flex-wrap gap-2">
              {publishTargetOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => togglePublishTarget(option.value)}
                  className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${publishTargets.includes(option.value) ? 'border-transparent bg-emerald-600 text-white shadow-[0_14px_24px_rgba(5,150,105,0.22)]' : 'border-gray-200 bg-white text-gray-900'}`}
                >
                  {publishTargets.includes(option.value) ? <Check size={14} strokeWidth={2.1} /> : <Target size={14} strokeWidth={2.1} />}
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="offer-studio-inline-actions wrap">
            <Button type="button" onClick={handleSaveCampaign} disabled={saving || !selectedProducts.length || !selectedTemplateId}>
              <WandSparkles size={16} strokeWidth={2.1} />
              {saving ? (isEditingCampaign ? 'Atualizando...' : 'Salvando...') : (isEditingCampaign ? 'Atualizar encarte' : 'Salvar encarte')}
            </Button>
            <Button type="button" variant="secondary" onClick={handlePublishCurrentCampaign} disabled={saving || !activeJobId}>
              <SendHorizontal size={16} strokeWidth={2.1} />
              {saving ? 'Gerando...' : 'Gerar agora'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => openStudioSheet('campaigns')}>
              <Boxes size={16} strokeWidth={2.1} />
              Meus encartes
            </Button>
            <Button type="button" variant="secondary" onClick={() => openStudioSheet('media')}>
              <ImageIcon size={16} strokeWidth={2.1} />
              Arquivos prontos
            </Button>
          </div>
        </StudioCollapsibleSection>
      </div>
    ) : null}
  </>
);

export default OfferStudioDistributionPanels;
