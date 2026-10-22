import { useAuth } from '../context/AuthContext';
import type { TeamRole } from '../services/auth.service';

/**
 * O que cada papel da equipe pode ALTERAR, por área do app.
 *
 * Espelho de backend/src/main/java/com/pdv2cloud/service/team/TeamPermissions.java
 * (o servidor continua sendo quem decide: aqui só escondemos ou desabilitamos o
 * botão para a pessoa não descobrir o bloqueio no 403). Ler é livre para todos,
 * exceto o conferente, que só usa o Confere.
 *
 *              equipe  assinatura  confere  compras  operação
 * Dono          sim     sim         sim      sim      sim
 * Gerente       —       —           sim      sim      sim
 * Comprador     —       —           sim      sim      só decisões de compra do Tino
 * Conferente    —       —           sim      —        —
 * Financeiro    —       sim         —        —        —
 * Leitura       —       —           —        —        —
 */
export type TeamArea =
  /** /team: convites, papéis, titularidade. */
  | 'TEAM'
  /** /billing, /subscription (alterar), /ai-credits/orders. */
  | 'BILLING'
  /** /confere. */
  | 'CONFERE'
  /** /supplier-orders, /suppliers, /shopping-list, /purchase-history, decidir/pedir recomendação de compra. */
  | 'PURCHASING'
  /** Aprovar/recusar decisão do Tino de um agente de compras (Compras, Recebimento). */
  | 'COPILOT_PURCHASE_DECISION'
  /** Aprovar/recusar as demais decisões do Tino. */
  | 'COPILOT_DECISION'
  /** Todo o resto que altera dados da loja (encartes, mapa, caixas, contagem, integrações...). */
  | 'OPERATION';

const LABEL: Record<TeamRole, string> = {
  DONO: 'Dono', GERENTE: 'Gerente', COMPRADOR: 'Comprador', CONFERENTE: 'Conferente', FINANCEIRO: 'Financeiro', LEITURA: 'Leitura',
};

/** O papel pode alterar algo nesta área? Sem papel (conta antiga, admin) vale como dono, igual ao servidor. */
export function can(teamRole: TeamRole | null | undefined, area: TeamArea): boolean {
  if (!teamRole || teamRole === 'DONO') return true;
  if (area === 'TEAM') return false;
  if (teamRole === 'CONFERENTE') return area === 'CONFERE';
  switch (teamRole) {
    case 'GERENTE': return area !== 'BILLING';
    case 'COMPRADOR': return area === 'CONFERE' || area === 'PURCHASING' || area === 'COPILOT_PURCHASE_DECISION';
    case 'FINANCEIRO': return area === 'BILLING';
    case 'LEITURA': return false;
    default: return true;
  }
}

/** Mesma frase do 403 do servidor, para a dica do botão desabilitado. */
export function deniedMessage(teamRole: TeamRole | null | undefined): string {
  const label = teamRole ? LABEL[teamRole] : 'atual';
  return `Seu papel na equipe (${label}) não permite esta ação. Fale com o dono da conta.`;
}

/** Na tela: `const perm = useTeamPermission(); perm.can('PURCHASING')`. */
export function useTeamPermission() {
  const { teamRole } = useAuth();
  return {
    teamRole: teamRole ?? null,
    can: (area: TeamArea) => can(teamRole, area),
    /** Dica para `title` de botão desabilitado; undefined quando pode. */
    hint: (area: TeamArea) => (can(teamRole, area) ? undefined : deniedMessage(teamRole)),
    /** Papel que só lê (nada de operação): mostrar o aviso no topo das telas. */
    readOnly: !!teamRole && teamRole !== 'DONO' && teamRole !== 'GERENTE' && !can(teamRole, 'OPERATION'),
    label: teamRole ? LABEL[teamRole] : null,
  };
}
