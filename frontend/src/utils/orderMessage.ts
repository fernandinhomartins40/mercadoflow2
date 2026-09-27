import type { SupplierOrder } from '../types/analytics.types';

/**
 * Saídas portáveis do pedido ao fornecedor (D-012): texto para WhatsApp/e-mail
 * e lista de conferência impressa para o representante.
 *
 * Preços ficam de fora de propósito: o custo registrado é a estimativa da loja,
 * não o que foi negociado, e não deve ir para o fornecedor sem o comprador decidir.
 */

const UNIT_TEXT: Record<string, string> = {
  UN: 'un.', CX: 'cx', KG: 'kg', DZ: 'dz', FD: 'fardo', PC: 'pct',
};

const fmtQty = (value: number) =>
  new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 }).format(Number(value) || 0);

const fmtDate = (iso?: string | null) =>
  iso ? new Intl.DateTimeFormat('pt-BR').format(new Date(iso)) : '';

export const supplierDisplayName = (order: Pick<SupplierOrder, 'supplierFantasia' | 'supplierName'>) =>
  order.supplierFantasia?.trim() || order.supplierName;

export const itemLine = (item: SupplierOrder['items'][number]) => {
  const unit = UNIT_TEXT[item.unitType] || item.unitType.toLowerCase();
  const pack = item.unitsPerPack && item.unitType !== 'UN' && item.unitType !== 'KG'
    ? ` (${fmtQty(item.unitsPerPack)} un.)`
    : '';
  return `${fmtQty(item.quantityRequested)} ${unit}${pack} — ${item.productName}`;
};

/** Texto simples do pedido; `*…*` vira negrito no WhatsApp e é inofensivo no e-mail. */
export const buildOrderText = (order: SupplierOrder) => {
  const lines = [
    `*Pedido ${order.orderNumber}*`,
    `Fornecedor: ${supplierDisplayName(order)}`,
    `Data: ${fmtDate(order.orderDate)}`,
    '',
    ...[...order.items]
      .sort((a, b) => a.productName.localeCompare(b.productName, 'pt-BR'))
      .map((item) => `• ${itemLine(item)}`),
    '',
    `${order.items.length} ${order.items.length === 1 ? 'item' : 'itens'}`,
  ];
  if (order.notes?.trim()) lines.push(`Obs.: ${order.notes.trim()}`);
  return lines.join('\n');
};

/**
 * Número no formato do wa.me (só dígitos, com DDI). Telefone brasileiro de
 * 10–11 dígitos ganha o 55; sem telefone válido, devolve null e o WhatsApp abre
 * para o comprador escolher o contato.
 */
export const whatsappNumber = (phone?: string | null): string | null => {
  const digits = (phone || '').replace(/\D/g, '').replace(/^0+/, '');
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) return digits;
  return null;
};

export const whatsappUrl = (order: SupplierOrder, phone?: string | null) => {
  const number = whatsappNumber(phone);
  const text = encodeURIComponent(buildOrderText(order));
  return number ? `https://wa.me/${number}?text=${text}` : `https://wa.me/?text=${text}`;
};

export const mailtoUrl = (order: SupplierOrder, email?: string | null) => {
  const subject = encodeURIComponent(`Pedido ${order.orderNumber}`);
  const body = encodeURIComponent(buildOrderText(order).replace(/\*/g, ''));
  return `mailto:${encodeURIComponent((email || '').trim())}?subject=${subject}&body=${body}`;
};

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

/** Página de impressão (ou "Salvar como PDF"): lista de conferência para o representante. */
export const buildPrintHtml = (order: SupplierOrder) => {
  const rows = [...order.items]
    .sort((a, b) => a.productName.localeCompare(b.productName, 'pt-BR'))
    .map((item) => {
      const unit = UNIT_TEXT[item.unitType] || item.unitType.toLowerCase();
      return `<tr><td class="check">☐</td><td>${escapeHtml(item.productName)}</td>`
        + `<td class="num">${escapeHtml(fmtQty(item.quantityRequested))} ${escapeHtml(unit)}</td></tr>`;
    })
    .join('');
  const notes = order.notes?.trim() ? `<p><strong>Obs.:</strong> ${escapeHtml(order.notes.trim())}</p>` : '';
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Pedido ${escapeHtml(order.orderNumber)}</title>
<style>
body{font:14px/1.5 system-ui,sans-serif;color:#111;margin:24px}
h1{font-size:20px;margin:0 0 4px}p{margin:2px 0}
table{width:100%;border-collapse:collapse;margin-top:16px}
th,td{border-bottom:1px solid #ccc;padding:8px 6px;text-align:left;vertical-align:top}
th{font-size:12px;text-transform:uppercase;color:#555}
.num{text-align:right;white-space:nowrap}.check{width:24px;font-size:18px}
footer{margin-top:24px;font-size:12px;color:#555}
</style></head><body>
<h1>Pedido ${escapeHtml(order.orderNumber)}</h1>
<p>Fornecedor: ${escapeHtml(supplierDisplayName(order))}</p>
<p>Data: ${escapeHtml(fmtDate(order.orderDate))}</p>
<table><thead><tr><th></th><th>Produto</th><th class="num">Quantidade</th></tr></thead><tbody>${rows}</tbody></table>
${notes}
<footer>${order.items.length} ${order.items.length === 1 ? 'item' : 'itens'} · conferido por: ____________________</footer>
</body></html>`;
};
