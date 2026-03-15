import React, { useEffect, useMemo, useState } from 'react';
import Button from '../components/common/Button';
import PageHero from '../components/dashboard/PageHero';
import Layout from '../components/layout/Layout';
import OfferCanvasPreview from '../components/offers/OfferCanvasPreview';
import { useAuth } from '../context/AuthContext';
import { offersService } from '../services/offers.service';
import { OfferTemplate } from '../types/offers.types';

const emptyForm = {
  name: '',
  description: '',
  channel: 'PRINT',
  canvasWidth: 1080,
  canvasHeight: 1350,
  designJson: '',
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

const OfferTemplates: React.FC = () => {
  const { marketId } = useAuth();
  const [templates, setTemplates] = useState<OfferTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedTemplate = useMemo(() => templates.find((template) => template.id === selectedId) || null, [templates, selectedId]);

  const loadTemplates = async () => {
    if (!marketId) return;
    setLoading(true);
    try {
      const data = await offersService.getTemplates(marketId);
      setTemplates(data);
      if (!selectedId && data.length) {
        setSelectedId(data[0].id);
        setForm({
          name: data[0].name,
          description: data[0].description || '',
          channel: data[0].channel,
          canvasWidth: data[0].canvasWidth,
          canvasHeight: data[0].canvasHeight,
          designJson: prettyJson(data[0].designJson),
          active: data[0].active,
        });
      }
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Não foi possível carregar os modelos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTemplates();
  }, [marketId]);

  const selectTemplate = (template: OfferTemplate) => {
    setSelectedId(template.id);
    setForm({
      name: template.name,
      description: template.description || '',
      channel: template.channel,
      canvasWidth: template.canvasWidth,
      canvasHeight: template.canvasHeight,
      designJson: prettyJson(template.designJson),
      active: template.active,
    });
  };

  const handleNew = () => {
    setSelectedId(null);
    setForm({ ...emptyForm, designJson: templates[0]?.designJson ? prettyJson(templates[0].designJson) : '' });
  };

  const handleSave = async () => {
    if (!marketId) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        designJson: prettyJson(form.designJson),
      };
      if (selectedId) {
        await offersService.updateTemplate(marketId, selectedId, payload);
      } else {
        await offersService.createTemplate(marketId, payload);
      }
      await loadTemplates();
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Não foi possível salvar o modelo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout>
      <div className="page analytics-page offers-page">
        <PageHero
          badge="Modelos de oferta"
          title="Controle o design como template, não como arte solta."
          description="Cada modelo guarda tamanho, canal e JSON do layout para futura geração em massa com binding do catálogo."
          actions={
            <>
              <Button type="button" onClick={handleNew}>Novo modelo</Button>
              <Button type="button" variant="secondary" onClick={() => selectedTemplate && selectTemplate(selectedTemplate)} disabled={!selectedTemplate}>
                Recarregar selecionado
              </Button>
            </>
          }
          feature={<OfferCanvasPreview template={selectedTemplate || templates[0] || null} className="offer-dashboard-canvas" />}
          aside={(
            <article className="dashboard-priority-card">
              <span className="section-kicker">Estratégia correta</span>
              <h3>Trabalhe com biblioteca de layouts, não com arquivos soltos.</h3>
              <p>Isso permite reaproveitar estrutura visual, binding e exportação em lote sem reconstruir a arte do zero.</p>
            </article>
          )}
        />

        {error ? <div className="sales-empty-card">{error}</div> : null}
        {loading ? <div className="sales-empty-card">Carregando modelos...</div> : null}

        {!loading ? (
          <div className="offer-template-page-grid">
            <section className="sales-section reveal">
              <div className="sales-section-head">
                <div>
                  <span className="section-kicker">Biblioteca</span>
                  <h2>Modelos disponíveis</h2>
                </div>
                <p>Use os templates base ou crie versões próprias do mercado.</p>
              </div>
              <div className="offer-template-rail stacked">
                {templates.map((template) => (
                  <article key={template.id} className={`offer-template-card compact ${selectedId === template.id ? 'selected' : ''}`} onClick={() => selectTemplate(template)}>
                    <OfferCanvasPreview template={template} className="offer-template-card-preview compact" />
                    <div className="offer-template-card-body compact">
                      <span className="section-kicker">{template.systemTemplate ? 'Base' : 'Personalizado'}</span>
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
                  <span className="section-kicker">Editor do template</span>
                  <h2>{selectedId ? 'Ajustar modelo selecionado' : 'Criar novo modelo'}</h2>
                </div>
                <p>O JSON do layout continua aberto para acelerar a evolução do módulo antes da camada visual completa.</p>
              </div>
              <div className="offer-template-form-grid">
                <label>
                  <span>Nome</span>
                  <input className="input" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
                </label>
                <label>
                  <span>Canal</span>
                  <select className="input" value={form.channel} onChange={(event) => setForm((current) => ({ ...current, channel: event.target.value }))}>
                    <option value="PRINT">Impressão</option>
                    <option value="FLYER">Encarte</option>
                    <option value="SOCIAL">Social</option>
                    <option value="VIDEO">Vídeo</option>
                  </select>
                </label>
                <label>
                  <span>Largura</span>
                  <input className="input" type="number" min="300" value={form.canvasWidth} onChange={(event) => setForm((current) => ({ ...current, canvasWidth: Number(event.target.value || 1080) }))} />
                </label>
                <label>
                  <span>Altura</span>
                  <input className="input" type="number" min="300" value={form.canvasHeight} onChange={(event) => setForm((current) => ({ ...current, canvasHeight: Number(event.target.value || 1350) }))} />
                </label>
                <label className="full">
                  <span>Descrição</span>
                  <textarea className="input" rows={3} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
                </label>
                <label className="full">
                  <span>Layout JSON</span>
                  <textarea className="input offer-json-editor" rows={20} value={form.designJson} onChange={(event) => setForm((current) => ({ ...current, designJson: event.target.value }))} />
                </label>
                <label className="offer-checkbox-row full">
                  <input type="checkbox" checked={form.active} onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))} />
                  <span>Modelo ativo para o mercado</span>
                </label>
              </div>
              <div className="offer-template-editor-actions">
                <Button type="button" onClick={handleSave} disabled={saving}>
                  {saving ? 'Salvando...' : selectedId ? 'Salvar alterações' : 'Criar modelo'}
                </Button>
                <Button type="button" variant="secondary" onClick={handleNew}>Limpar</Button>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </Layout>
  );
};

export default OfferTemplates;

