import React from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Factory,
  FileText,
  GripVertical,
  ImageIcon,
  Layers3,
  LayoutTemplate,
  Lock,
  PackageSearch,
  Palette,
  Plus,
  QrCode,
  Scissors,
  SendHorizontal,
  Square,
  Tag,
  Trash2,
  Type,
  Unlock,
  type LucideIcon,
} from 'lucide-react';
import Button from '../../components/common/Button';
import OfferCanvasPreview from '../../components/offers/OfferCanvasPreview';
import OfferProductImage from '../../components/offers/OfferProductImage';
import type {
  OfferCatalogProduct,
  OfferGenerationJob,
  OfferTemplate,
} from '../../types/offers.types';

type JsonMap = Record<string, any>;

type BoundsDraft = {
  x: string;
  y: string;
  w: string;
  h: string;
};

const formatMoney = (value?: number | null) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));

const compactCategory = (value?: string | null) => (!value ? 'Sem categoria' : value.length > 72 ? `${value.slice(0, 69)}...` : value);

const normalizeColorValue = (value: string, fallback = '#ffffff') => {
  const normalized = String(value || '').trim();
  if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(normalized)) {
    if (normalized.length === 4) {
      const [, r, g, b] = normalized;
      return `#${r}${r}${g}${g}${b}${b}`;
    }
    return normalized.toLowerCase();
  }
  return fallback;
};

const layerTypeIcon = (type?: string): LucideIcon => {
  switch (String(type || '').toLowerCase()) {
    case 'background':
      return Palette;
    case 'brandlogo':
    case 'logo':
      return Factory;
    case 'campaignbadge':
    case 'badge':
      return Tag;
    case 'text':
    case 'headline':
    case 'subheadline':
      return Type;
    case 'qrcode':
      return QrCode;
    case 'shape':
      return Square;
    case 'image':
      return ImageIcon;
    case 'productzone':
      return PackageSearch;
    default:
      return Layers3;
  }
};

export const StudioToolButton: React.FC<{
  icon: LucideIcon;
  label: string;
  active: boolean;
  onClick: () => void;
}> = ({ icon: Icon, label, active, onClick }) => (
  <button type="button" className={`offer-studio-rail-button ${active ? 'active' : ''}`} onClick={onClick}>
    <span className="offer-studio-rail-icon-wrap">
      <Icon className="offer-studio-rail-icon" strokeWidth={2.1} />
    </span>
    <span>{label}</span>
  </button>
);

export const StudioSelectField: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}> = ({ label, value, onChange, options }) => (
  <label className="offer-studio-toolbar-field">
    <span>{label}</span>
    <select className="input" value={value} onChange={(event) => onChange(event.target.value)}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  </label>
);

export const StudioSearchResultCard: React.FC<{
  product: OfferCatalogProduct;
  inQueue: boolean;
  removingBackground?: boolean;
  onAdd: () => void;
  onCleanBackground?: () => void;
}> = ({ product, inQueue, removingBackground, onAdd, onCleanBackground }) => (
  <article className="offer-studio-result-card">
    <div className="offer-studio-result-frame">
      <OfferProductImage src={product.imageUrl} alt={product.name} className="offer-studio-result-image" />
    </div>
    <div className="offer-studio-result-body">
      <h3>{product.name}</h3>
      <p>{compactCategory(product.category)}</p>
      <div className="offer-studio-result-meta">
        <span>{product.unit || 'Unidade'}</span>
        <strong>{formatMoney(product.currentPrice)}</strong>
      </div>
    </div>
    <div className="offer-studio-card-actions">
      <Button type="button" variant={inQueue ? 'secondary' : 'primary'} onClick={onAdd} disabled={inQueue}>
        {inQueue ? <Check size={16} strokeWidth={2.2} /> : <Plus size={16} strokeWidth={2.2} />}
        {inQueue ? 'Na fila' : 'Adicionar'}
      </Button>
      {onCleanBackground ? (
        <Button type="button" variant="ghost" onClick={onCleanBackground} disabled={removingBackground}>
          <Scissors size={15} strokeWidth={2.1} />
          {removingBackground ? 'Limpando...' : 'Limpar fundo'}
        </Button>
      ) : null}
    </div>
  </article>
);

