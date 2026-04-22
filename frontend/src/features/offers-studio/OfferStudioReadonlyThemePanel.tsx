import React from 'react';
import { Boxes, RefreshCw } from 'lucide-react';
import Button from '../../components/common/Button';
import {
  StudioCollapsibleSection,
  StudioLayerRow,
  StudioPropertyRow,
  StudioZoneCard,
} from './StudioPrimitives';

type JsonMap = Record<string, any>;

type OfferStudioReadonlyThemePanelProps = {
  collapsedConfigSections: Record<string, boolean | undefined>;
  toggleConfigSection: (key: string) => void;
  selectedTemplate: { name?: string | null; description?: string | null; canvasWidth?: number | null; canvasHeight?: number | null } | null;
  selectedVariant: { canvasWidth?: number | null; canvasHeight?: number | null } | null;
  templateCanvasWidth: number;
  templateCanvasHeight: number;
  slotCount: string;
  footerVisible: boolean;
  onRefreshPreview: () => void;
  selectedTemplateId: string;
  onOpenCampaigns: () => void;
  contentZoneLayout: string;
  contentZoneColumns: string;
  contentZoneRows: string;
  layerCount: number;
  zoneCount: number;
  footerLeftLogoVisible: boolean;
  footerRightLogoVisible: boolean;
  cardRadius: string;
  priceBoxRadius: string;
  showUnit: boolean;
  showDescription: boolean;
  showBaselinePrice: boolean;
  priceLabel: string;
  resolvedLayers: JsonMap[];
  activeLayerId?: string | null;
  canvasSelectedLayerId?: string | null;
  onSelectLayer: (id: string) => void;
  resolvedZones: JsonMap[];
  activeZoneId?: string | null;
  canvasSelectedZoneId?: string | null;
  onSelectZone: (id: string) => void;
};

