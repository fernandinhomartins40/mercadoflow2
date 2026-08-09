import api from './api';
import type {
  MarketUsage,
  NetworkContract,
  NetworkInvoice,
  SubscriptionEvent,
} from './subscription.service';

/* ─── Tipos ─── */

export type HealthBand = 'SAUDAVEL' | 'ATENCAO' | 'RISCO';

export interface HealthAssessment {
  score: number;
  band: HealthBand;
  /** Motivos legíveis: um número sozinho não diz o que fazer. */
  reasons: string[];
}

export interface CustomerSummary {
  marketId: string;
  name: string;
  cnpj?: string | null;
  contactEmail?: string | null;
  planCode: string;
  planName: string;
  billingStatus?: string | null;
  active: boolean;
  monthlyPriceCents: number;
  invoicesUsed: number;
  usagePercent: number;
  branchCount: number;
  pdvCount: number;
  overdueCents: number;
  healthScore: number;
  healthBand: HealthBand;
  accountOwnerEmail?: string | null;
  createdAt?: string | null;
}

export type ActivityType =
  | 'NOTE' | 'CALL' | 'EMAIL' | 'MEETING' | 'WHATSAPP'
  | 'PLAN_CHANGE' | 'PAYMENT' | 'INVOICE_SENT' | 'LIMIT_REACHED' | 'SIGNUP';

export interface CustomerActivity {
  id: string;
  activityType: ActivityType;
  title: string;
  body?: string | null;
  /** True quando gerada pelo sistema, não por uma pessoa. */
  automated: boolean;
  actorEmail?: string | null;
  createdAt: string;
}

export type TaskPriority = 'LOW' | 'NORMAL' | 'HIGH';
export type TaskStatus = 'OPEN' | 'DONE' | 'CANCELLED';

export interface CustomerTask {
  id: string;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: string | null;
  assigneeEmail?: string | null;
  completedAt?: string | null;
  createdAt: string;
  market?: { id: string; name: string } | null;
}

export interface CustomerProfile {
  marketId: string;
  name: string;
  cnpj?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  city?: string | null;
  state?: string | null;
  planCode: string;
  planName: string;
  billingStatus?: string | null;
  active: boolean;
  monthlyPriceCents: number;
  openCents: number;
  overdueCents: number;
  /** Total já pago pelo cliente ao longo da relação. */
  lifetimeCents: number;
  customerDays: number;
  accountOwnerEmail?: string | null;
  health: HealthAssessment;
  usage: MarketUsage | null;
  contract?: NetworkContract | null;
  invoices: NetworkInvoice[];
  timeline: CustomerActivity[];
  tasks: CustomerTask[];
  subscriptionEvents: SubscriptionEvent[];
  createdAt?: string | null;
}

export type DunningAction = 'RESEND_INVOICE' | 'CREATE_TASK' | 'NOTIFY_ADMIN' | 'MARK_PAST_DUE';

export interface DunningRule {
  id: string;
  name: string;
  /** Dias em relação ao vencimento: negativo é lembrete preventivo. */
  daysOffset: number;
  action: DunningAction;
  message?: string | null;
  isActive: boolean;
}

export interface DunningLog {
  id: string;
  invoiceId: string;
  ruleId: string;
  marketId?: string | null;
  action: DunningAction;
  success: boolean;
  detail?: string | null;
  executedAt: string;
}

export interface DunningRunResult {
  invoicesChecked: number;
  actionsExecuted: number;
  details: string[];
}

/* ─── Chamadas ─── */

const base = '/v1/super-admin/crm';

const listCustomers = async (): Promise<CustomerSummary[]> => {
  const { data } = await api.get<CustomerSummary[]>(`${base}/customers`);
  return data;
};

const getCustomer = async (marketId: string): Promise<CustomerProfile> => {
  const { data } = await api.get<CustomerProfile>(`${base}/customers/${marketId}`);
  return data;
};

const assignOwner = async (marketId: string, ownerEmail: string): Promise<void> => {
  await api.patch(`${base}/customers/${marketId}/owner`, { ownerEmail });
};

const refreshHealth = async (): Promise<number> => {
  const { data } = await api.post<{ updated: number }>(`${base}/health/refresh`);
  return data.updated;
};

const addActivity = async (
  marketId: string,
  payload: { activityType?: ActivityType; title: string; body?: string },
): Promise<CustomerActivity> => {
  const { data } = await api.post<CustomerActivity>(`${base}/customers/${marketId}/activities`, payload);
  return data;
};

const listTasks = async (): Promise<CustomerTask[]> => {
  const { data } = await api.get<CustomerTask[]>(`${base}/tasks`);
  return data;
};

const createTask = async (
  marketId: string,
  payload: {
    title: string;
    description?: string;
    dueDate?: string;
    priority?: TaskPriority;
    assigneeEmail?: string;
  },
): Promise<CustomerTask> => {
  const { data } = await api.post<CustomerTask>(`${base}/customers/${marketId}/tasks`, payload);
  return data;
};

const completeTask = async (taskId: string): Promise<CustomerTask> => {
  const { data } = await api.post<CustomerTask>(`${base}/tasks/${taskId}/complete`);
  return data;
};

const cancelTask = async (taskId: string): Promise<void> => {
  await api.delete(`${base}/tasks/${taskId}`);
};

const listDunningRules = async (): Promise<DunningRule[]> => {
  const { data } = await api.get<DunningRule[]>(`${base}/dunning/rules`);
  return data;
};

const saveDunningRule = async (rule: Partial<DunningRule>): Promise<DunningRule> => {
  const { data } = await api.post<DunningRule>(`${base}/dunning/rules`, rule);
  return data;
};

const deleteDunningRule = async (ruleId: string): Promise<void> => {
  await api.delete(`${base}/dunning/rules/${ruleId}`);
};

const listDunningLogs = async (): Promise<DunningLog[]> => {
  const { data } = await api.get<DunningLog[]>(`${base}/dunning/logs`);
  return data;
};

/** Dispara a régua na hora, sem esperar o job diário. */
const runDunning = async (): Promise<DunningRunResult> => {
  const { data } = await api.post<DunningRunResult>(`${base}/dunning/run`);
  return data;
};

/** Baixa o CSV pelo navegador, preservando o cookie de sessão. */
const downloadExport = (kind: 'customers' | 'invoices' | 'overdue') => {
  const url = `${api.defaults.baseURL}${base}/export/${kind}`;
  window.open(url, '_blank');
};

export default {
  listCustomers,
  getCustomer,
  assignOwner,
  refreshHealth,
  addActivity,
  listTasks,
  createTask,
  completeTask,
  cancelTask,
  listDunningRules,
  saveDunningRule,
  deleteDunningRule,
  listDunningLogs,
  runDunning,
  downloadExport,
};
