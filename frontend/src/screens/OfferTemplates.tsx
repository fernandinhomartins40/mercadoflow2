import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Layers3, Palette, Plus, RefreshCw, Save, Sparkles } from 'lucide-react';
import Button from '../components/common/Button';
import Layout from '../components/layout/Layout';
import OfferCanvasPreview from '../components/offers/OfferCanvasPreview';
import { useAuth } from '../context/AuthContext';
import { useOffersService } from '../hooks/useOffersService';
import {
  OfferBrandKit,
  OfferCampaignKit,
  OfferTemplate,
  OfferTemplateValidation,
  OfferTemplateVariant,
} from '../types/offers.types';

// ─── Valores padrão dos formulários ─────────────────────────────────────────
const emptyTemplateForm = {
  name: '',
  description: '',
  channel: 'PRINT',
  canvasWidth: 1080,
  canvasHeight: 1350,
  schemaVersion: 2,
  masterTemplateKey: '',
  defaultVariantKey: '',
  brandKitId: '',
  campaignKitId: '',
  designJson: '',
  active: true,
};

const emptyVariantForm = {
  variantKey: '',
  name: '',
  canvasWidth: 1080,
  canvasHeight: 1350,
  variantJson: '',
  previewImageUrl: '',
  active: true,
};

const emptyBrandKitForm = {
  kitKey: '',
  name: '',
  description: '',
  tokensJson: '',
  assetsJson: '',
  active: true,
};

const emptyCampaignKitForm = {
  kitKey: '',
  name: '',
  description: '',
  seasonKey: '',
  startsAt: '',
  endsAt: '',
  tokensJson: '',
  assetsJson: '',
  active: true,
};

const prettyJson = (value?: string | null) => {
  if (!value) return '';
  try { return JSON.stringify(JSON.parse(value), null, 2); } catch { return value; }
};

const isoInputValue = (value?: string | null) => (value ? value.slice(0, 16) : '');

type TabId = 'templates' | 'variants' | 'brand' | 'campaign';

// ─── Field primitivos ────────────────────────────────────────────────────────
const Field: React.FC<{ label: string; full?: boolean; children: React.ReactNode }> = ({ label, full, children }) => (
  <label className={`otm-field ${full ? 'full' : ''}`}>
    <span className="otm-field-label">{label}</span>
    {children}
  </label>
);

const TextInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => (
  <input className="input otm-input" {...props} />
);

const SelectInput: React.FC<React.SelectHTMLAttributes<HTMLSelectElement> & { children: React.ReactNode }> = ({ children, ...props }) => (
  <select className="input otm-input" {...props}>{children}</select>
);

const TextareaInput: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement> & { mono?: boolean }> = ({ mono, ...props }) => (
  <textarea className={`input otm-input ${mono ? 'otm-json' : ''}`} {...props} />
);

