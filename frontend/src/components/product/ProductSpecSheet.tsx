import React, { useMemo, useState } from 'react';
import { Section, DataRow, Chip } from '../ui';
import { ProductSpecAttribute, ProductSpecSheet as ProductSpecSheetData } from '../../types/analytics.types';

interface ProductSpecSheetProps {
  sheet?: ProductSpecSheetData | null;
}

const GROUP_LABELS: Record<string, string> = {
  MEDIDAS: 'Medidas e quantidade',
  COMPOSICAO: 'Composição',
  CONSERVACAO: 'Conservação e advertências',
  GERAL: 'Outras informações',
};

const GROUP_ORDER = ['MEDIDAS', 'COMPOSICAO', 'CONSERVACAO', 'GERAL'];

const DESCRIPTION_PREVIEW_LIMIT = 420;

/**
 * A tabela nutricional chega como HTML publicado pelo próprio mercado. Como é
 * conteúdo de terceiro, só liberamos a marcação de tabela: qualquer script,
 * iframe, evento inline ou href javascript: é removido antes de renderizar.
 */
const sanitizeNutritionHtml = (html: string): string => {
  if (typeof window === 'undefined' || typeof window.DOMParser === 'undefined') {
    // sem DOM disponível (SSR/teste), devolve texto puro
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  const allowedTags = new Set([
    'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TD', 'TH',
    'STRONG', 'B', 'EM', 'I', 'BR', 'P', 'SPAN', 'DIV', 'UL', 'OL', 'LI', 'SMALL', 'SUP', 'SUB',
  ]);

  const doc = new DOMParser().parseFromString(html, 'text/html');

  doc.querySelectorAll('script, style, iframe, object, embed, link, meta, form, input').forEach((node) => node.remove());

  doc.body.querySelectorAll('*').forEach((element) => {
    if (!allowedTags.has(element.tagName)) {
      element.replaceWith(...Array.from(element.childNodes));
      return;
    }
    Array.from(element.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.toLowerCase();
      const isUnsafe =
        name.startsWith('on') ||
        name === 'style' ||
        name === 'srcdoc' ||
        ((name === 'href' || name === 'src') && value.replace(/\s/g, '').startsWith('javascript:'));
      if (isUnsafe) {
        element.removeAttribute(attribute.name);
      }
    });
  });

  return doc.body.innerHTML;
};

const ProductSpecSheet: React.FC<ProductSpecSheetProps> = ({ sheet }) => {
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);

  const nutritionHtml = useMemo(
    () => (sheet?.nutritionTableHtml ? sanitizeNutritionHtml(sheet.nutritionTableHtml) : ''),
    [sheet?.nutritionTableHtml],
  );

  const groupedAttributes = useMemo(() => {
    const groups = new Map<string, ProductSpecAttribute[]>();
    (sheet?.attributes || []).forEach((attribute) => {
      if (!attribute?.label || !attribute?.value) return;
      const key = GROUP_ORDER.includes(String(attribute.group)) ? String(attribute.group) : 'GERAL';
      const current = groups.get(key) || [];
      current.push(attribute);
      groups.set(key, current);
    });
    return GROUP_ORDER.filter((key) => (groups.get(key) || []).length > 0).map((key) => ({
      key,
      label: GROUP_LABELS[key],
      items: groups.get(key) || [],
    }));
  }, [sheet?.attributes]);

  // Sem conteúdo útil a seção não aparece: boa parte do catálogo não tem
  // ficha técnica publicada pelo mercado de origem.
  if (!sheet || sheet.hasContent === false) return null;

  const hasAnything =
    Boolean(sheet.description) ||
    Boolean(nutritionHtml) ||
    Boolean(sheet.ingredients) ||
    groupedAttributes.length > 0 ||
    Boolean(sheet.packageDescription) ||
    Boolean(sheet.manufacturer);

  if (!hasAnything) return null;

  const description = sheet.description || '';
  const needsToggle = description.length > DESCRIPTION_PREVIEW_LIMIT;
  const visibleDescription =
    needsToggle && !descriptionExpanded ? `${description.slice(0, DESCRIPTION_PREVIEW_LIMIT).trimEnd()}…` : description;

  const identification: Array<{ label: string; value?: string | null }> = [
    { label: 'Marca', value: sheet.brand },
    { label: 'Fabricante', value: sheet.manufacturer },
    { label: 'Embalagem', value: sheet.packageDescription },
    { label: 'Unidade', value: sheet.unit },
    { label: 'NCM', value: sheet.ncm },
  ];
  const visibleIdentification = identification.filter((item) => Boolean(item.value));

  return (
    <Section
      kicker="Ficha técnica"
      title="Detalhes e informações do produto"
      subtitle="Dados publicados pelo mercado de origem — composição, medidas e informação nutricional."
      action={sheet.provider ? <Chip>{sheet.provider.replace(/_WEB_BR$/, '').replace(/_/g, ' ')}</Chip> : undefined}
    >
      <div className="flex flex-col gap-5">
        {description ? (
          <div className="flex flex-col gap-2">
            <p className="whitespace-pre-line text-sm leading-6" style={{ color: 'var(--text-muted)' }}>
              {visibleDescription}
            </p>
            {needsToggle ? (
              <button
                type="button"
                onClick={() => setDescriptionExpanded((current) => !current)}
                className="self-start text-sm font-semibold underline-offset-2 hover:underline"
                style={{ color: 'var(--text-primary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                {descriptionExpanded ? 'Ver menos' : 'Ver descrição completa'}
              </button>
            ) : null}
          </div>
        ) : null}

        {sheet.ingredients ? (
          <div className="flex flex-col gap-2">
            <h4 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Ingredientes</h4>
            <p
              className="rounded-lg px-4 py-3 text-sm leading-6"
              style={{ background: 'var(--surface-soft)', border: '1px solid var(--border-soft)', color: 'var(--text-muted)' }}
            >
              {sheet.ingredients}
            </p>
          </div>
        ) : null}

        {visibleIdentification.length > 0 ? (
          <div className="flex flex-col gap-2">
            <h4 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Identificação</h4>
            <div className="grid gap-2 sm:grid-cols-2">
              {visibleIdentification.map((item) => (
                <DataRow key={item.label} label={item.label} value={item.value} />
              ))}
            </div>
          </div>
        ) : null}

        {groupedAttributes.map((group) => (
          <div key={group.key} className="flex flex-col gap-2">
            <h4 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{group.label}</h4>
            <div className="grid gap-2 sm:grid-cols-2">
              {group.items.map((attribute) => (
                <DataRow key={`${group.key}-${attribute.label}`} label={attribute.label} value={attribute.value} />
              ))}
            </div>
          </div>
        ))}

        {nutritionHtml ? (
          <div className="flex flex-col gap-2">
            <h4 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Informação nutricional</h4>
            <div
              className="product-nutrition-table overflow-x-auto rounded-lg px-4 py-3"
              style={{ background: 'var(--surface-soft)', border: '1px solid var(--border-soft)', color: 'var(--text-muted)' }}
              dangerouslySetInnerHTML={{ __html: nutritionHtml }}
            />
          </div>
        ) : null}
      </div>
    </Section>
  );
};

export default ProductSpecSheet;