export const StudioTemplateCard: React.FC<{
  template: OfferTemplate;
  selected: boolean;
  onUse: () => void;
}> = ({ template, selected, onUse }) => (
  <button type="button" className={`offer-studio-template-card ${selected ? 'selected' : ''}`} onClick={onUse}>
    <OfferCanvasPreview template={template} className="offer-studio-template-preview" />
    <div className="offer-studio-template-copy">
      <span className="section-kicker">{template.channel}</span>
      <strong>{template.name}</strong>
      <small>{template.description || 'Template pronto para automacao.'}</small>
    </div>
  </button>
);

export const StudioQueueCard: React.FC<{
  product: OfferCatalogProduct;
  removingBackground?: boolean;
  onRemove: () => void;
  onCleanBackground?: () => void;
}> = ({ product, removingBackground, onRemove, onCleanBackground }) => (
  <article className="offer-studio-queue-card">
    <div className="offer-studio-queue-main">
      <div className="offer-studio-queue-frame">
        <OfferProductImage src={product.imageUrl} alt={product.name} className="offer-studio-queue-image" />
      </div>
      <div className="offer-studio-queue-copy">
        <h3>{product.name}</h3>
        <p>{compactCategory(product.category)}</p>
        <div className="offer-studio-queue-meta">
          <span>{product.unit || 'Unidade'}</span>
          <strong>{formatMoney(product.currentPrice)}</strong>
        </div>
      </div>
    </div>
    <div className="offer-studio-card-actions">
      {onCleanBackground ? (
        <Button type="button" variant="ghost" onClick={onCleanBackground} disabled={removingBackground}>
          <Scissors size={15} strokeWidth={2.1} />
          {removingBackground ? 'Limpando...' : 'Limpar fundo'}
        </Button>
      ) : null}
      <Button type="button" variant="secondary" onClick={onRemove}>
        <Trash2 size={16} strokeWidth={2.1} />
        Remover
      </Button>
    </div>
  </article>
);

