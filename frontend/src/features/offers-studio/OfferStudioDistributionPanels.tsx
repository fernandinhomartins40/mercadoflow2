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
            <span className="section-kicker">Encarte</span>
            <h2>Montagem da campanha</h2>
          </div>
        </div>
        <StudioCollapsibleSection
          title="Configuracao do encarte"
          description="Defina o nome do job, o formato principal e a estrategia de geracao."
          collapsed={Boolean(collapsedConfigSections.publishConfig)}
          onToggle={() => toggleConfigSection('publishConfig')}
          containerClassName="offer-studio-publish-box"
        >
          <div className="offer-studio-edit-grid">
            <label className="offer-studio-text-field md:col-span-2">
              <span>Nome da campanha</span>
              <input className="input" value={jobName} onChange={(event) => setJobName(event.target.value)} placeholder="Ex.: Encarte fim de semana" />
            </label>
            <label className="offer-studio-text-field">
              <span>Saida principal</span>
              <select className="input" value={outputType} onChange={(event) => setOutputType(event.target.value)}>
                <option value="PNG">PNG</option>
                <option value="PDF">PDF</option>
                <option value="MP4">MP4</option>
              </select>
            </label>
            <label className="offer-studio-text-field">
              <span>Modo de geracao</span>
              <select className="input" value={generationMode} onChange={(event) => setGenerationMode(event.target.value)}>
                <option value="CATALOG">Encarte multiproduto</option>
                <option value="INDIVIDUAL">Pecas individuais</option>
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
          title="Montagem da pagina"
          description="Controle a quantidade de produtos, a distribuicao dos boxes e a capa."
          collapsed={Boolean(collapsedConfigSections.publishChannels)}
          onToggle={() => toggleConfigSection('publishChannels')}
        >
          <div className="offer-studio-edit-grid">
            <StudioSelectField label="Grade" value={gridPreset} onChange={setGridPreset} options={gridPresetOptions} />
            <StudioSelectField label="Boxes de produtos" value={productBoxMode} onChange={setProductBoxMode} options={productBoxOptions} />
            <label className="offer-studio-toggle-field">
              <span>Gerar capa</span>
              <button type="button" className={`offer-studio-toggle ${coverEnabled ? 'active' : ''}`} onClick={() => setCoverEnabled((current) => !current)}>
                <span />
              </button>
            </label>
            <div className="offer-studio-summary-card">
              <strong>{selectedProducts.length} produtos</strong>
              <span>{pageEstimate} pagina(s) estimadas</span>
              <span>{selectedVariant?.name || 'Formato principal'} · {selectedTemplate?.name || 'Sem modelo'}</span>
            </div>
          </div>
          <div className="offer-studio-inline-actions wrap">
            <Button type="button" variant="secondary" onClick={() => refreshPreview('autofill')}>
              <WandSparkles size={16} strokeWidth={2.1} />
              Auto-fill
            </Button>
            <Button type="button" onClick={handleSaveCampaign} disabled={saving || !selectedProducts.length || !selectedTemplateId}>
              <FileText size={16} strokeWidth={2.1} />
              {saving ? (isEditingCampaign ? 'Atualizando...' : 'Salvando...') : (isEditingCampaign ? 'Atualizar campanha' : 'Salvar campanha')}
            </Button>
          </div>
        </StudioCollapsibleSection>
      </div>
    ) : null}

    {activeTool === 'portal' ? (
      <div className="offer-studio-panel-stack">
        <div className="offer-studio-panel-header compact">
          <div>
            <span className="section-kicker">Portal</span>
            <h2>Destino online da oferta</h2>
          </div>
        </div>
        <StudioCollapsibleSection
          title="Publicacao no portal"
          description="Controle se esta campanha tambem sera publicada no portal do mercado."
          collapsed={Boolean(collapsedConfigSections.marketFooter)}
          onToggle={() => toggleConfigSection('marketFooter')}
        >
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => togglePublishTarget('PORTAL')}
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${portalEnabled ? 'border-transparent bg-[color:var(--accent-primary)] text-white shadow-[0_14px_24px_rgba(255,106,0,0.22)]' : 'border-[rgba(87,51,30,0.1)] bg-white text-[color:var(--text-primary)]'}`}
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
          title="Identidade publicada"
          description="Resumo rapido dos ativos que acompanham a campanha no portal."
          collapsed={Boolean(collapsedConfigSections.marketLogos)}
          onToggle={() => toggleConfigSection('marketLogos')}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-[18px] border border-[rgba(87,51,30,0.08)] bg-[rgba(255,247,240,0.62)] p-4">
              <span className="section-kicker">Logo principal</span>
              <div className="mt-3 flex h-24 items-center justify-center rounded-[18px] border border-[rgba(87,51,30,0.08)] bg-white">
                {marketProfile?.primaryLogoUrl ? (
                  <OfferProductImage src={marketProfile.primaryLogoUrl} alt="Logo principal" className="h-full w-full object-contain p-4" />
                ) : (
                  <span className="text-sm text-[color:var(--text-secondary)]">Nenhuma logo enviada</span>
                )}
              </div>
            </div>
            <div className="rounded-[18px] border border-[rgba(87,51,30,0.08)] bg-[rgba(255,247,240,0.62)] p-4">
              <span className="section-kicker">Logo secundaria</span>
              <div className="mt-3 flex h-24 items-center justify-center rounded-[18px] border border-[rgba(87,51,30,0.08)] bg-white">
                {marketProfile?.secondaryLogoUrl ? (
                  <OfferProductImage src={marketProfile.secondaryLogoUrl} alt="Logo secundaria" className="h-full w-full object-contain p-4" />
                ) : (
                  <span className="text-sm text-[color:var(--text-secondary)]">Nenhuma logo enviada</span>
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
            <span className="section-kicker">Postar</span>
            <h2>Distribuicao e disparo</h2>
          </div>
        </div>
        <StudioCollapsibleSection
          title="Canais de publicacao"
          description="Selecione os destinos da campanha e publique a partir do estagio atual."
          collapsed={Boolean(collapsedConfigSections.publishTargets)}
          onToggle={() => toggleConfigSection('publishTargets')}
          containerClassName="offer-studio-publish-box"
        >
          <div className="offer-studio-summary-card">
            <strong>{jobName.trim() || 'Campanha sem nome'}</strong>
            <span>{draftCampaignCount} rascunho(s) salvo(s)</span>
            <span>{readyMediaCount} midia(s) pronta(s)</span>
          </div>
          <div className="space-y-3">
            <span className="section-kicker">Canais de publicacao</span>
            <div className="flex flex-wrap gap-2">
              {publishTargetOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => togglePublishTarget(option.value)}
                  className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${publishTargets.includes(option.value) ? 'border-transparent bg-[color:var(--accent-primary)] text-white shadow-[0_14px_24px_rgba(255,106,0,0.22)]' : 'border-[rgba(87,51,30,0.1)] bg-white text-[color:var(--text-primary)]'}`}
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
              {saving ? (isEditingCampaign ? 'Atualizando...' : 'Salvando...') : (isEditingCampaign ? 'Atualizar campanha' : 'Salvar campanha')}
            </Button>
            <Button type="button" variant="secondary" onClick={handlePublishCurrentCampaign} disabled={saving || !activeJobId}>
              <SendHorizontal size={16} strokeWidth={2.1} />
              {saving ? 'Publicando...' : 'Publicar agora'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => openStudioSheet('campaigns')}>
              <Boxes size={16} strokeWidth={2.1} />
              Minhas campanhas
            </Button>
            <Button type="button" variant="secondary" onClick={() => openStudioSheet('media')}>
              <ImageIcon size={16} strokeWidth={2.1} />
              Gerenciar midias
            </Button>
          </div>
        </StudioCollapsibleSection>
      </div>
    ) : null}
  </>
);

export default OfferStudioDistributionPanels;