const OfferStudioReadonlyThemePanel: React.FC<OfferStudioReadonlyThemePanelProps> = ({
  collapsedConfigSections,
  toggleConfigSection,
  selectedTemplate,
  selectedVariant,
  templateCanvasWidth,
  templateCanvasHeight,
  slotCount,
  footerVisible,
  onRefreshPreview,
  selectedTemplateId,
  onOpenCampaigns,
  contentZoneLayout,
  contentZoneColumns,
  contentZoneRows,
  layerCount,
  zoneCount,
  footerLeftLogoVisible,
  footerRightLogoVisible,
  cardRadius,
  priceBoxRadius,
  showUnit,
  showDescription,
  showBaselinePrice,
  priceLabel,
  resolvedLayers,
  activeLayerId,
  canvasSelectedLayerId,
  onSelectLayer,
  resolvedZones,
  activeZoneId,
  canvasSelectedZoneId,
  onSelectZone,
}) => (
  <div className="offer-studio-theme-grid">
    <StudioCollapsibleSection
      title="Template em uso"
      description="O painel admin apenas escolhe templates prontos. A estrutura e mantida no super admin."
      collapsed={Boolean(collapsedConfigSections.readonlyTemplate)}
      onToggle={() => toggleConfigSection('readonlyTemplate')}
      className="md:col-span-2"
    >
      <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-4 text-sm text-gray-500">
        <strong className="block text-base text-gray-900">{selectedTemplate?.name || 'Selecione um template'}</strong>
        <p className="mt-2">{selectedTemplate?.description || 'Escolha um template para montar encartes com produtos reais, logo e rodape do mercado.'}</p>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white/90 px-4 py-3">
          <span className="section-kicker">Canvas</span>
          <strong className="mt-1 block text-2xl">{selectedVariant?.canvasWidth || selectedTemplate?.canvasWidth || templateCanvasWidth} x {selectedVariant?.canvasHeight || selectedTemplate?.canvasHeight || templateCanvasHeight}</strong>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white/90 px-4 py-3">
          <span className="section-kicker">Slots</span>
          <strong className="mt-1 block text-2xl">{slotCount}</strong>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white/90 px-4 py-3">
          <span className="section-kicker">Rodape</span>
          <strong className="mt-1 block text-2xl">{footerVisible ? 'Ativo' : 'Oculto'}</strong>
        </div>
      </div>
      <div className="offer-studio-inline-actions wrap">
        <Button type="button" variant="secondary" onClick={onRefreshPreview} disabled={!selectedTemplateId}>
          <RefreshCw size={16} strokeWidth={2.1} />
          Atualizar previa
        </Button>
        <Button type="button" variant="secondary" onClick={onOpenCampaigns}>
          <Boxes size={16} strokeWidth={2.1} />
          Ver campanhas
        </Button>
      </div>
    </StudioCollapsibleSection>

    <StudioCollapsibleSection
      title="Estrutura"
      description="Resumo rapido da area de produtos e do rodape."
      collapsed={Boolean(collapsedConfigSections.readonlyStructure)}
      onToggle={() => toggleConfigSection('readonlyStructure')}
    >
      <div className="offer-studio-property-grid">
        <StudioPropertyRow label="Layout" value={contentZoneLayout} />
        <StudioPropertyRow label="Colunas x linhas" value={`${contentZoneColumns} x ${contentZoneRows}`} />
        <StudioPropertyRow label="Camadas" value={String(layerCount)} />
        <StudioPropertyRow label="Zonas" value={String(zoneCount)} />
        <StudioPropertyRow label="Logo primaria" value={footerLeftLogoVisible ? 'Sim' : 'Nao'} />
        <StudioPropertyRow label="Logo secundaria" value={footerRightLogoVisible ? 'Sim' : 'Nao'} />
      </div>
    </StudioCollapsibleSection>

    <StudioCollapsibleSection
      title="Card do produto"
      description="Receita visual usada para cada item da campanha."
      collapsed={Boolean(collapsedConfigSections.readonlyCard)}
      onToggle={() => toggleConfigSection('readonlyCard')}
    >
      <div className="offer-studio-property-grid">
        <StudioPropertyRow label="Raio do card" value={`${cardRadius}px`} />
        <StudioPropertyRow label="Raio do preco" value={`${priceBoxRadius}px`} />
        <StudioPropertyRow label="Mostrar unidade" value={showUnit ? 'Sim' : 'Nao'} />
        <StudioPropertyRow label="Mostrar descricao" value={showDescription ? 'Sim' : 'Nao'} />
        <StudioPropertyRow label="Preco anterior" value={showBaselinePrice ? 'Sim' : 'Nao'} />
        <StudioPropertyRow label="Prefixo" value={priceLabel} />
      </div>
    </StudioCollapsibleSection>

    <StudioCollapsibleSection
      title="Camadas e zonas"
      description="Consulta somente leitura do template selecionado."
      collapsed={Boolean(collapsedConfigSections.readonlyLayersZones)}
      onToggle={() => toggleConfigSection('readonlyLayersZones')}
      className="md:col-span-2"
    >
      <div className="offer-studio-theme-grid">
        <StudioCollapsibleSection
          title="Camadas"
          description={`${resolvedLayers.length} itens`}
          collapsed={Boolean(collapsedConfigSections.readonlyLayers)}
          onToggle={() => toggleConfigSection('readonlyLayers')}
        >
          <div className="offer-studio-structure-list">
            {resolvedLayers.length ? (
              resolvedLayers.map((layer, index) => (
                <StudioLayerRow
                  key={String(layer.id || `layer-${index}`)}
                  layer={layer}
                  active={String(layer.id || '') === String(activeLayerId || '')}
                  identified={String(layer.id || '') === String(canvasSelectedLayerId || '')}
                  onSelect={() => onSelectLayer(String(layer.id || ''))}
                />
              ))
            ) : (
              <div className="offer-studio-empty-card slim">Nenhuma camada resolvida para este template.</div>
            )}
          </div>
        </StudioCollapsibleSection>
        <StudioCollapsibleSection
          title="Zonas de produto"
          description={`${resolvedZones.length} areas`}
          collapsed={Boolean(collapsedConfigSections.readonlyZones)}
          onToggle={() => toggleConfigSection('readonlyZones')}
        >
          <div className="offer-studio-zone-list">
            {resolvedZones.length ? (
              resolvedZones.map((zone, index) => (
                <StudioZoneCard
                  key={String(zone.id || `zone-${index}`)}
                  zone={zone}
                  active={String(zone.id || '') === String(activeZoneId || '')}
                  identified={String(zone.id || '') === String(canvasSelectedZoneId || '')}
                  onSelect={() => onSelectZone(String(zone.id || ''))}
                />
              ))
            ) : (
              <div className="offer-studio-empty-card slim">Nenhuma zona de produto foi resolvida.</div>
            )}
          </div>
        </StudioCollapsibleSection>
      </div>
    </StudioCollapsibleSection>
  </div>
);

export default OfferStudioReadonlyThemePanel;
