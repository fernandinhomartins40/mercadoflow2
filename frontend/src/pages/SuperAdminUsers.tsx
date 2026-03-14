import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import SuperAdminLayout from '../components/layout/SuperAdminLayout';
import Button from '../components/common/Button';
import MetricsCard from '../components/dashboard/MetricsCard';
import PageHero from '../components/dashboard/PageHero';
import api from '../services/api';

interface SuperAdminOverview {
  totalUsers: number;
  activeUsers: number;
  blockedUsers: number;
  orphanUsers: number;
  totalMarkets: number;
  activeMarkets: number;
  trialMarkets: number;
  pastDueMarkets: number;
  suspendedMarkets: number;
  expiringMarkets: number;
  seatLimitTotal: number;
  seatUsedTotal: number;
}

interface SuperAdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
  lastLoginAt?: string | null;
  marketId?: string | null;
  marketName?: string | null;
  marketPlan?: string | null;
  marketBillingStatus?: string | null;
  marketActive?: boolean | null;
  marketAccessExpiresAt?: string | null;
  accessStatus?: string | null;
  accessReason?: string | null;
}

interface SuperAdminMarket {
  id: string;
  name: string;
  cnpj?: string | null;
  planType: string;
  billingStatus: string;
  isActive: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
  accessExpiresAt?: string | null;
  trialEndsAt?: string | null;
  userSeatLimit?: number | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  notes?: string | null;
  usersCount: number;
  activeUsersCount: number;
  accessStatus?: string | null;
  accessReason?: string | null;
}

interface PageResponse<T> {
  content: T[];
  totalPages: number;
  totalElements: number;
  number: number;
}

const USER_ROLE_OPTIONS = [
  'MARKET_OWNER',
  'MARKET_MANAGER',
  'ADMIN',
  'INDUSTRY_USER',
  'SUPER_ADMIN',
] as const;

const PLAN_OPTIONS = ['BASIC', 'INTERMEDIATE', 'ADVANCED'] as const;
const BILLING_STATUS_OPTIONS = ['ACTIVE', 'TRIAL', 'PAST_DUE', 'SUSPENDED', 'CANCELLED'] as const;

const ROLE_LABELS: Record<string, string> = {
  MARKET_OWNER: 'Responsável da conta',
  MARKET_MANAGER: 'Gestor da conta',
  ADMIN: 'Administrador',
  INDUSTRY_USER: 'Indústria',
  SUPER_ADMIN: 'Super admin',
};

const PLAN_LABELS: Record<string, string> = {
  BASIC: 'Básico',
  INTERMEDIATE: 'Intermediário',
  ADVANCED: 'Avançado',
};

const BILLING_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Ativa',
  TRIAL: 'Em teste',
  PAST_DUE: 'Em atraso',
  SUSPENDED: 'Suspensa',
  CANCELLED: 'Cancelada',
};

const ACCESS_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Ativa',
  TRIAL: 'Em teste',
  EXPIRING_SOON: 'Vence em breve',
  PAST_DUE: 'Em atraso',
  BLOCKED: 'Bloqueada',
  SUSPENDED: 'Suspensa',
  CANCELLED: 'Cancelada',
  EXPIRED: 'Vencida',
};

const EMPTY_USER_FORM = {
  name: '',
  email: '',
  password: '',
  role: 'MARKET_OWNER',
  marketId: '',
  isActive: true,
};

const EMPTY_MARKET_FORM = {
  name: '',
  cnpj: '',
  planType: 'BASIC',
  billingStatus: 'ACTIVE',
  active: true,
  userSeatLimit: '3',
  accessExpiresAt: '',
  trialEndsAt: '',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  notes: '',
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '--';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ?'--' : parsed.toLocaleString('pt-BR');
};

const textValue = (value?: string | null) => {
  if (!value) return '--';
  const normalized = value.trim();
  return normalized || '--';
};

const toDateTimeLocalValue = (value?: string | null) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const offsetMs = parsed.getTimezoneOffset() * 60000;
  return new Date(parsed.getTime() - offsetMs).toISOString().slice(0, 16);
};