// ─── JSON colapsável (avançado) ──────────────────────────────────────────────
const CollapsibleJson: React.FC<{ label: string; value: string; onChange: (value: string) => void; rows?: number }> = ({ label, value, onChange, rows = 12 }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="otm-field full">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition hover:opacity-80" style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-soft)', color: 'var(--text-muted)' }}>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        {label}
        {value && <span className="ml-auto text-xs text-emerald-600">Configurado</span>}
      </button>
      {open && (
        <TextareaInput mono rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
};

// ─── Navigation tab ──────────────────────────────────────────────────────────
const NavTab: React.FC<{ id: TabId; active: boolean; icon: React.ReactNode; label: string; count: number; onClick: () => void }> = ({
  active, icon, label, count, onClick,
}) => (
  <button type="button" onClick={onClick} className={`otm-nav-tab ${active ? 'active' : ''}`}>
    <span className="otm-nav-tab-icon">{icon}</span>
    <span className="otm-nav-tab-label">{label}</span>
    <span className="otm-nav-tab-count">{count}</span>
  </button>
);

// ─── Item de lista selecionável ──────────────────────────────────────────────
const ListItem: React.FC<{
  selected: boolean;
  title: string;
  subtitle?: string;
  onClick: () => void;
}> = ({ selected, title, subtitle, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`otm-list-item ${selected ? 'selected' : ''}`}
  >
    <strong className="otm-list-item-title">{title}</strong>
    {subtitle && <small className="otm-list-item-sub">{subtitle}</small>}
  </button>
);

// ─── Template list item com preview ─────────────────────────────────────────
const TemplateListItem: React.FC<{
  template: OfferTemplate;
  selected: boolean;
  onClick: () => void;
}> = ({ template, selected, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`otm-template-item ${selected ? 'selected' : ''}`}
  >
    <div className="otm-template-item-preview">
      <OfferCanvasPreview template={template} className="otm-template-item-canvas" />
    </div>
    <div className="otm-template-item-body">
      <span className="section-kicker">{template.channel}</span>
      <strong className="otm-template-item-name">{template.name}</strong>
      <small className="otm-template-item-meta">{template.canvasWidth}×{template.canvasHeight}</small>
    </div>
  </button>
);

// ─── Painel de validação ─────────────────────────────────────────────────────
const ValidationBadge: React.FC<{ validation: OfferTemplateValidation | null }> = ({ validation }) => {
  if (!validation) return null;
  const ok = validation.valid;
  return (
    <div className={`otm-validation ${ok ? 'valid' : 'invalid'}`}>
      <span>{ok ? '✓ Template válido' : `⚠ ${validation.messages?.length || 0} erro(s) de validação`}</span>
    </div>
  );
};

// ─── Screen principal ────────────────────────────────────────────────────────
const OfferTemplates: React.FC = () => {
  const { marketId } = useAuth();
  const offersService = useOffersService();
  const [activeTab, setActiveTab] = useState<TabId>('templates');

  const [templates, setTemplates] = useState<OfferTemplate[]>([]);
  const [variants, setVariants] = useState<OfferTemplateVariant[]>([]);
  const [brandKits, setBrandKits] = useState<OfferBrandKit[]>([]);
  const [campaignKits, setCampaignKits] = useState<OfferCampaignKit[]>([]);
  const [validation, setValidation] = useState<OfferTemplateValidation | null>(null);

  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [selectedBrandKitId, setSelectedBrandKitId] = useState<string | null>(null);
  const [selectedCampaignKitId, setSelectedCampaignKitId] = useState<string | null>(null);

  const [templateForm, setTemplateForm] = useState(emptyTemplateForm);
  const [variantForm, setVariantForm] = useState(emptyVariantForm);
  const [brandKitForm, setBrandKitForm] = useState(emptyBrandKitForm);
  const [campaignKitForm, setCampaignKitForm] = useState(emptyCampaignKitForm);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === selectedTemplateId) || null,
    [templates, selectedTemplateId],
  );

  const loadTemplateMeta = async (templateId?: string | null, templateList = templates) => {
    if (!marketId || !templateId) {
      setVariants([]);
      setValidation(null);
      return;
    }
    try {
      const [variantData, validationData] = await Promise.all([
        offersService.getTemplateVariants(marketId, templateId),
        offersService.validateTemplate(marketId, templateId),
      ]);
      setVariants(variantData);
      setValidation(validationData);
      const currentTemplate = templateList.find((t) => t.id === templateId) || null;
      setTemplateForm({
        name: currentTemplate?.name || '',
        description: currentTemplate?.description || '',
        channel: currentTemplate?.channel || 'PRINT',
        canvasWidth: currentTemplate?.canvasWidth || 1080,
        canvasHeight: currentTemplate?.canvasHeight || 1350,
        schemaVersion: currentTemplate?.schemaVersion || 2,
        masterTemplateKey: currentTemplate?.masterTemplateKey || '',
        defaultVariantKey: currentTemplate?.defaultVariantKey || variantData[0]?.variantKey || '',
        brandKitId: currentTemplate?.brandKitId || '',
        campaignKitId: currentTemplate?.campaignKitId || '',
        designJson: prettyJson(currentTemplate?.designJson),
        active: currentTemplate?.active ?? true,
      });
      if (variantData.length) {
        setSelectedVariantId(variantData[0].id);
        setVariantForm({
          variantKey: variantData[0].variantKey,
          name: variantData[0].name,
          canvasWidth: variantData[0].canvasWidth,
          canvasHeight: variantData[0].canvasHeight,
          variantJson: prettyJson(variantData[0].variantJson),
          previewImageUrl: variantData[0].previewImageUrl || '',
          active: variantData[0].active,
        });
      } else {
        setSelectedVariantId(null);
        setVariantForm(emptyVariantForm);
      }
    } catch (err: any) {
      setError(err?.message || 'Não foi possível carregar as variantes.');
    }
  };

  const loadAll = async () => {
    if (!marketId) return;
    setLoading(true);
    try {
      const [templateData, brandData, campaignData] = await Promise.all([
        offersService.getTemplates(marketId),
        offersService.getBrandKits(marketId),
        offersService.getCampaignKits(marketId),
      ]);
      setTemplates(templateData);
      setBrandKits(brandData);
      setCampaignKits(campaignData);

      const templateId = selectedTemplateId || templateData[0]?.id || null;
      setSelectedTemplateId(templateId);
      await loadTemplateMeta(templateId, templateData);

      const firstBrand = brandData[0] || null;
      setSelectedBrandKitId(firstBrand?.id || null);
      setBrandKitForm(firstBrand ? {
        kitKey: firstBrand.kitKey || '',
        name: firstBrand.name,
        description: firstBrand.description || '',
        tokensJson: prettyJson(firstBrand.tokensJson),
        assetsJson: prettyJson(firstBrand.assetsJson),
        active: firstBrand.active,
      } : emptyBrandKitForm);

      const firstCampaign = campaignData[0] || null;
      setSelectedCampaignKitId(firstCampaign?.id || null);
      setCampaignKitForm(firstCampaign ? {
        kitKey: firstCampaign.kitKey || '',
        name: firstCampaign.name,
        description: firstCampaign.description || '',
        seasonKey: firstCampaign.seasonKey || '',
        startsAt: isoInputValue(firstCampaign.startsAt),
        endsAt: isoInputValue(firstCampaign.endsAt),
        tokensJson: prettyJson(firstCampaign.tokensJson),
        assetsJson: prettyJson(firstCampaign.assetsJson),
        active: firstCampaign.active,
      } : emptyCampaignKitForm);

      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Não foi possível carregar a biblioteca de ofertas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadAll(); }, [marketId]);

  const showNotice = (msg: string) => {
    setSaveNotice(msg);
    setTimeout(() => setSaveNotice(null), 3000);
  };

  const selectTemplate = async (template: OfferTemplate) => {
    setSelectedTemplateId(template.id);
    await loadTemplateMeta(template.id);
  };

  const selectVariant = (variant: OfferTemplateVariant) => {
    setSelectedVariantId(variant.id);
    setVariantForm({
      variantKey: variant.variantKey,
      name: variant.name,
      canvasWidth: variant.canvasWidth,
      canvasHeight: variant.canvasHeight,
      variantJson: prettyJson(variant.variantJson),
      previewImageUrl: variant.previewImageUrl || '',
      active: variant.active,
    });
  };

  const selectBrandKit = (kit: OfferBrandKit) => {
    setSelectedBrandKitId(kit.id);
    setBrandKitForm({
      kitKey: kit.kitKey || '',
      name: kit.name,
      description: kit.description || '',
      tokensJson: prettyJson(kit.tokensJson),
      assetsJson: prettyJson(kit.assetsJson),
      active: kit.active,
    });
  };

  const selectCampaignKit = (kit: OfferCampaignKit) => {
    setSelectedCampaignKitId(kit.id);
    setCampaignKitForm({
      kitKey: kit.kitKey || '',
      name: kit.name,
      description: kit.description || '',
      seasonKey: kit.seasonKey || '',
      startsAt: isoInputValue(kit.startsAt),
      endsAt: isoInputValue(kit.endsAt),
      tokensJson: prettyJson(kit.tokensJson),
      assetsJson: prettyJson(kit.assetsJson),
      active: kit.active,
    });
  };

  const handleTemplateSave = async () => {
    if (!marketId) return;
    setSaving(true);
    try {
      const payload = { ...templateForm, designJson: prettyJson(templateForm.designJson) };
      if (selectedTemplateId) {
        await offersService.updateTemplate(marketId, selectedTemplateId, payload);
      } else {
        await offersService.createTemplate(marketId, payload);
      }
      await loadAll();
      showNotice('Modelo salvo com sucesso.');
    } catch (err: any) {
      setError(err?.message || 'Não foi possível salvar o template.');
    } finally {
      setSaving(false);
    }
  };

  const handleVariantSave = async () => {
    if (!marketId || !selectedTemplateId) return;
    setSaving(true);
    try {
      const payload = { ...variantForm, variantJson: prettyJson(variantForm.variantJson) };
      if (selectedVariantId) {
        await offersService.updateTemplateVariant(marketId, selectedVariantId, payload);
      } else {
        await offersService.createTemplateVariant(marketId, selectedTemplateId, payload);
      }
      await loadTemplateMeta(selectedTemplateId);
      showNotice('Formato salvo com sucesso.');
    } catch (err: any) {
      setError(err?.message || 'Não foi possível salvar a variante.');
    } finally {
      setSaving(false);
    }
  };

  const handleBrandKitSave = async () => {
    if (!marketId) return;
    setSaving(true);
    try {
      const payload = { ...brandKitForm, tokensJson: prettyJson(brandKitForm.tokensJson), assetsJson: prettyJson(brandKitForm.assetsJson) };
      if (selectedBrandKitId) {
        await offersService.updateBrandKit(marketId, selectedBrandKitId, payload);
      } else {
        await offersService.createBrandKit(marketId, payload);
      }
      await loadAll();
      showNotice('Identidade visual salva com sucesso.');
    } catch (err: any) {
      setError(err?.message || 'Não foi possível salvar o brand kit.');
    } finally {
      setSaving(false);
    }
  };

  const handleCampaignKitSave = async () => {
    if (!marketId) return;
    setSaving(true);
    try {
      const payload = {
        ...campaignKitForm,
        startsAt: campaignKitForm.startsAt || null,
        endsAt: campaignKitForm.endsAt || null,
        tokensJson: prettyJson(campaignKitForm.tokensJson),
        assetsJson: prettyJson(campaignKitForm.assetsJson),
      };
      if (selectedCampaignKitId) {
        await offersService.updateCampaignKit(marketId, selectedCampaignKitId, payload);
      } else {
        await offersService.createCampaignKit(marketId, payload);
      }
      await loadAll();
      showNotice('Tema sazonal salvo com sucesso.');
    } catch (err: any) {
      setError(err?.message || 'Não foi possível salvar o campaign kit.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout>
      <div className="page offers-page">

        {/* ── Header da página ──────────────────────────────────────── */}
        <header className="otm-page-header reveal">
          <div>
            <span className="section-kicker">Gerenciador de modelos</span>
            <h1 className="otm-page-title">Modelos de encarte</h1>
            <p className="otm-page-desc">Crie e gerencie modelos, formatos, estilos visuais e temas sazonais.</p>
          </div>
          <div className="otm-page-actions">
            <Button
              type="button"
              variant="secondary"
              onClick={() => { setSelectedTemplateId(null); setTemplateForm(emptyTemplateForm); setActiveTab('templates'); }}
            >
              <Plus size={15} strokeWidth={2.2} />
              Novo modelo
            </Button>
            <Button type="button" variant="secondary" onClick={() => void loadAll()}>
              <RefreshCw size={15} strokeWidth={2.2} />
              Atualizar
            </Button>
          </div>
        </header>

        {/* ── Notificações ─────────────────────────────────────────── */}
        {error && <div className="ocm-banner ocm-banner-error">{error}</div>}
        {saveNotice && <div className="ocm-banner ocm-banner-success">{saveNotice}</div>}
        {loading && <div className="ofd-feedback">Carregando biblioteca…</div>}

        {!loading && (
          <>
            {/* ── Navigation tabs ───────────────────────────────────── */}
            <nav className="otm-nav reveal">
              <NavTab id="templates" active={activeTab === 'templates'} icon={<Layers3 size={15} />} label="Modelos" count={templates.length} onClick={() => setActiveTab('templates')} />
              <NavTab id="variants" active={activeTab === 'variants'} icon={<Layers3 size={15} />} label="Formatos" count={variants.length} onClick={() => setActiveTab('variants')} />
              <NavTab id="brand" active={activeTab === 'brand'} icon={<Palette size={15} />} label="Identidade visual" count={brandKits.length} onClick={() => setActiveTab('brand')} />
              <NavTab id="campaign" active={activeTab === 'campaign'} icon={<Sparkles size={15} />} label="Temas sazonais" count={campaignKits.length} onClick={() => setActiveTab('campaign')} />
            </nav>

            {/* ══ Tab: Templates ════════════════════════════════════ */}
            {activeTab === 'templates' && (
              <div className="otm-layout reveal">
                {/* Lista de templates */}
                <aside className="otm-list-panel">
                  <div className="otm-list-panel-head">
                    <h2 className="otm-list-panel-title">Modelos</h2>
                    <span className="otm-list-panel-count">{templates.length}</span>
                  </div>
                  <div className="otm-template-list">
                    {templates.map((template) => (
                      <TemplateListItem
                        key={template.id}
                        template={template}
                        selected={selectedTemplateId === template.id}
                        onClick={() => void selectTemplate(template)}
                      />
                    ))}
                    {templates.length === 0 && (
                      <p className="otm-list-empty">Nenhum modelo cadastrado.</p>
                    )}
                  </div>
                </aside>

                {/* Editor de template */}
                <div className="otm-editor-panel">
                  <div className="otm-editor-header">
                    <div>
                      <span className="section-kicker">Modelo</span>
                      <h2 className="otm-editor-title">{selectedTemplateId ? 'Editar modelo' : 'Criar novo modelo'}</h2>
                    </div>
                    <div className="otm-editor-header-aside">
                      <ValidationBadge validation={validation} />
                      {selectedTemplate && (
                        <div className="otm-template-preview-thumb">
                          <OfferCanvasPreview template={selectedTemplate} className="otm-editor-canvas" />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="otm-form-grid">
                    <Field label="Nome do modelo">
                      <TextInput value={templateForm.name} onChange={(e) => setTemplateForm((c) => ({ ...c, name: e.target.value }))} placeholder="Ex.: Encarte semanal A4" />
                    </Field>
                    <Field label="Tipo de mídia">
                      <SelectInput value={templateForm.channel} onChange={(e) => setTemplateForm((c) => ({ ...c, channel: e.target.value }))}>
                        <option value="PRINT">Impresso (folheto, cartaz)</option>
                        <option value="SOCIAL">Rede social (Instagram, WhatsApp)</option>
                        <option value="PORTAL">Portal online</option>
                        <option value="TV">TV / Display digital</option>
                      </SelectInput>
                    </Field>
                    <Field label="Largura (px)">
                      <TextInput type="number" value={templateForm.canvasWidth} onChange={(e) => setTemplateForm((c) => ({ ...c, canvasWidth: Number(e.target.value || 1080) }))} />
                    </Field>
                    <Field label="Altura (px)">
                      <TextInput type="number" value={templateForm.canvasHeight} onChange={(e) => setTemplateForm((c) => ({ ...c, canvasHeight: Number(e.target.value || 1350) }))} />
                    </Field>
                    <Field label="Formato padrão">
                      <SelectInput value={templateForm.defaultVariantKey} onChange={(e) => setTemplateForm((c) => ({ ...c, defaultVariantKey: e.target.value }))}>
                        {variants.length
                          ? variants.map((v) => <option key={v.id} value={v.variantKey}>{v.name}</option>)
                          : <option value="">Sem formato</option>}
                      </SelectInput>
                    </Field>
                    <Field label="Identidade visual">
                      <SelectInput value={templateForm.brandKitId} onChange={(e) => setTemplateForm((c) => ({ ...c, brandKitId: e.target.value }))}>
                        <option value="">Padrão do sistema</option>
                        {brandKits.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
                      </SelectInput>
                    </Field>
                    <Field label="Tema sazonal">
                      <SelectInput value={templateForm.campaignKitId} onChange={(e) => setTemplateForm((c) => ({ ...c, campaignKitId: e.target.value }))}>
                        <option value="">Sem tema</option>
                        {campaignKits.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
                      </SelectInput>
                    </Field>
                    <Field label="Descrição" full>
                      <TextareaInput rows={3} value={templateForm.description} onChange={(e) => setTemplateForm((c) => ({ ...c, description: e.target.value }))} />
                    </Field>
                    <Field label="Chave do modelo">
                      <TextInput value={templateForm.masterTemplateKey} onChange={(e) => setTemplateForm((c) => ({ ...c, masterTemplateKey: e.target.value }))} placeholder="Identificador único (opcional)" />
                    </Field>
                    <Field label="Versão do formato">
                      <TextInput type="number" value={templateForm.schemaVersion} onChange={(e) => setTemplateForm((c) => ({ ...c, schemaVersion: Number(e.target.value || 2) }))} />
                    </Field>
                    <CollapsibleJson
                      label="JSON avançado — Estrutura do modelo"
                      value={templateForm.designJson}
                      onChange={(v) => setTemplateForm((c) => ({ ...c, designJson: v }))}
                      rows={18}
                    />
                  </div>

                  <div className="otm-form-actions">
                    <Button type="button" onClick={handleTemplateSave} disabled={saving}>
                      <Save size={15} strokeWidth={2.2} />
                      {saving ? 'Salvando…' : 'Salvar modelo'}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* ══ Tab: Variantes ════════════════════════════════════ */}
            {activeTab === 'variants' && (
              <div className="otm-layout reveal">
                <aside className="otm-list-panel">
                  <div className="otm-list-panel-head">
                    <h2 className="otm-list-panel-title">Formatos</h2>
                    <span className="otm-list-panel-count">{variants.length}</span>
                  </div>
                  {selectedTemplate && (
                    <p className="otm-list-panel-context">Modelo: <strong>{selectedTemplate.name}</strong></p>
                  )}
                  <div className="otm-list">
                    {variants.map((variant) => (
                      <ListItem
                        key={variant.id}
                        selected={selectedVariantId === variant.id}
                        title={variant.name}
                        subtitle={`${variant.canvasWidth}×${variant.canvasHeight} · ${variant.variantKey}`}
                        onClick={() => selectVariant(variant)}
                      />
                    ))}
                    {variants.length === 0 && (
                      <p className="otm-list-empty">
                        {selectedTemplateId ? 'Nenhum formato neste modelo.' : 'Selecione um modelo na aba Modelos.'}
                      </p>
                    )}
                  </div>
                </aside>

                <div className="otm-editor-panel">
                  <div className="otm-editor-header">
                    <div>
                      <span className="section-kicker">Formato</span>
                      <h2 className="otm-editor-title">{selectedVariantId ? 'Editar formato' : 'Novo formato'}</h2>
                    </div>
                  </div>
                  <div className="otm-form-grid">
                    <Field label="Nome">
                      <TextInput value={variantForm.name} onChange={(e) => setVariantForm((c) => ({ ...c, name: e.target.value }))} />
                    </Field>
                    <Field label="Chave (key)">
                      <TextInput value={variantForm.variantKey} onChange={(e) => setVariantForm((c) => ({ ...c, variantKey: e.target.value }))} />
                    </Field>
                    <Field label="Largura (px)">
                      <TextInput type="number" value={variantForm.canvasWidth} onChange={(e) => setVariantForm((c) => ({ ...c, canvasWidth: Number(e.target.value || 1080) }))} />
                    </Field>
                    <Field label="Altura (px)">
                      <TextInput type="number" value={variantForm.canvasHeight} onChange={(e) => setVariantForm((c) => ({ ...c, canvasHeight: Number(e.target.value || 1350) }))} />
                    </Field>
                    <Field label="URL de preview" full>
                      <TextInput value={variantForm.previewImageUrl} onChange={(e) => setVariantForm((c) => ({ ...c, previewImageUrl: e.target.value }))} />
                    </Field>
                    <CollapsibleJson
                      label="JSON avançado — Configuração do formato"
                      value={variantForm.variantJson}
                      onChange={(v) => setVariantForm((c) => ({ ...c, variantJson: v }))}
                      rows={16}
                    />
                  </div>
                  <div className="otm-form-actions">
                    <Button type="button" onClick={handleVariantSave} disabled={saving || !selectedTemplateId}>
                      <Layers3 size={15} strokeWidth={2.2} />
                      {saving ? 'Salvando…' : 'Salvar formato'}
                    </Button>
                    {!selectedTemplateId && (
                      <p className="otm-form-hint">Selecione um modelo na aba Modelos antes de salvar.</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ══ Tab: Brand kits ═══════════════════════════════════ */}
            {activeTab === 'brand' && (
              <div className="otm-layout reveal">
                <aside className="otm-list-panel">
                  <div className="otm-list-panel-head">
                    <h2 className="otm-list-panel-title">Identidade visual</h2>
                    <span className="otm-list-panel-count">{brandKits.length}</span>
                  </div>
                  <div className="otm-list">
                    {brandKits.map((kit) => (
                      <ListItem
                        key={kit.id}
                        selected={selectedBrandKitId === kit.id}
                        title={kit.name}
                        subtitle={kit.systemKit ? 'Kit base do sistema' : 'Kit do mercado'}
                        onClick={() => selectBrandKit(kit)}
                      />
                    ))}
                    {brandKits.length === 0 && <p className="otm-list-empty">Nenhum estilo visual cadastrado.</p>}
                  </div>
                </aside>

                <div className="otm-editor-panel">
                  <div className="otm-editor-header">
                    <div>
                      <span className="section-kicker">Identidade visual</span>
                      <h2 className="otm-editor-title">{selectedBrandKitId ? 'Editar estilo' : 'Novo estilo visual'}</h2>
                    </div>
                  </div>
                  <div className="otm-form-grid">
                    <Field label="Nome">
                      <TextInput value={brandKitForm.name} onChange={(e) => setBrandKitForm((c) => ({ ...c, name: e.target.value }))} />
                    </Field>
                    <Field label="Chave (key)">
                      <TextInput value={brandKitForm.kitKey} onChange={(e) => setBrandKitForm((c) => ({ ...c, kitKey: e.target.value }))} />
                    </Field>
                    <Field label="Descrição" full>
                      <TextareaInput rows={3} value={brandKitForm.description} onChange={(e) => setBrandKitForm((c) => ({ ...c, description: e.target.value }))} />
                    </Field>
                    <CollapsibleJson
                      label="JSON avançado — Cores e tokens"
                      value={brandKitForm.tokensJson}
                      onChange={(v) => setBrandKitForm((c) => ({ ...c, tokensJson: v }))}
                      rows={12}
                    />
                    <CollapsibleJson
                      label="JSON avançado — Logos e assets"
                      value={brandKitForm.assetsJson}
                      onChange={(v) => setBrandKitForm((c) => ({ ...c, assetsJson: v }))}
                      rows={10}
                    />
                  </div>
                  <div className="otm-form-actions">
                    <Button type="button" onClick={handleBrandKitSave} disabled={saving}>
                      <Palette size={15} strokeWidth={2.2} />
                      {saving ? 'Salvando…' : 'Salvar identidade visual'}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* ══ Tab: Campaign kits ════════════════════════════════ */}
            {activeTab === 'campaign' && (
              <div className="otm-layout reveal">
                <aside className="otm-list-panel">
                  <div className="otm-list-panel-head">
                    <h2 className="otm-list-panel-title">Temas sazonais</h2>
                    <span className="otm-list-panel-count">{campaignKits.length}</span>
                  </div>
                  <div className="otm-list">
                    {campaignKits.map((kit) => (
                      <ListItem
                        key={kit.id}
                        selected={selectedCampaignKitId === kit.id}
                        title={kit.name}
                        subtitle={kit.seasonKey || 'Campanha livre'}
                        onClick={() => selectCampaignKit(kit)}
                      />
                    ))}
                    {campaignKits.length === 0 && <p className="otm-list-empty">Nenhum tema sazonal cadastrado.</p>}
                  </div>
                </aside>

                <div className="otm-editor-panel">
                  <div className="otm-editor-header">
                    <div>
                      <span className="section-kicker">Tema sazonal</span>
                      <h2 className="otm-editor-title">{selectedCampaignKitId ? 'Editar tema' : 'Novo tema sazonal'}</h2>
                    </div>
                  </div>
                  <div className="otm-form-grid">
                    <Field label="Nome">
                      <TextInput value={campaignKitForm.name} onChange={(e) => setCampaignKitForm((c) => ({ ...c, name: e.target.value }))} />
                    </Field>
                    <Field label="Chave (key)">
                      <TextInput value={campaignKitForm.kitKey} onChange={(e) => setCampaignKitForm((c) => ({ ...c, kitKey: e.target.value }))} />
                    </Field>
                    <Field label="Tipo de temporada">
                      <TextInput value={campaignKitForm.seasonKey} onChange={(e) => setCampaignKitForm((c) => ({ ...c, seasonKey: e.target.value }))} placeholder="Ex.: natal, pascoa, volta-aulas" />
                    </Field>
                    <Field label="Início">
                      <TextInput type="datetime-local" value={campaignKitForm.startsAt} onChange={(e) => setCampaignKitForm((c) => ({ ...c, startsAt: e.target.value }))} />
                    </Field>
                    <Field label="Fim">
                      <TextInput type="datetime-local" value={campaignKitForm.endsAt} onChange={(e) => setCampaignKitForm((c) => ({ ...c, endsAt: e.target.value }))} />
                    </Field>
                    <Field label="Descrição" full>
                      <TextareaInput rows={3} value={campaignKitForm.description} onChange={(e) => setCampaignKitForm((c) => ({ ...c, description: e.target.value }))} />
                    </Field>
                    <CollapsibleJson
                      label="JSON avançado — Cores e tokens do tema"
                      value={campaignKitForm.tokensJson}
                      onChange={(v) => setCampaignKitForm((c) => ({ ...c, tokensJson: v }))}
                      rows={10}
                    />
                    <CollapsibleJson
                      label="JSON avançado — Assets do tema"
                      value={campaignKitForm.assetsJson}
                      onChange={(v) => setCampaignKitForm((c) => ({ ...c, assetsJson: v }))}
                      rows={10}
                    />
                  </div>
                  <div className="otm-form-actions">
                    <Button type="button" onClick={handleCampaignKitSave} disabled={saving}>
                      <Sparkles size={15} strokeWidth={2.2} />
                      {saving ? 'Salvando…' : 'Salvar tema sazonal'}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
};

export default OfferTemplates;
