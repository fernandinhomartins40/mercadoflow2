/**
 * Comandos de voz lidos por código, no próprio celular (funciona sem sinal).
 * O número falado ("mais dois", "contei vinte e três", "quatro vírgula cinco")
 * é sempre lido aqui, nunca por modelo. Só quando nada casa a tela pergunta ao
 * servidor, e lá o Jev escolhe entre as mesmas ações.
 */

export type VoiceContext = 'CONFERENCIA' | 'RESUMO';

export type ConferenceAction =
  | 'somar' | 'tirar' | 'definir' | 'veio_certo' | 'avaria' | 'validade' | 'trocado' | 'proximo' | 'anterior' | 'revisar';
export type BriefAction = 'aprovar' | 'detalhe' | 'depois' | 'repetir' | 'pergunta';

export interface VoiceCommand<A extends string = string> {
  acao: A;
  numero: number | null;
  texto: string;
}

export const normalize = (text: string): string =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s,.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const UNITS: Record<string, number> = {
  zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, meia: 6, sete: 7, oito: 8, nove: 9,
  dez: 10, onze: 11, doze: 12, treze: 13, catorze: 14, quatorze: 14, quinze: 15, dezesseis: 16, dezasseis: 16,
  dezessete: 17, dezassete: 17, dezoito: 18, dezenove: 19, dezanove: 19,
  vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90,
  cem: 100, cento: 100, duzentos: 200, duzentas: 200, trezentos: 300, trezentas: 300, quatrocentos: 400,
  quatrocentas: 400, quinhentos: 500, quinhentas: 500, seiscentos: 600, seiscentas: 600, setecentos: 700,
  setecentas: 700, oitocentos: 800, oitocentas: 800, novecentos: 900, novecentas: 900,
};

const isDigits = (t: string) => /^\d+([.,]\d+)?$/.test(t);


/** Primeiro número da frase, em algarismos ou por extenso; null se não houver. */
export const parseNumber = (text: string): number | null => {
  const tokens = normalize(text).split(' ');
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (isDigits(t)) {
      const value = Number(t.replace(',', '.'));
      const after = tokens[i + 1];
      return after === 'duzia' || after === 'duzias' ? value * 12 : value;
    }
    if (!(t in UNITS) && t !== 'mil') continue;
    let total = 0;
    let current = 0;
    let j = i;
    let used = 0;
    let half = false;
    for (; j < tokens.length; j++) {
      const w = tokens[j];
      if (w === 'e' && used > 0 && j + 1 < tokens.length && tokens[j + 1] in UNITS) continue;
      if (w === 'meia' && (tokens[j + 1] === 'duzia')) { half = true; used++; continue; }
      if (w in UNITS) { current += UNITS[w]; used++; continue; }
      if (w === 'mil') { total += (current || 1) * 1000; current = 0; used++; continue; }
      if (w === 'duzia' || w === 'duzias') { current = (half ? 0.5 : current || 1) * 12; half = false; used++; continue; }
      break;
    }
    if (used === 0) continue;
    let value = total + current;
    // Parte decimal: "quatro virgula cinco" → 4,5
    if (tokens[j] === 'virgula' || tokens[j] === 'ponto') {
      const rest = tokens.slice(j + 1).join(' ');
      const frac = parseNumber(rest);
      if (frac != null && Number.isInteger(frac)) value = Number(`${value}.${frac}`);
    }
    return value;
  }
  return null;
};

const has = (text: string, re: RegExp) => re.test(text);

/** Comando da tela de conferência; null quando nada casa. */
export const parseConference = (raw: string): VoiceCommand<ConferenceAction> | null => {
  const t = normalize(raw);
  if (!t) return null;
  const n = parseNumber(t);
  const cmd = (acao: ConferenceAction, numero: number | null = null) => ({ acao, numero, texto: raw });
  if (has(t, /\b(mais|soma|somar|adiciona|acrescenta|chegou mais|poe mais|coloca mais)\b/) && !has(t, /\bmais tarde\b/)) {
    return cmd('somar', n ?? 1);
  }
  if (has(t, /\b(menos|tira|tirar|remove|diminui)\b/)) return cmd('tirar', n ?? 1);
  if (has(t, /\b(avaria|avariad\w*|amassad\w*|quebrad\w*|vazand\w*|rasgad\w*|furad\w*|estragad\w*)\b/)) return cmd('avaria');
  if (has(t, /\b(validade|vencid\w*|vencendo|vence)\b/)) return cmd('validade');
  if (has(t, /\b(trocad\w*|errad\w*|outro produto)\b/)) return cmd('trocado');
  if (has(t, /\b(veio certo|ta certo|esta certo|certinho|bateu|confere|conferido|ok|tudo certo)\b/)) return cmd('veio_certo');
  if (has(t, /\b(proximo|seguinte|pula|passa|avanca|next)\b/)) return cmd('proximo');
  if (has(t, /\b(anterior|volta|voltar|volte)\b/)) return cmd('anterior');
  if (has(t, /\b(revisar|revisa|terminei|acabou|finaliza|fechar)\b/)) return cmd('revisar');
  if (n != null) return cmd('definir', n);
  return null;
};

/** Resposta ao resumo do dia; frase longa desconhecida vira pergunta ao Copiloto. */
export const parseBrief = (raw: string): VoiceCommand<BriefAction> | null => {
  const t = normalize(raw);
  if (!t) return null;
  const cmd = (acao: BriefAction) => ({ acao, numero: null, texto: raw });
  const words = t.split(' ').length;
  if (words <= 4) {
    if (has(t, /\b(aprova|aprovado|aprovo|pode fazer|manda ver|confirmo|confirma)\b/) && !has(t, /\bnao\b/)) return cmd('aprovar');
    if (has(t, /\b(detalhe|detalha|detalhes|mostra|abre|abrir|ver|quero ver)\b/)) return cmd('detalhe');
    if (has(t, /\b(depois|mais tarde|para|parar|chega|agora nao|obrigad\w*)\b/)) return cmd('depois');
    if (has(t, /\b(repete|repetir|de novo|outra vez)\b/)) return cmd('repetir');
    return null;
  }
  return cmd('pergunta');
};