const seatCaption = (market: SuperAdminMarket) => {
  const limit = market.userSeatLimit && market.userSeatLimit > 0 ?market.userSeatLimit : null;
  return limit ?`${market.activeUsersCount}/${limit} ativos` : `${market.activeUsersCount} ativos`;
};

const formatRole = (role?: string | null) => ROLE_LABELS[role || ''] || textValue(role);

const formatPlanType = (planType?: string | null) => PLAN_LABELS[planType || ''] || textValue(planType);

const formatBillingStatus = (billingStatus?: string | null) => BILLING_STATUS_LABELS[billingStatus || ''] || textValue(billingStatus);

const formatAccessStatus = (accessStatus?: string | null) => ACCESS_STATUS_LABELS[accessStatus || ''] || textValue(accessStatus);

const statusTone = (status?: string | null) => {
  switch ((status || '').toUpperCase()) {
    case 'ACTIVE':
      return 'success';
    case 'TRIAL':
    case 'EXPIRING_SOON':
      return 'warning';
    case 'PAST_DUE':
      return 'warning';
    case 'BLOCKED':
    case 'SUSPENDED':
    case 'CANCELLED':
    case 'EXPIRED':
      return 'danger';
    default:
      return 'neutral';
  }
};

const SuperAdminUsers: React.FC = () => {
  const [overview, setOverview] = useState<SuperAdminOverview | null>(null);
  const [usersPage, setUsersPage] = useState<PageResponse<SuperAdminUser> | null>(null);
  const [marketsPage, setMarketsPage] = useState<PageResponse<SuperAdminMarket> | null>(null);
  const [marketLookupPage, setMarketLookupPage] = useState<PageResponse<SuperAdminMarket> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [savingUser, setSavingUser] = useState(false);
  const [savingMarket, setSavingMarket] = useState(false);

  const [userPage, setUserPage] = useState(0);
  const [marketPage, setMarketPage] = useState(0);
  const [userFilters, setUserFilters] = useState({ search: '', role: '', active: '' });
  const [userDraftFilters, setUserDraftFilters] = useState({ search: '', role: '', active: '' });
  const [marketFilters, setMarketFilters] = useState({ search: '', planType: '', billingStatus: '', active: '' });
  const [marketDraftFilters, setMarketDraftFilters] = useState({ search: '', planType: '', billingStatus: '', active: '' });

  const [userForm, setUserForm] = useState(EMPTY_USER_FORM);
  const [marketForm, setMarketForm] = useState(EMPTY_MARKET_FORM);
  const [editingUserId, setEditingUserId] = useState('');
  const [editingMarketId, setEditingMarketId] = useState('');
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [marketModalOpen, setMarketModalOpen] = useState(false);

  const users = usersPage?.content || [];
  const markets = marketsPage?.content || [];
  const marketLookup = marketLookupPage?.content || [];

  const marketOptions = useMemo(
    () => marketLookup.map((market) => ({ label: `${market.name} (${formatPlanType(market.planType)})`, value: market.id })),
    [marketLookup]
  );

  const load = async () => {
    setLoading(true);
    try {
      const [overviewResp, usersResp, marketsResp, marketLookupResp] = await Promise.all([
        api.get('/v1/super-admin/overview'),
        api.get('/v1/super-admin/users', {
          params: {
            page: userPage,
            size: 20,
            search: userFilters.search || undefined,
            role: userFilters.role || undefined,
            active: userFilters.active === '' ?undefined : userFilters.active === 'true',
          },
        }),
        api.get('/v1/super-admin/markets', {
          params: {
            page: marketPage,
            size: 20,
            search: marketFilters.search || undefined,
            planType: marketFilters.planType || undefined,
            billingStatus: marketFilters.billingStatus || undefined,
            active: marketFilters.active === '' ?undefined : marketFilters.active === 'true',
          },
        }),
        api.get('/v1/super-admin/markets', {
          params: {
            page: 0,
            size: 200,
          },
        }),
      ]);
      setOverview(overviewResp.data);
      setUsersPage(usersResp.data);
      setMarketsPage(marketsResp.data);
      setMarketLookupPage(marketLookupResp.data);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Falha ao carregar a gestão de contas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [userPage, marketPage, userFilters.search, userFilters.role, userFilters.active, marketFilters.search, marketFilters.planType, marketFilters.billingStatus, marketFilters.active]);

  const resetFeedback = () => {
    setError(null);
    setSuccess(null);
  };

  const applyUserFilters = () => {
    setUserPage(0);
    setUserFilters({
      search: userDraftFilters.search.trim(),
      role: userDraftFilters.role,
      active: userDraftFilters.active,
    });
  };

  const clearUserFilters = () => {
    setUserPage(0);
    setUserDraftFilters({ search: '', role: '', active: '' });
    setUserFilters({ search: '', role: '', active: '' });
  };

  const applyMarketFilters = () => {
    setMarketPage(0);
    setMarketFilters({
      search: marketDraftFilters.search.trim(),
      planType: marketDraftFilters.planType,
      billingStatus: marketDraftFilters.billingStatus,
      active: marketDraftFilters.active,
    });
  };

  const clearMarketFilters = () => {
    setMarketPage(0);
    setMarketDraftFilters({ search: '', planType: '', billingStatus: '', active: '' });
    setMarketFilters({ search: '', planType: '', billingStatus: '', active: '' });
  };

  const resetUserForm = () => {
    setEditingUserId('');
    setUserForm(EMPTY_USER_FORM);
    setUserModalOpen(false);
  };

  const resetMarketForm = () => {
    setEditingMarketId('');
    setMarketForm(EMPTY_MARKET_FORM);
    setMarketModalOpen(false);
  };

  const saveUser = async () => {
    setSavingUser(true);
    resetFeedback();
    try {
      const payload = {
        name: userForm.name.trim(),
        email: userForm.email.trim(),
        password: userForm.password.trim() || undefined,
        role: userForm.role,
        marketId: userForm.marketId || null,
        isActive: userForm.isActive,
      };

      if (!payload.name || !payload.email) {
        throw new Error('Nome e e-mail do usuário são obrigatórios.');
      }
      if (!editingUserId && !payload.password) {
        throw new Error('Informe a senha inicial para criar o usuário.');
      }

      if (editingUserId) {
        await api.put(`/v1/super-admin/users/${editingUserId}`, payload);
        setSuccess('Usuário atualizado.');
      } else {
        await api.post('/v1/super-admin/users', payload);
        setSuccess('Usuário criado.');
      }

      resetUserForm();
      await load();
    } catch (err: any) {
      setError(err?.message || 'Falha ao salvar usuário');
    } finally {
      setSavingUser(false);
    }
  };

  const saveMarket = async () => {
    setSavingMarket(true);
    resetFeedback();
    try {
      const payload = {
        name: marketForm.name.trim(),
        cnpj: marketForm.cnpj.trim() || null,
        planType: marketForm.planType,
        billingStatus: marketForm.billingStatus,
        active: marketForm.active,
        userSeatLimit: marketForm.userSeatLimit.trim() ?Number(marketForm.userSeatLimit) : undefined,
        accessExpiresAt: marketForm.accessExpiresAt || null,
        trialEndsAt: marketForm.trialEndsAt || null,
        contactName: marketForm.contactName.trim() || null,
        contactEmail: marketForm.contactEmail.trim() || null,
        contactPhone: marketForm.contactPhone.trim() || null,
        notes: marketForm.notes.trim() || null,
      };

      if (!payload.name) {
        throw new Error('Informe o nome da conta.');
      }
      if (payload.userSeatLimit !== undefined && (!Number.isFinite(payload.userSeatLimit) || payload.userSeatLimit < 1)) {
        throw new Error('Informe um limite de usuários maior ou igual a 1.');
      }

      if (editingMarketId) {
        await api.patch(`/v1/super-admin/markets/${editingMarketId}`, payload);
        setSuccess('Conta atualizada.');
      } else {
        await api.post('/v1/super-admin/markets', payload);
        setSuccess('Conta criada.');
      }

      resetMarketForm();
      await load();
    } catch (err: any) {
      setError(err?.message || 'Falha ao salvar conta');
    } finally {
      setSavingMarket(false);
    }
  };

  const startEditUser = (user: SuperAdminUser) => {
    resetFeedback();
    setEditingUserId(user.id);
    setUserForm({
      name: user.name || '',
      email: user.email || '',
      password: '',
      role: user.role || 'MARKET_OWNER',
      marketId: user.marketId || '',
      isActive: user.isActive,
    });
    setUserModalOpen(true);
  };

  const startEditMarket = (market: SuperAdminMarket) => {
    resetFeedback();
    setEditingMarketId(market.id);
    setMarketForm({
      name: market.name || '',
      cnpj: market.cnpj || '',
      planType: market.planType || 'BASIC',
      billingStatus: market.billingStatus || 'ACTIVE',
      active: market.isActive,
      userSeatLimit: market.userSeatLimit ?String(market.userSeatLimit) : '',
      accessExpiresAt: toDateTimeLocalValue(market.accessExpiresAt),
      trialEndsAt: toDateTimeLocalValue(market.trialEndsAt),
      contactName: market.contactName || '',
      contactEmail: market.contactEmail || '',
      contactPhone: market.contactPhone || '',
      notes: market.notes || '',
    });
    setMarketModalOpen(true);
  };

  const openCreateUserModal = () => {
    resetFeedback();
    setEditingUserId('');
    setUserForm(EMPTY_USER_FORM);
    setUserModalOpen(true);
  };

  const openCreateMarketModal = () => {
    resetFeedback();
    setEditingMarketId('');
    setMarketForm(EMPTY_MARKET_FORM);
    setMarketModalOpen(true);
  };

  useEffect(() => {
    if (!userModalOpen && !marketModalOpen) {
      return undefined;
    }
    const originalOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
      if (userModalOpen && !savingUser) {
        resetUserForm();
        return;
      }
      if (marketModalOpen && !savingMarket) {
        resetMarketForm();
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [userModalOpen, marketModalOpen, savingUser, savingMarket]);

  const toggleUserStatus = async (user: SuperAdminUser) => {
    resetFeedback();
    try {
      await api.patch(`/v1/super-admin/users/${user.id}/status`, { active: !user.isActive });
      setSuccess(user.isActive ?'Usuário bloqueado.' : 'Usuário liberado.');
      await load();
    } catch (err: any) {
      setError(err?.message || 'Falha ao alterar o status do usuário');
    }
  };

  const toggleMarketStatus = async (market: SuperAdminMarket) => {
    resetFeedback();
    try {
      await api.patch(`/v1/super-admin/markets/${market.id}`, {
        name: market.name,
        cnpj: market.cnpj || null,
        planType: market.planType,
        billingStatus: market.billingStatus,
        active: !market.isActive,
        userSeatLimit: market.userSeatLimit,
        accessExpiresAt: market.accessExpiresAt || null,
        trialEndsAt: market.trialEndsAt || null,
        contactName: market.contactName || null,
        contactEmail: market.contactEmail || null,
        contactPhone: market.contactPhone || null,
        notes: market.notes || null,
      });
      setSuccess(market.isActive ?'Conta bloqueada.' : 'Conta liberada.');
      await load();
    } catch (err: any) {
      setError(err?.message || 'Falha ao alterar o status da conta');
    }
  };

  return (
    <SuperAdminLayout>
      <div className="super-admin-page">
        <PageHero
          className="super-admin-command-grid"
          articleClassName="super-admin-command-card"
          badge="Contas e acesso"
          title="Contas, usuários e acesso da operação."
          description="Aqui você controla quem pode entrar, quantos usuários cada conta pode ter e o que precisa de ajuste manual."
          actions={
            <>
              <Link to="/super-admin" className="button secondary">Voltar ao painel</Link>
              <Link to="/super-admin/crawler" className="button secondary">Abrir crawler</Link>
            </>
          }
          feature={
            <>
              <div className="dashboard-glow-card">
                <span className="section-kicker">Licenças em uso</span>
                <h3>{overview?.seatUsedTotal ?? 0} usuários ativos</h3>
                <strong>{overview?.seatLimitTotal ?? 0}</strong>
                <p>limite total liberado nas contas cadastradas.</p>
              </div>

              <div className="dashboard-command-mosaic">
                <div className="dashboard-mini-tile">
                  <span>Contas</span>
                  <strong>{overview?.totalMarkets ?? 0}</strong>
                  <small>{overview?.activeMarkets ?? 0} ativas</small>
                </div>
                <div className="dashboard-mini-tile">
                  <span>Usuários ativos</span>
                  <strong>{overview?.activeUsers ?? 0}</strong>
                  <small>{overview?.blockedUsers ?? 0} bloqueados</small>
                </div>
                <div className="dashboard-mini-tile accent">
                  <span>Vencimento próximo</span>
                  <strong>{overview?.expiringMarkets ?? 0}</strong>
                  <small>contas que vencem nos próximos 7 dias</small>
                </div>
              </div>
            </>
          }
          aside={
            <>
              <div className="dashboard-priority-card dark">
                <span className="section-kicker">Atenção agora</span>
                <strong>{overview?.pastDueMarkets ?? 0} contas em atraso</strong>
                <p>{overview?.suspendedMarkets ?? 0} contas suspensas precisam de revisão manual.</p>
              </div>
              <div className="dashboard-priority-card">
                <span className="section-kicker">Usuários sem conta</span>
                <strong>{overview?.orphanUsers ?? 0}</strong>
                <p>Revise o vínculo desses usuários para evitar acesso incorreto.</p>
              </div>
            </>
          }
        />
        {error ?<div className="card" style={{ color: 'var(--danger)' }}>{error}</div> : null}
        {success ?<div className="card" style={{ color: 'var(--success)' }}>{success}</div> : null}

        <div className="metrics-grid analytics-metrics-grid dashboard-kpi-ribbon">
          <MetricsCard title="Contas" value={overview?.totalMarkets ?? 0} icon="CT" />
          <MetricsCard title="Ativas" value={overview?.activeMarkets ?? 0} icon="ON" />
          <MetricsCard title="Em atraso" value={overview?.pastDueMarkets ?? 0} icon="AT" />
          <MetricsCard title="Usuários ativos" value={overview?.activeUsers ?? 0} icon="US" />
        </div>

        <div className="dashboard-inline-grid">
          <section className="analytics-panel reveal dashboard-note-card">
            <div className="analytics-panel-head">
              <div>
                <span className="section-kicker">Conta</span>
                <h3>Criar ou editar conta</h3>
              </div>
              <div className="card-section-actions">
                <Button onClick={openCreateMarketModal}>Nova conta</Button>
              </div>
            </div>
            <p className="super-admin-table-meta">Abra o modal para cadastrar ou ajustar uma conta sem tirar o foco da listagem.</p>
          </section>

          <section className="analytics-panel reveal dashboard-note-card">
            <div className="analytics-panel-head">
              <div>
                <span className="section-kicker">Usuário</span>
                <h3>Criar ou editar usuário</h3>
              </div>
              <div className="card-section-actions">
                <Button onClick={openCreateUserModal}>Novo usuário</Button>
              </div>
            </div>
            <p className="super-admin-table-meta">Cadastre usuários e ajuste acessos pelo modal, sem formulário fixo na página.</p>
          </section>
        </div>

        <section className="analytics-panel reveal">
          <div className="analytics-panel-head">
            <div>
              <span className="section-kicker">Contas</span>
              <h3>Plano, acesso e contato</h3>
            </div>
          </div>
          <div className="filter-bar-controls super-admin-filters-grid">
            <input className="input" placeholder="Buscar por nome ou CNPJ" value={marketDraftFilters.search} onChange={(e) => setMarketDraftFilters({ ...marketDraftFilters, search: e.target.value })} />
            <select className="input" value={marketDraftFilters.planType} onChange={(e) => setMarketDraftFilters({ ...marketDraftFilters, planType: e.target.value })}>
              <option value="">Todos os planos</option>
              {PLAN_OPTIONS.map((option) => (
                <option key={option} value={option}>{formatPlanType(option)}</option>
              ))}
            </select>
            <select className="input" value={marketDraftFilters.billingStatus} onChange={(e) => setMarketDraftFilters({ ...marketDraftFilters, billingStatus: e.target.value })}>
              <option value="">Toda a cobrança</option>
              {BILLING_STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>{formatBillingStatus(option)}</option>
              ))}
            </select>
            <select className="input" value={marketDraftFilters.active} onChange={(e) => setMarketDraftFilters({ ...marketDraftFilters, active: e.target.value })}>
              <option value="">Todos os status</option>
              <option value="true">Somente ativos</option>
              <option value="false">Somente bloqueados</option>
            </select>
            <div className="catalog-admin-filter-actions">
              <Button onClick={applyMarketFilters}>Aplicar filtros</Button>
              <Button variant="secondary" onClick={clearMarketFilters}>Limpar</Button>
            </div>
          </div>
          {loading ?<div className="card">Carregando contas...</div> : (
            <div className="catalog-admin-table-wrap">
              <table className="table catalog-admin-table">
                <thead>
                  <tr>
                    <th>Conta</th>
                    <th>Plano</th>
                    <th>Cobrança</th>
                    <th>Assentos</th>
                    <th>Validade</th>
                    <th>Contato</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {markets.map((market) => (
                    <tr key={market.id}>
                      <td data-label="Conta">
                        <strong>{market.name}</strong>
                        <div className="super-admin-table-meta">CNPJ: {textValue(market.cnpj)}</div>
                        <div className="super-admin-table-meta">Atualizado em {formatDateTime(market.updatedAt || market.createdAt)}</div>
                      </td>
                      <td data-label="Plano">{formatPlanType(market.planType)}</td>
                      <td data-label="Cobrança">{formatBillingStatus(market.billingStatus)}</td>
                      <td data-label="Assentos">{seatCaption(market)}</td>
                      <td data-label="Validade">
                        <div>{market.accessExpiresAt ?`Acesso: ${formatDateTime(market.accessExpiresAt)}` : 'Acesso sem vencimento'}</div>
                        <div className="super-admin-table-meta">Teste até: {formatDateTime(market.trialEndsAt)}</div>
                      </td>
                      <td data-label="Contato">
                        <div>{textValue(market.contactName)}</div>
                        <div className="super-admin-table-meta">{textValue(market.contactEmail)}</div>
                        <div className="super-admin-table-meta">{textValue(market.contactPhone)}</div>
                      </td>
                      <td data-label="Status">
                        <span className={`super-admin-status-pill ${statusTone(market.accessStatus)}`}>{formatAccessStatus(market.accessStatus)}</span>
                        <div className="super-admin-table-meta">{textValue(market.accessReason)}</div>
                      </td>
                      <td data-label="Ações" className="table-action-cell catalog-admin-action-cell">
                        <div className="catalog-admin-row-actions">
                          <Button variant="secondary" onClick={() => startEditMarket(market)}>Editar</Button>
                          <Button variant="secondary" onClick={() => toggleMarketStatus(market)}>
                            {market.isActive ?'Bloquear' : 'Liberar'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="pager-actions admin-pager-actions" style={{ marginTop: 12 }}>
            <Button variant="secondary" onClick={() => setMarketPage((value) => Math.max(0, value - 1))} disabled={marketPage <= 0}>Anterior</Button>
            <Button variant="secondary" onClick={() => setMarketPage((value) => value + 1)} disabled={!marketsPage || marketPage >= (marketsPage.totalPages - 1)}>Próxima</Button>
          </div>
        </section>

        <section className="analytics-panel reveal">
          <div className="analytics-panel-head">
            <div>
              <span className="section-kicker">Usuários</span>
              <h3>Acessos e vínculo com conta</h3>
            </div>
            <Link to="/super-admin" className="button secondary">Voltar ao painel</Link>
          </div>
          <div className="filter-bar-controls super-admin-filters-grid">
            <input className="input" placeholder="Buscar por nome, e-mail ou conta" value={userDraftFilters.search} onChange={(e) => setUserDraftFilters({ ...userDraftFilters, search: e.target.value })} />
            <select className="input" value={userDraftFilters.role} onChange={(e) => setUserDraftFilters({ ...userDraftFilters, role: e.target.value })}>
              <option value="">Todos os papéis</option>
              {USER_ROLE_OPTIONS.map((option) => (
                <option key={option} value={option}>{formatRole(option)}</option>
              ))}
            </select>
            <select className="input" value={userDraftFilters.active} onChange={(e) => setUserDraftFilters({ ...userDraftFilters, active: e.target.value })}>
              <option value="">Todos os status</option>
              <option value="true">Somente ativos</option>
              <option value="false">Somente bloqueados</option>
            </select>
            <div className="catalog-admin-filter-actions">
              <Button onClick={applyUserFilters}>Aplicar filtros</Button>
              <Button variant="secondary" onClick={clearUserFilters}>Limpar</Button>
            </div>
          </div>
          {loading ?<div className="card">Carregando usuários...</div> : (
            <div className="catalog-admin-table-wrap">
              <table className="table catalog-admin-table">
                <thead>
                  <tr>
                    <th>Usuário</th>
                    <th>Papel</th>
                    <th>Conta</th>
                    <th>Último login</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td data-label="Usuário">
                        <strong>{user.name}</strong>
                        <div className="super-admin-table-meta">{user.email}</div>
                        <div className="super-admin-table-meta">Criado em {formatDateTime(user.createdAt)}</div>
                      </td>
                      <td data-label="Papel">{formatRole(user.role)}</td>
                      <td data-label="Conta">
                        <div>{textValue(user.marketName)}</div>
                        <div className="super-admin-table-meta">Plano: {formatPlanType(user.marketPlan)}</div>
                        <div className="super-admin-table-meta">Cobrança: {formatBillingStatus(user.marketBillingStatus)}</div>
                      </td>
                      <td data-label="Último login">{formatDateTime(user.lastLoginAt)}</td>
                      <td data-label="Status">
                        <span className={`super-admin-status-pill ${statusTone(user.accessStatus)}`}>{user.isActive ?formatAccessStatus(user.accessStatus) : 'Bloqueado'}</span>
                        <div className="super-admin-table-meta">{user.isActive ?textValue(user.accessReason) : 'Usuário bloqueado manualmente'}</div>
                      </td>
                      <td data-label="Ações" className="table-action-cell catalog-admin-action-cell">
                        <div className="catalog-admin-row-actions">
                          <Button variant="secondary" onClick={() => startEditUser(user)}>Editar</Button>
                          <Button variant="secondary" onClick={() => toggleUserStatus(user)}>
                            {user.isActive ?'Bloquear' : 'Liberar'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="pager-actions admin-pager-actions" style={{ marginTop: 12 }}>
            <Button variant="secondary" onClick={() => setUserPage((value) => Math.max(0, value - 1))} disabled={userPage <= 0}>Anterior</Button>
            <Button variant="secondary" onClick={() => setUserPage((value) => value + 1)} disabled={!usersPage || userPage >= (usersPage.totalPages - 1)}>Próxima</Button>
          </div>
        </section>

        {marketModalOpen ?(
          <div className="catalog-admin-modal-backdrop" role="presentation" onClick={() => { if (!savingMarket) resetMarketForm(); }}>
            <div
              className="catalog-admin-modal card super-admin-saas-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="super-admin-market-modal-title"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="catalog-admin-modal-head">
                <div>
                  <span className="section-kicker">Conta</span>
                  <h3 id="super-admin-market-modal-title">{editingMarketId ?'Editar conta' : 'Nova conta'}</h3>
                </div>
                <div className="catalog-admin-modal-head-actions">
                  <Button variant="secondary" onClick={resetMarketForm} disabled={savingMarket}>Cancelar</Button>
                  <Button onClick={saveMarket} disabled={savingMarket}>
                    {savingMarket ?'Salvando...' : (editingMarketId ?'Salvar conta' : 'Criar conta')}
                  </Button>
                </div>
              </div>
              <div className="super-admin-saas-modal-grid">
                <input className="input" placeholder="Nome da conta" value={marketForm.name} onChange={(e) => setMarketForm({ ...marketForm, name: e.target.value })} />
                <input className="input" placeholder="CNPJ" value={marketForm.cnpj} onChange={(e) => setMarketForm({ ...marketForm, cnpj: e.target.value })} />
                <select className="input" value={marketForm.planType} onChange={(e) => setMarketForm({ ...marketForm, planType: e.target.value })}>
                  {PLAN_OPTIONS.map((option) => (
                    <option key={option} value={option}>{formatPlanType(option)}</option>
                  ))}
                </select>
                <select className="input" value={marketForm.billingStatus} onChange={(e) => setMarketForm({ ...marketForm, billingStatus: e.target.value })}>
                  {BILLING_STATUS_OPTIONS.map((option) => (
                    <option key={option} value={option}>{formatBillingStatus(option)}</option>
                  ))}
                </select>
                <input className="input" placeholder="Limite de usuários" value={marketForm.userSeatLimit} onChange={(e) => setMarketForm({ ...marketForm, userSeatLimit: e.target.value })} />
                <input className="input" type="datetime-local" value={marketForm.accessExpiresAt} onChange={(e) => setMarketForm({ ...marketForm, accessExpiresAt: e.target.value })} />
                <input className="input" type="datetime-local" value={marketForm.trialEndsAt} onChange={(e) => setMarketForm({ ...marketForm, trialEndsAt: e.target.value })} />
                <input className="input" placeholder="Contato principal" value={marketForm.contactName} onChange={(e) => setMarketForm({ ...marketForm, contactName: e.target.value })} />
                <input className="input" placeholder="E-mail do contato" value={marketForm.contactEmail} onChange={(e) => setMarketForm({ ...marketForm, contactEmail: e.target.value })} />
                <input className="input" placeholder="Telefone do contato" value={marketForm.contactPhone} onChange={(e) => setMarketForm({ ...marketForm, contactPhone: e.target.value })} />
                <label className="checkbox super-admin-inline-checkbox super-admin-saas-modal-checkbox">
                  <input type="checkbox" checked={marketForm.active} onChange={(e) => setMarketForm({ ...marketForm, active: e.target.checked })} />
                  <span>Conta ativa</span>
                </label>
                <textarea className="input super-admin-notes super-admin-saas-modal-notes" placeholder="Observações internas" value={marketForm.notes} onChange={(e) => setMarketForm({ ...marketForm, notes: e.target.value })} />
              </div>
            </div>
          </div>
        ) : null}

        {userModalOpen ?(
          <div className="catalog-admin-modal-backdrop" role="presentation" onClick={() => { if (!savingUser) resetUserForm(); }}>
            <div
              className="catalog-admin-modal card super-admin-saas-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="super-admin-user-modal-title"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="catalog-admin-modal-head">
                <div>
                  <span className="section-kicker">Usuário</span>
                  <h3 id="super-admin-user-modal-title">{editingUserId ?'Editar usuário' : 'Novo usuário'}</h3>
                </div>
                <div className="catalog-admin-modal-head-actions">
                  <Button variant="secondary" onClick={resetUserForm} disabled={savingUser}>Cancelar</Button>
                  <Button onClick={saveUser} disabled={savingUser}>
                    {savingUser ?'Salvando...' : (editingUserId ?'Salvar usuário' : 'Criar usuário')}
                  </Button>
                </div>
              </div>
              <div className="super-admin-saas-modal-grid">
                <input className="input" placeholder="Nome" value={userForm.name} onChange={(e) => setUserForm({ ...userForm, name: e.target.value })} />
                <input className="input" placeholder="E-mail" value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} />
                <input className="input" placeholder={editingUserId ?'Nova senha (opcional)' : 'Senha inicial'} value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} />
                <select className="input" value={userForm.role} onChange={(e) => setUserForm({ ...userForm, role: e.target.value, marketId: e.target.value === 'SUPER_ADMIN' ?'' : userForm.marketId })}>
                  {USER_ROLE_OPTIONS.map((option) => (
                    <option key={option} value={option}>{formatRole(option)}</option>
                  ))}
                </select>
                <select className="input" value={userForm.marketId} onChange={(e) => setUserForm({ ...userForm, marketId: e.target.value })} disabled={userForm.role === 'SUPER_ADMIN'}>
                  <option value="">Sem conta vinculada</option>
                  {marketOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <label className="checkbox super-admin-inline-checkbox super-admin-saas-modal-checkbox">
                  <input type="checkbox" checked={userForm.isActive} onChange={(e) => setUserForm({ ...userForm, isActive: e.target.checked })} />
                  <span>Usuário ativo</span>
                </label>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </SuperAdminLayout>
  );
};

export default SuperAdminUsers;
