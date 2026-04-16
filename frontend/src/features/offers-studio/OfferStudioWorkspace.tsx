import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import OfferCanvasPreview from '../../components/offers/OfferCanvasPreview';
import type { OfferCatalogProduct, OfferTemplate } from '../../types/offers.types';

type CanvasOverlayBounds = {
  x: number;
  y: number;
  w: number;
  h: number;
};

type CanvasEditableOverlay = {
  key: string;
  label: string;
  accent: string;
  overlayLevel: number;
  editing?: boolean;
  visible?: boolean;
  bounds: CanvasOverlayBounds;
};

type OfferStudioWorkspaceProps = {
  toolPanelCollapsed: boolean;
  onTogglePanelCollapsed: () => void;
  topbarActions?: React.ReactNode;
  toolbar: React.ReactNode;
  stageTitle: string;
  stageBadges?: React.ReactNode;
  stageMeta?: React.ReactNode;
  showEditBanner?: boolean;
  editBannerLabel?: string;
  stageSurfaceRef: React.RefObject<HTMLDivElement>;
  stageArtboardRef: React.RefObject<HTMLDivElement>;
  scaledStageWidth: number;
  scaledStageHeight: number;
  stageCanvasWidth: number;
  stageCanvasHeight: number;
  stageScale: number;
  selectedTemplate?: OfferTemplate | null;
  effectiveResolvedDesignJson?: string | null;
  stageProducts: OfferCatalogProduct[];
  stageGridLimit: number;
  gridPreset: string;
  footerText?: string | null;
  colorMode: string;
  productBoxMode: string;
  builderMode: boolean;
  canvasEditableOverlays: CanvasEditableOverlay[];
  canvasHighlightedTarget?: string | null;
  onCanvasEditPointerStart: (target: string, mode: 'move' | 'resize', event: React.MouseEvent<HTMLButtonElement>) => void;
  onCanvasGuideClick: (target: string) => void;
  outputMeta?: React.ReactNode;
  outputActions?: React.ReactNode;
};

const OfferStudioWorkspace: React.FC<OfferStudioWorkspaceProps> = ({
  toolPanelCollapsed,
  onTogglePanelCollapsed,
  topbarActions,
  toolbar,
  stageTitle,
  stageBadges,
  stageMeta,
  showEditBanner = false,
  editBannerLabel,
  stageSurfaceRef,
  stageArtboardRef,
  scaledStageWidth,
  scaledStageHeight,
  stageCanvasWidth,
  stageCanvasHeight,
  stageScale,
  selectedTemplate,
  effectiveResolvedDesignJson,
  stageProducts,
  stageGridLimit,
  gridPreset,
  footerText,
  colorMode,
  productBoxMode,
  builderMode,
  canvasEditableOverlays,
  canvasHighlightedTarget,
  onCanvasEditPointerStart,
  onCanvasGuideClick,
  outputMeta,
  outputActions,
}) => (
  <section className="offer-studio-workspace">
    <div className="offer-studio-workspace-topbar">
      <button
        type="button"
        className="offer-studio-panel-toggle"
        onClick={onTogglePanelCollapsed}
        aria-label={toolPanelCollapsed ? 'Expandir painel de ferramentas' : 'Recolher painel de ferramentas'}
      >
        {toolPanelCollapsed ? <ChevronRight size={16} strokeWidth={2.2} /> : <ChevronLeft size={16} strokeWidth={2.2} />}
        <span>{toolPanelCollapsed ? 'Expandir ferramentas' : 'Recolher ferramentas'}</span>
      </button>
      {topbarActions}
    </div>

    <div className="offer-studio-toolbar">
      {toolbar}
    </div>

    <div className="offer-studio-stage-wrap">
      <div className="offer-studio-stage-header">
        <div>
          <span className="section-kicker">Prévia da arte</span>
          <h2>{stageTitle}</h2>
          {stageBadges ? <div className="mt-3 flex flex-wrap gap-2">{stageBadges}</div> : null}
        </div>
        {stageMeta ? <div className="offer-studio-stage-meta">{stageMeta}</div> : null}
      </div>

      {showEditBanner ? (
        <div className="offer-studio-stage-edit-banner">
          <strong>Editando na arte: {editBannerLabel}</strong>
          <span>Arraste a area para mover e use o canto inferior direito para redimensionar.</span>
        </div>
      ) : null}

      <div ref={stageSurfaceRef} className="offer-studio-stage-surface">
        <div className="offer-studio-stage-canvas" style={{ width: `${scaledStageWidth}px`, height: `${scaledStageHeight}px` }}>
          <div
            ref={stageArtboardRef}
            className="offer-studio-stage-artboard"
            style={{ width: `${stageCanvasWidth}px`, height: `${stageCanvasHeight}px`, transform: `scale(${stageScale})`, transformOrigin: 'top left' }}
          >
            <OfferCanvasPreview
              template={selectedTemplate || null}
              resolvedDesignJson={effectiveResolvedDesignJson || null}
              products={stageProducts}
              gridLimit={stageGridLimit}
              gridPreset={gridPreset}
              footerText={builderMode ? null : footerText}
              respectCanvasDimensions
              className={`offer-studio-canvas-preview color-${colorMode.toLowerCase()} mode-${productBoxMode.toLowerCase()}`}
            />
            {builderMode ? (
              <div className="offer-studio-stage-editor">
                {canvasEditableOverlays.map((item) => (
                  <div
                    key={item.key}
                    className={`offer-studio-stage-guide ${canvasHighlightedTarget === item.key ? 'active' : ''} ${item.editing ? 'editing' : ''} ${item.visible ? '' : 'is-hidden'}`}
                    style={{
                      left: `${item.bounds.x}px`,
                      top: `${item.bounds.y}px`,
                      width: `${item.bounds.w}px`,
                      height: `${item.bounds.h}px`,
                      color: item.accent,
                      background: `${item.accent}1a`,
                      zIndex: item.overlayLevel,
                    }}
                  >
                    <button
                      type="button"
                      className="offer-studio-stage-guide-body"
                      onMouseDown={(event) => onCanvasEditPointerStart(item.key, 'move', event)}
                      onClick={() => onCanvasGuideClick(item.key)}
                    >
                      <span className="offer-studio-stage-guide-label">{item.label}</span>
                    </button>
                    <button
                      type="button"
                      className="offer-studio-stage-guide-handle"
                      onMouseDown={(event) => onCanvasEditPointerStart(item.key, 'resize', event)}
                      aria-label={`Redimensionar ${item.label}`}
                      title={`Redimensionar ${item.label}`}
                    />
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="offer-studio-output-bar">
        <div className="offer-studio-output-meta">{outputMeta}</div>
        <div className="offer-studio-output-actions">{outputActions}</div>
      </div>
    </div>
  </section>
);

export default OfferStudioWorkspace;