export const StudioLayerRow: React.FC<{
  layer: JsonMap;
  active: boolean;
  identified?: boolean;
  onSelect: () => void;
  draggableLayer?: boolean;
  dragging?: boolean;
  dropTarget?: boolean;
  onDragStart?: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragOver?: (event: React.DragEvent<HTMLDivElement>) => void;
  onDrop?: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd?: () => void;
  onToggleVisibility?: () => void;
  onToggleLock?: () => void;
  onDelete?: () => void;
}> = ({ layer, active, identified = false, onSelect, draggableLayer = false, dragging = false, dropTarget = false, onDragStart, onDragOver, onDrop, onDragEnd, onToggleVisibility, onToggleLock, onDelete }) => {
  const Icon = layerTypeIcon(String(layer.type || layer.kind || 'layer'));
  const visibilityLabel = layer.visible === false ? 'Mostrar camada' : 'Ocultar camada';
  const lockLabel = layer.locked ? 'Desbloquear camada' : 'Bloquear camada';
  const canToggleVisibility = Boolean(onToggleVisibility);
  const canToggleLock = Boolean(onToggleLock);
  const canDelete = Boolean(onDelete);
  return (
    <div
      className={`offer-studio-structure-row ${active ? 'active' : ''} ${identified ? 'canvas-linked' : ''} ${draggableLayer ? 'draggable' : ''} ${dragging ? 'dragging' : ''} ${dropTarget ? 'drop-target' : ''}`}
      data-structure-layer-id={String(layer.id || '')}
      draggable={draggableLayer}
      onDragStart={draggableLayer ? onDragStart : undefined}
      onDragOver={draggableLayer ? onDragOver : undefined}
      onDrop={draggableLayer ? onDrop : undefined}
      onDragEnd={draggableLayer ? onDragEnd : undefined}
    >
      {draggableLayer ? (
        <span className="offer-studio-structure-grip" aria-hidden="true">
          <GripVertical size={16} strokeWidth={2.1} />
        </span>
      ) : null}
      <button type="button" className="offer-studio-structure-main" onClick={onSelect} aria-current={active || identified ? 'true' : undefined}>
        <span className="offer-studio-structure-icon">
          <Icon size={16} strokeWidth={2.1} />
        </span>
        <span className="offer-studio-structure-copy">
          <strong>{String(layer.name || layer.id || 'Camada')}</strong>
          <small>{String(layer.type || 'layer')}</small>
        </span>
        <span className="offer-studio-structure-flags">
          {identified ? <span className="offer-studio-structure-badge">Na arte</span> : null}
          {layer.locked && !canToggleLock ? <Lock size={14} strokeWidth={2.1} /> : null}
          {layer.visible === false && !canToggleVisibility ? <EyeOff size={14} strokeWidth={2.1} className="opacity-45" /> : null}
        </span>
      </button>
      {canToggleVisibility || canToggleLock || canDelete ? (
        <div className="offer-studio-structure-actions">
          {canToggleVisibility ? (
            <button
              type="button"
              className={`offer-studio-structure-lock ${layer.visible === false ? 'muted' : 'visible'}`}
              onClick={(event) => {
                event.stopPropagation();
                onToggleVisibility?.();
              }}
              title={visibilityLabel}
              aria-label={visibilityLabel}
            >
              {layer.visible === false ? <EyeOff size={15} strokeWidth={2.1} /> : <Eye size={15} strokeWidth={2.1} />}
            </button>
          ) : null}
          {canDelete ? (
            <button
              type="button"
              className="offer-studio-structure-lock danger"
              onClick={(event) => {
                event.stopPropagation();
                onDelete?.();
              }}
              title="Excluir camada"
              aria-label="Excluir camada"
            >
              <Trash2 size={15} strokeWidth={2.1} />
            </button>
          ) : null}
          {canToggleLock ? (
            <button
              type="button"
              className={`offer-studio-structure-lock ${layer.locked ? 'active' : ''}`}
              onClick={(event) => {
                event.stopPropagation();
                onToggleLock?.();
              }}
              title={lockLabel}
              aria-label={lockLabel}
            >
              {layer.locked ? <Lock size={15} strokeWidth={2.1} /> : <Unlock size={15} strokeWidth={2.1} />}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

export const StudioZoneCard: React.FC<{
  zone: JsonMap;
  active: boolean;
  identified?: boolean;
  onSelect: () => void;
}> = ({ zone, active, identified = false, onSelect }) => (
  <button
    type="button"
    className={`offer-studio-zone-card ${active ? 'active' : ''} ${identified ? 'canvas-linked' : ''}`}
    data-structure-zone-id={String(zone.id || '')}
    onClick={onSelect}
    aria-current={active || identified ? 'true' : undefined}
  >
    <div>
      <span className="section-kicker">{String(zone.layout || 'grid')}</span>
      <strong>{String(zone.name || zone.id || 'Zona')}</strong>
    </div>
    <div className="offer-studio-zone-meta">
      {identified ? <span className="offer-studio-structure-badge">Na arte</span> : null}
      <span>{Number(zone.slotCount || 0)} slots</span>
      <span>{Number(zone.columns || 1)} colunas</span>
    </div>
  </button>
);

export const StudioPropertyRow: React.FC<{ label: string; value?: React.ReactNode }> = ({ label, value }) => (
  <div className="offer-studio-property-row">
    <span>{label}</span>
    <strong>{value ?? '-'}</strong>
  </div>
);

export const StudioBoundsFields: React.FC<{
  value: BoundsDraft;
  onChange: (next: BoundsDraft) => void;
}> = ({ value, onChange }) => (
  <div className="offer-studio-bounds-grid">
    <label className="offer-studio-text-field">
      <span>X</span>
      <input className="input" inputMode="numeric" value={value.x} onChange={(event) => onChange({ ...value, x: event.target.value })} />
    </label>
    <label className="offer-studio-text-field">
      <span>Y</span>
      <input className="input" inputMode="numeric" value={value.y} onChange={(event) => onChange({ ...value, y: event.target.value })} />
    </label>
    <label className="offer-studio-text-field">
      <span>Largura</span>
      <input className="input" inputMode="numeric" value={value.w} onChange={(event) => onChange({ ...value, w: event.target.value })} />
    </label>
    <label className="offer-studio-text-field">
      <span>Altura</span>
      <input className="input" inputMode="numeric" value={value.h} onChange={(event) => onChange({ ...value, h: event.target.value })} />
    </label>
  </div>
);

export const StudioColorField: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}> = ({ label, value, onChange, placeholder }) => (
  <label className="offer-studio-text-field offer-studio-color-field">
    <span>{label}</span>
    <div className="offer-studio-color-control">
      <input
        className="offer-studio-color-picker"
        type="color"
        value={normalizeColorValue(value, placeholder || '#ffffff')}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
      />
      <input
        className="input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
      />
    </div>
  </label>
);

export const StudioAssetStatus: React.FC<{
  label: string;
  storageKey?: string | null;
  hasAsset?: boolean;
  readyLabel?: string;
  emptyLabel?: string;
}> = ({ label, storageKey, hasAsset = false, readyLabel = 'Imagem persistida no banco e no storage.', emptyLabel = 'Nenhuma imagem enviada ainda.' }) => {
  const ready = Boolean(storageKey) || hasAsset;
  return (
    <div className={`offer-studio-asset-status ${ready ? 'is-ready' : 'is-empty'}`} role="status" aria-live="polite">
      <div className="offer-studio-asset-status-head">
        <ImageIcon size={16} strokeWidth={2} />
        <span>{label}</span>
      </div>
      <strong>{ready ? readyLabel : emptyLabel}</strong>
      <small>{storageKey ? `Storage key: ${storageKey}` : ready ? 'Arquivo gerenciado pelo template.' : 'Envie um arquivo para vincular este asset ao template.'}</small>
    </div>
  );
};

export const StudioCollapsibleSection: React.FC<{
  title: string;
  description?: string;
  collapsed: boolean;
  onToggle: () => void;
  className?: string;
  containerClassName?: string;
  children: React.ReactNode;
}> = ({ title, description, collapsed, onToggle, className, containerClassName, children }) => (
  <section className={[containerClassName || 'offer-studio-theme-card', 'offer-studio-collapsible-section', collapsed ? 'is-collapsed' : '', className].filter(Boolean).join(' ')}>
    <button type="button" className={`offer-studio-panel-subhead offer-studio-panel-subhead-button ${collapsed ? 'is-collapsed' : ''}`} onClick={onToggle} aria-expanded={!collapsed}>
      <span className="offer-studio-collapsible-copy">
        <span className="section-kicker">{title}</span>
        {description ? <small>{description}</small> : null}
      </span>
      <span className="offer-studio-collapsible-toggle">
        <span className="offer-studio-collapsible-toggle-label">{collapsed ? 'Expandir' : 'Recolher'}</span>
        {collapsed ? <ChevronDown size={16} strokeWidth={2.2} /> : <ChevronUp size={16} strokeWidth={2.2} />}
      </span>
    </button>
    {!collapsed ? children : null}
  </section>
);

export const parseStringList = (value?: string | null, fallback: string[] = []) => {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : fallback;
  } catch {
    return fallback;
  }
};

export const formatDateTime = (value?: string | null) => (value ? new Date(value).toLocaleString('pt-BR') : 'Agora');

export const getCampaignState = (job: OfferGenerationJob) => {
  const normalized = String(job.status || '').toUpperCase();
  const readyOutputs = job.outputs?.filter((output) => String(output.status || '').toUpperCase() === 'READY').length || 0;
  const failedOutputs = job.outputs?.filter((output) => String(output.status || '').toUpperCase() === 'FAILED').length || 0;

  if (normalized === 'FAILED' || (failedOutputs > 0 && readyOutputs === 0)) {
    return { key: 'failed', label: 'Falhou', pillClass: 'negative' } as const;
  }
  if (normalized === 'READY' || normalized === 'PARTIAL' || readyOutputs > 0) {
    return { key: 'published', label: normalized === 'PARTIAL' ? 'Publicado com alerta' : 'Publicado', pillClass: 'positive' } as const;
  }
  if (normalized === 'PROCESSING' || normalized === 'QUEUED') {
    return { key: 'processing', label: 'Publicando', pillClass: 'soft' } as const;
  }
  return { key: 'draft', label: 'Rascunho', pillClass: 'soft' } as const;
};

export const StudioSideSheet: React.FC<{
  open: boolean;
  title: string;
  subtitle: string;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ open, title, subtitle, onClose, children }) => {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[90] flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        aria-label="Fechar painel lateral"
        onClick={onClose}
      />
      <aside className="relative z-[91] flex h-full w-full max-w-[560px] flex-col border-l border-gray-200 bg-white shadow-[-18px_0_42px_rgba(0,0,0,0.08)]">
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-5">
          <div>
            <span className="section-kicker">{title}</span>
            <h2 className="mt-2 text-[1.7rem] font-semibold tracking-[-0.04em] text-gray-900">{subtitle}</h2>
          </div>
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-900"
            aria-label="Fechar painel lateral"
            onClick={onClose}
          >
            <EyeOff size={16} strokeWidth={2.2} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <div className="flex flex-col gap-4">{children}</div>
        </div>
      </aside>
    </div>
  );
};

export type StudioToolOption = {
  key: string;
  icon: LucideIcon;
  label: string;
};
