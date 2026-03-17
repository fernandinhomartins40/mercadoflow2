import React, { useEffect, useMemo, useState } from 'react';
import { Layers3, Palette, RefreshCw, Save, Sparkles, Target } from 'lucide-react';
import Button from '../components/common/Button';
import PageHero from '../components/dashboard/PageHero';
import Layout from '../components/layout/Layout';
import OfferCanvasPreview from '../components/offers/OfferCanvasPreview';
import { useAuth } from '../context/AuthContext';
import { offersService } from '../services/offers.service';
import {
  OfferBrandKit,
  OfferCampaignKit,
  OfferTemplate,
  OfferTemplateValidation,
  OfferTemplateVariant,
} from '../types/offers.types';

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
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
};

const isoInputValue = (value?: string | null) => (value ? value.slice(0, 16) : '');

const OfferTemplates: React.FC = () => {
  const { marketId } = useAuth();
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

  const selectedTemplate = useMemo(() => templates.find((template) => template.id === selectedTemplateId) || null, [templates, selectedTemplateId]);

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
      const currentTemplate = templateList.find((template) => template.id === templateId) || null;
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
      setError(err?.message || 'Não foi possível carregar variantes e validação do template.');
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

  useEffect(() => {
    void loadAll();
  }, [marketId]);

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
    } catch (err: any) {
      setError(err?.message || 'Não foi possível salvar o campaign kit.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout>
      <div className="page analytics-page offers-page">
        <PageHero
          badge="Template engine"
          title="Controle master template, variantes, kits e schema v2."
          description="A biblioteca agora é o centro do módulo: template, variante, brand kit e campaign kit convivem no mesmo fluxo de configuração."
          actions={
            <>
              <Button type="button" onClick={() => { setSelectedTemplateId(null); setTemplateForm(emptyTemplateForm); }}>Novo template</Button>
              <Button type="button" variant="secondary" onClick={() => void loadAll()}>
                <RefreshCw size={16} strokeWidth={2.1} />
                Atualizar
              </Button>
            </>
          }
          feature={<OfferCanvasPreview template={selectedTemplate || templates[0] || null} className="offer-dashboard-canvas" />}
          aside={(
            <article className="dashboard-priority-card">
              <span className="section-kicker">Validação</span>
              <h3>{validation?.valid ? 'Template consistente' : 'Template em evolução'}</h3>
              <p>{validation?.messages?.length ? validation.messages.join(' · ') : 'Camadas, zonas e variantes válidas para automação e geração.'}</p>
            </article>
          )}
        />

        {error ? <div className="sales-empty-card">{error}</div> : null}
        {loading ? <div className="sales-empty-card">Carregando biblioteca de ofertas...</div> : null}

        {!loading ? (
          <>
            <div className="offer-template-page-grid">
              <section className="sales-section reveal">
                <div className="sales-section-head">
                  <div>
                    <span className="section-kicker">Templates</span>
                    <h2>Base de modelos</h2>
                  </div>
                  <p>{templates.length} templates cadastrados.</p>
                </div>
                <div className="offer-template-rail stacked">
                  {templates.map((template) => (
                    <article key={template.id} className={`offer-template-card compact ${selectedTemplateId === template.id ? 'selected' : ''}`} onClick={() => void selectTemplate(template)}>
                      <OfferCanvasPreview template={template} className="offer-template-card-preview compact" />
                      <div className="offer-template-card-body compact">
                        <span className="section-kicker">{template.channel}</span>
                        <h3>{template.name}</h3>
                        <p>{template.description || 'Sem descrição.'}</p>
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <section className="analytics-panel reveal offer-template-editor-panel">
                <div className="sales-section-head">
                  <div>
                    <span className="section-kicker">Template</span>
                    <h2>{selectedTemplateId ? 'Editar template' : 'Criar template'}</h2>
                  </div>
                </div>
                <div className="offer-template-form-grid">
                  <label><span>Nome</span><input className="input" value={templateForm.name} onChange={(event) => setTemplateForm((current) => ({ ...current, name: event.target.value }))} /></label>
                  <label><span>Canal</span><input className="input" value={templateForm.channel} onChange={(event) => setTemplateForm((current) => ({ ...current, channel: event.target.value }))} /></label>
                  <label><span>Largura</span><input className="input" type="number" value={templateForm.canvasWidth} onChange={(event) => setTemplateForm((current) => ({ ...current, canvasWidth: Number(event.target.value || 1080) }))} /></label>
                  <label><span>Altura</span><input className="input" type="number" value={templateForm.canvasHeight} onChange={(event) => setTemplateForm((current) => ({ ...current, canvasHeight: Number(event.target.value || 1350) }))} /></label>
                  <label><span>Schema version</span><input className="input" type="number" value={templateForm.schemaVersion} onChange={(event) => setTemplateForm((current) => ({ ...current, schemaVersion: Number(event.target.value || 2) }))} /></label>
                  <label><span>Master key</span><input className="input" value={templateForm.masterTemplateKey} onChange={(event) => setTemplateForm((current) => ({ ...current, masterTemplateKey: event.target.value }))} /></label>
                  <label><span>Default variant</span><select className="input" value={templateForm.defaultVariantKey} onChange={(event) => setTemplateForm((current) => ({ ...current, defaultVariantKey: event.target.value }))}>{variants.length ? variants.map((variant) => <option key={variant.id} value={variant.variantKey}>{variant.name}</option>) : <option value="">Sem variante</option>}</select></label>
                  <label><span>Brand kit</span><select className="input" value={templateForm.brandKitId} onChange={(event) => setTemplateForm((current) => ({ ...current, brandKitId: event.target.value }))}>{brandKits.length ? brandKits.map((kit) => <option key={kit.id} value={kit.id}>{kit.name}</option>) : <option value="">Sem brand kit</option>}</select></label>
                  <label><span>Campaign kit</span><select className="input" value={templateForm.campaignKitId} onChange={(event) => setTemplateForm((current) => ({ ...current, campaignKitId: event.target.value }))}>{campaignKits.length ? campaignKits.map((kit) => <option key={kit.id} value={kit.id}>{kit.name}</option>) : <option value="">Sem campaign kit</option>}</select></label>
                  <label className="full"><span>Descrição</span><textarea className="input" rows={3} value={templateForm.description} onChange={(event) => setTemplateForm((current) => ({ ...current, description: event.target.value }))} /></label>
                  <label className="full"><span>Design JSON</span><textarea className="input offer-json-editor" rows={16} value={templateForm.designJson} onChange={(event) => setTemplateForm((current) => ({ ...current, designJson: event.target.value }))} /></label>
                </div>
                <div className="offer-template-editor-actions">
                  <Button type="button" onClick={handleTemplateSave} disabled={saving}>
                    <Save size={16} strokeWidth={2.1} />
                    {saving ? 'Salvando...' : 'Salvar template'}
                  </Button>
                </div>
              </section>
            </div>

            <div className="mt-8 grid gap-6 xl:grid-cols-3">
              <section className="analytics-panel reveal">
                <div className="sales-section-head"><div><span className="section-kicker">Variantes</span><h2>Formatos</h2></div><p>{variants.length} variantes.</p></div>
                <div className="space-y-3">
                  {variants.map((variant) => (
                    <button key={variant.id} type="button" onClick={() => selectVariant(variant)} className={`w-full rounded-[20px] border px-4 py-4 text-left ${selectedVariantId === variant.id ? 'border-[color:var(--accent-primary)] bg-[rgba(255,106,0,0.08)]' : 'border-[rgba(87,51,30,0.08)] bg-white'}`}>
                      <strong className="block">{variant.name}</strong>
                      <small className="text-[color:var(--text-secondary)]">{variant.canvasWidth}x{variant.canvasHeight}</small>
                    </button>
                  ))}
                </div>
                <div className="mt-5 space-y-3">
                  <label><span>Nome</span><input className="input" value={variantForm.name} onChange={(event) => setVariantForm((current) => ({ ...current, name: event.target.value }))} /></label>
                  <label><span>Key</span><input className="input" value={variantForm.variantKey} onChange={(event) => setVariantForm((current) => ({ ...current, variantKey: event.target.value }))} /></label>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label><span>Largura</span><input className="input" type="number" value={variantForm.canvasWidth} onChange={(event) => setVariantForm((current) => ({ ...current, canvasWidth: Number(event.target.value || 1080) }))} /></label>
                    <label><span>Altura</span><input className="input" type="number" value={variantForm.canvasHeight} onChange={(event) => setVariantForm((current) => ({ ...current, canvasHeight: Number(event.target.value || 1350) }))} /></label>
                  </div>
                  <label><span>Variant JSON</span><textarea className="input offer-json-editor" rows={8} value={variantForm.variantJson} onChange={(event) => setVariantForm((current) => ({ ...current, variantJson: event.target.value }))} /></label>
                  <Button type="button" onClick={handleVariantSave} disabled={saving}>
                    <Layers3 size={16} strokeWidth={2.1} />
                    Salvar variante
                  </Button>
                </div>
              </section>

              <section className="analytics-panel reveal">
                <div className="sales-section-head"><div><span className="section-kicker">Brand kits</span><h2>Marca</h2></div><p>{brandKits.length} kits.</p></div>
                <div className="space-y-3">
                  {brandKits.map((kit) => (
                    <button key={kit.id} type="button" onClick={() => selectBrandKit(kit)} className={`w-full rounded-[20px] border px-4 py-4 text-left ${selectedBrandKitId === kit.id ? 'border-[color:var(--accent-primary)] bg-[rgba(255,106,0,0.08)]' : 'border-[rgba(87,51,30,0.08)] bg-white'}`}>
                      <strong className="block">{kit.name}</strong>
                      <small className="text-[color:var(--text-secondary)]">{kit.systemKit ? 'Kit base' : 'Kit do mercado'}</small>
                    </button>
                  ))}
                </div>
                <div className="mt-5 space-y-3">
                  <label><span>Nome</span><input className="input" value={brandKitForm.name} onChange={(event) => setBrandKitForm((current) => ({ ...current, name: event.target.value }))} /></label>
                  <label><span>Key</span><input className="input" value={brandKitForm.kitKey} onChange={(event) => setBrandKitForm((current) => ({ ...current, kitKey: event.target.value }))} /></label>
                  <label><span>Descrição</span><textarea className="input" rows={3} value={brandKitForm.description} onChange={(event) => setBrandKitForm((current) => ({ ...current, description: event.target.value }))} /></label>
                  <label><span>Tokens JSON</span><textarea className="input offer-json-editor" rows={8} value={brandKitForm.tokensJson} onChange={(event) => setBrandKitForm((current) => ({ ...current, tokensJson: event.target.value }))} /></label>
                  <label><span>Assets JSON</span><textarea className="input offer-json-editor" rows={8} value={brandKitForm.assetsJson} onChange={(event) => setBrandKitForm((current) => ({ ...current, assetsJson: event.target.value }))} /></label>
                  <Button type="button" onClick={handleBrandKitSave} disabled={saving}>
                    <Palette size={16} strokeWidth={2.1} />
                    Salvar brand kit
                  </Button>
                </div>
              </section>

              <section className="analytics-panel reveal">
                <div className="sales-section-head"><div><span className="section-kicker">Campaign kits</span><h2>Campanhas</h2></div><p>{campaignKits.length} kits.</p></div>
                <div className="space-y-3">
                  {campaignKits.map((kit) => (
                    <button key={kit.id} type="button" onClick={() => selectCampaignKit(kit)} className={`w-full rounded-[20px] border px-4 py-4 text-left ${selectedCampaignKitId === kit.id ? 'border-[color:var(--accent-primary)] bg-[rgba(255,106,0,0.08)]' : 'border-[rgba(87,51,30,0.08)] bg-white'}`}>
                      <strong className="block">{kit.name}</strong>
                      <small className="text-[color:var(--text-secondary)]">{kit.seasonKey || 'Campanha livre'}</small>
                    </button>
                  ))}
                </div>
                <div className="mt-5 space-y-3">
                  <label><span>Nome</span><input className="input" value={campaignKitForm.name} onChange={(event) => setCampaignKitForm((current) => ({ ...current, name: event.target.value }))} /></label>
                  <label><span>Key</span><input className="input" value={campaignKitForm.kitKey} onChange={(event) => setCampaignKitForm((current) => ({ ...current, kitKey: event.target.value }))} /></label>
                  <label><span>Sazonalidade</span><input className="input" value={campaignKitForm.seasonKey} onChange={(event) => setCampaignKitForm((current) => ({ ...current, seasonKey: event.target.value }))} /></label>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label><span>Início</span><input className="input" type="datetime-local" value={campaignKitForm.startsAt} onChange={(event) => setCampaignKitForm((current) => ({ ...current, startsAt: event.target.value }))} /></label>
                    <label><span>Fim</span><input className="input" type="datetime-local" value={campaignKitForm.endsAt} onChange={(event) => setCampaignKitForm((current) => ({ ...current, endsAt: event.target.value }))} /></label>
                  </div>
                  <label><span>Descrição</span><textarea className="input" rows={3} value={campaignKitForm.description} onChange={(event) => setCampaignKitForm((current) => ({ ...current, description: event.target.value }))} /></label>
                  <label><span>Tokens JSON</span><textarea className="input offer-json-editor" rows={8} value={campaignKitForm.tokensJson} onChange={(event) => setCampaignKitForm((current) => ({ ...current, tokensJson: event.target.value }))} /></label>
                  <label><span>Assets JSON</span><textarea className="input offer-json-editor" rows={8} value={campaignKitForm.assetsJson} onChange={(event) => setCampaignKitForm((current) => ({ ...current, assetsJson: event.target.value }))} /></label>
                  <Button type="button" onClick={handleCampaignKitSave} disabled={saving}>
                    <Sparkles size={16} strokeWidth={2.1} />
                    Salvar campaign kit
                  </Button>
                </div>
              </section>
            </div>
          </>
        ) : null}
      </div>
    </Layout>
  );
};

export default OfferTemplates;
