import React from 'react';
import { LayoutTemplate, Plus } from 'lucide-react';
import Button from '../../components/common/Button';
import type { OfferTemplate } from '../../types/offers.types';
import {
  StudioSelectField,
  StudioTemplateCard,
} from './StudioPrimitives';

type SelectOption = { value: string; label: string };

type OfferStudioThemesHeaderProps = {
  activeTool: string;
  saving: boolean;
  effectiveMarketId: string;
  onStartNewTemplate: () => void;
  onCreateTemplateFromCurrent: () => void;
  templates: OfferTemplate[];
  selectedTemplateId: string;
  onChangeTemplate: (templateId: string) => void;
  selectedVariantKey: string;
  setSelectedVariantKey: (value: string) => void;
  variantOptions: SelectOption[];
  selectedCampaignKitId: string;
  setSelectedCampaignKitId: (value: string) => void;
  campaignKitOptions: SelectOption[];
  selectedBrandKitId: string;
  setSelectedBrandKitId: (value: string) => void;
  brandKitOptions: SelectOption[];
  colorMode: string;
  setColorMode: (value: string) => void;
  textMode: string;
  setTextMode: (value: string) => void;
  footerMode: string;
  setFooterMode: (value: string) => void;
  colorModeOptions: SelectOption[];
  textModeOptions: SelectOption[];
  footerOptions: SelectOption[];
};

const OfferStudioThemesHeader: React.FC<OfferStudioThemesHeaderProps> = ({
  activeTool,
  saving,
  effectiveMarketId,
  onStartNewTemplate,
  onCreateTemplateFromCurrent,
  templates,
  selectedTemplateId,
  onChangeTemplate,
  selectedVariantKey,
  setSelectedVariantKey,
  variantOptions,
  selectedCampaignKitId,
  setSelectedCampaignKitId,
  campaignKitOptions,
  selectedBrandKitId,
  setSelectedBrandKitId,
  brandKitOptions,
  colorMode,
  setColorMode,
  textMode,
  setTextMode,
  footerMode,
  setFooterMode,
  colorModeOptions,
  textModeOptions,
  footerOptions,
}) => (
  <>
    <div className={`offer-studio-panel-header ${activeTool === 'builder' ? 'offer-studio-panel-header-builder' : ''}`}>
      <div className="offer-studio-panel-header-copy">
        <span className="section-kicker">{activeTool === 'builder' ? 'Builder' : 'Temas'}</span>
        <h2>{activeTool === 'builder' ? 'Template builder' : 'Modelos prontos'}</h2>
      </div>
      {activeTool === 'builder' ? (
        <div className="offer-studio-panel-header-actions">
          <Button type="button" variant="secondary" onClick={onStartNewTemplate} disabled={saving || !effectiveMarketId}>
            <Plus size={16} strokeWidth={2.1} />
            Novo template
          </Button>
          <Button type="button" onClick={onCreateTemplateFromCurrent} disabled={saving || !effectiveMarketId}>
            <LayoutTemplate size={16} strokeWidth={2.1} />
            {saving ? 'Salvando...' : 'Salvar como novo'}
          </Button>
        </div>
      ) : null}
    </div>

    <div className="offer-studio-template-list">
      {templates.map((template) => (
        <StudioTemplateCard
          key={template.id}
          template={template}
          selected={selectedTemplateId === template.id}
          onUse={() => onChangeTemplate(template.id)}
        />
      ))}
    </div>

    <div className="offer-studio-panel-header-copy mt-6">
      <span className="section-kicker">Customizacao Visual</span>
      <h2>Estilos e Temas da Arte (Skins)</h2>
      <small>Configure rapidamente as cores e textos globais da arte para que o sistema alinhe todos os produtos.</small>
    </div>
    <div className="offer-studio-edit-grid p-4 rounded-xl border border-gray-200 bg-gray-50 relative">
      <StudioSelectField label="Variante (Formato)" value={selectedVariantKey} onChange={setSelectedVariantKey} options={variantOptions.length ? variantOptions : [{ value: '', label: 'Formato principal' }]} />
      <StudioSelectField label="Campanha Principal" value={selectedCampaignKitId} onChange={setSelectedCampaignKitId} options={campaignKitOptions.length ? campaignKitOptions : [{ value: '', label: 'Sem campanha' }]} />
      <StudioSelectField label="Identidade Visual (Brand)" value={selectedBrandKitId} onChange={setSelectedBrandKitId} options={brandKitOptions.length ? brandKitOptions : [{ value: '', label: 'Sem brand kit' }]} />
      <div className="col-span-full border-t border-gray-100 my-2" />
      <StudioSelectField label="Paleta de Cores" value={colorMode} onChange={setColorMode} options={colorModeOptions} />
      <StudioSelectField label="Estilo de Texto" value={textMode} onChange={setTextMode} options={textModeOptions} />
      <StudioSelectField label="Formato do Rodape" value={footerMode} onChange={setFooterMode} options={footerOptions} />
    </div>
  </>
);

export default OfferStudioThemesHeader;
