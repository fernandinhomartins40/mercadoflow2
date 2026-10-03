import { CalendarClock, Megaphone, MessageCircle, PiggyBank, ShoppingCart, Sparkles, Sun, Tag, Truck, type LucideIcon } from 'lucide-react';
import type { CopilotDecision } from '../../services/aiPlatform.service';

/** O que cada agente faz, em palavras de quem decide. */
export const AGENT: Record<string, { label: string; icon: LucideIcon; action: string; valueLabel: string }> = {
  GERENTE: { label: 'Gerente', icon: Sun, action: 'Atenção da loja', valueLabel: 'em jogo' },
  COMPRAS: { label: 'Compras', icon: ShoppingCart, action: 'Preparar próxima compra', valueLabel: 'em pedido' },
  RECEBIMENTO: { label: 'Recebimento', icon: Truck, action: 'Resolver entrega incompleta', valueLabel: 'em falta' },
  CAPITAL: { label: 'Capital parado', icon: PiggyBank, action: 'Liberar capital parado', valueLabel: 'parados' },
  PRECO: { label: 'Preço', icon: Tag, action: 'Ajustar preço', valueLabel: 'em margem' },
  PROMOCOES: { label: 'Promoções', icon: Megaphone, action: 'Promover produto', valueLabel: 'de impacto' },
  CENARIOS: { label: 'Cenários', icon: CalendarClock, action: 'Preparar para a data', valueLabel: 'em jogo' },
};

export const agentOf = (d: CopilotDecision) => AGENT[d.agent] ?? { label: d.agent, icon: Sparkles, action: d.title, valueLabel: '' };

export const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

export const ago = (iso: string | null) => {
  if (!iso) return '';
  const h = Math.round((Date.now() - new Date(iso).getTime()) / 3600000);
  if (h < 1) return 'agora há pouco';
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'há 1 dia' : `há ${d} dias`;
};

// A mensagem específica vem em `message`; `userMessage` às vezes é o texto genérico do tratador global.
export const apiError = (e: unknown, fallback: string) => {
  const data = (e as { response?: { data?: { message?: string; userMessage?: string } } })?.response?.data;
  return data?.message || data?.userMessage || fallback;
};

/** Certeza da triagem em palavras. */
export const certainty = (d: CopilotDecision) => {
  const p = d.funnel?.probabilidadeVale ?? d.funnel?.confianca;
  if (p == null) return null;
  return p >= 0.8 ? 'Certeza alta' : p >= 0.55 ? 'Certeza média' : 'Certeza baixa';
};

/** Valor da decisão para a lista e para o título. */
export const valueOf = (d: CopilotDecision, override?: number) => {
  if (override != null) return override > 0 ? override : null;
  if (d.impact != null && d.impact > 0) return Number(d.impact);
  const n = d.numbers ?? {};
  for (const k of ['valorEstimado', 'valorEstoque', 'valor', 'vendaProtegida']) {
    const v = Number((n as Record<string, unknown>)[k]);
    if (Number.isFinite(v) && v > 0) return v;
  }
  return null;
};

export const REASONS = ['Não preciso agora', 'Valor alto demais', 'Já resolvi', 'Não confio nesse fornecedor'];
