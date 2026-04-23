import React from 'react';
import {
  Boxes,
  Check,
  FileText,
  ImageIcon,
  SendHorizontal,
  Target,
  WandSparkles,
} from 'lucide-react';
import Button from '../../components/common/Button';
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
}) => {
  if (activeTool !== 'generate') return null;

  return (
    <div className="offer-studio-panel-stack">
      <div className="offer-studio-panel-header compact">
        <div>
          <span className="section-kicker">Gerar encarte</span>
          <h2>Configure e gere seu encarte</h2>
        </div>
      </div>

      {/* ── Dados do encarte ──────────────────────────────────── */}
      <StudioCollapsibleSection
        title="Dados do encarte"
        description="Dê um nome ao encarte e escolha o formato de saída."
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
              <option value="PNG">PNG (imagem)</option>
              <option value="PDF">PDF (documento)</option>
              <option value="MP4">MP4 (vídeo)</option>
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

      {/* ── Layout da página ──────────────────────────────────── */}
      <StudioCollapsibleSection
        title="Layout da página"
        description="Defina quantos produtos aparecem por página e como são exibidos."
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
            <strong>{selectedProducts.length} produto{selectedProducts.length !== 1 ? 's' : ''}</strong>
            <span>{pageEstimate} {pageEstimate === 1 ? 'página' : 'páginas'}</span>
            <span>{selectedVariant?.name || 'Formato principal'} · {selectedTemplate?.name || 'Sem modelo'}</span>
          </div>
        </div>
      </StudioCollapsibleSection>

      {/* ── Publicação online ─────────────────────────────────── */}
      <StudioCollapsibleSection
        title="Publicar online"
        description="Ative o portal de ofertas com QR Code para seus clientes acessarem pelo celular."
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
              {portalEnabled ? 'Portal ativo' : 'Ativar portal online'}
            </button>
          </div>
          {portalEnabled && (
            <div className="offer-studio-summary-card">
              <strong>Portal habilitado</strong>
              <span>{marketProfile?.footerContent || 'Configure o texto do rodapé em "Personalizar".'}</span>
            </div>
          )}
        </div>
      </StudioCollapsibleSection>

      {/* ── Onde compartilhar ──────────────────────────────────── */}
      <StudioCollapsibleSection
        title="Onde compartilhar"
        description="Escolha os canais de distribuição do encarte."
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
          <span className="section-kicker">Canais de distribuição</span>
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
      </StudioCollapsibleSection>

      {/* ── Ações finais ──────────────────────────────────────── */}
      <div className="offer-studio-inline-actions wrap">
        <Button type="button" variant="secondary" onClick={() => refreshPreview('autofill')}>
          <WandSparkles size={16} strokeWidth={2.1} />
          Preencher automático
        </Button>
        <Button type="button" onClick={handleSaveCampaign} disabled={saving || !selectedProducts.length || !selectedTemplateId}>
          <FileText size={16} strokeWidth={2.1} />
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
    </div>
  );
};

export default OfferStudioDistributionPanels;
