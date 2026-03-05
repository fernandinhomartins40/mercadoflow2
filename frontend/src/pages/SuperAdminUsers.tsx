import React, { useEffect, useMemo, useState } from 'react';
import SuperAdminLayout from '../components/layout/SuperAdminLayout';
import Button from '../components/common/Button';
import api from '../services/api';

interface SuperAdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  marketId?: string | null;
  marketName?: string | null;
  marketPlan?: string | null;
  marketActive?: boolean | null;
}

interface SuperAdminMarket {
  id: string;
  name: string;
  cnpj?: string | null;
  planType: string;
  isActive: boolean;
  usersCount: number;
}

interface PageResponse<T> {
  content: T[];
  totalPages: number;
  totalElements: number;
  number: number;
}

const SuperAdminUsers: React.FC = () => {
  const [usersPage, setUsersPage] = useState<PageResponse<SuperAdminUser> | null>(null);
  const [marketsPage, setMarketsPage] = useState<PageResponse<SuperAdminMarket> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    password: '',
    role: 'MARKET_OWNER',
    marketId: '',
    isActive: true,
  });

  const [newMarket, setNewMarket] = useState({
    name: '',
    cnpj: '',
    planType: 'BASIC',
    active: true,
  });

  const users = usersPage?.content || [];
  const markets = marketsPage?.content || [];

  const marketOptions = useMemo(
    () => markets.map((market) => ({ label: `${market.name} (${market.planType})`, value: market.id })),
    [markets]
  );

  const load = async () => {
    setLoading(true);
    try {
      const [usersResp, marketsResp] = await Promise.all([
        api.get('/v1/super-admin/users', { params: { page, size: 20, search: search || undefined } }),
        api.get('/v1/super-admin/markets', { params: { page: 0, size: 100 } }),
      ]);
      setUsersPage(usersResp.data);
      setMarketsPage(marketsResp.data);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Falha ao carregar usuarios/mercados');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [page]);

  const toggleUserStatus = async (user: SuperAdminUser) => {
    await api.patch(`/v1/super-admin/users/${user.id}/status`, { active: !user.isActive });
    await load();
  };

  const updateUserRole = async (user: SuperAdminUser, role: string) => {
    await api.patch(`/v1/super-admin/users/${user.id}/role`, { role });
    await load();
  };

  const createUser = async () => {
    await api.post('/v1/super-admin/users', {
      ...newUser,
      marketId: newUser.marketId || null,
    });
    setNewUser({ name: '', email: '', password: '', role: 'MARKET_OWNER', marketId: '', isActive: true });
    await load();
  };

  const createMarket = async () => {
    await api.post('/v1/super-admin/markets', newMarket);
    setNewMarket({ name: '', cnpj: '', planType: 'BASIC', active: true });
    await load();
  };

  const changeMarketPlan = async (marketId: string, planType: string) => {
    await api.patch(`/v1/super-admin/markets/${marketId}`, { planType });
    await load();
  };

  const toggleMarketStatus = async (market: SuperAdminMarket) => {
    await api.patch(`/v1/super-admin/markets/${market.id}`, { active: !market.isActive });
    await load();
  };

  return (
    <SuperAdminLayout>
      <div className="super-admin-page">
        <section className="analytics-hero compact reveal">
          <div className="analytics-hero-copy">
            <span className="pill">Gestao de Acesso</span>
            <h1 className="analytics-hero-title">Usuarios, planos e bloqueios</h1>
            <p className="analytics-hero-text">Crie usuarios, altere papeis e bloqueie/desbloqueie acessos sem depender do painel principal.</p>
          </div>
        </section>

        <section className="analytics-panel reveal">
          <div className="analytics-panel-head">
            <div>
              <span className="section-kicker">Novo usuario</span>
              <h3>Criar acesso</h3>
            </div>
          </div>
          <div className="filter-bar-controls super-admin-form-grid">
            <input className="input" placeholder="Nome" value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} />
            <input className="input" placeholder="E-mail" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} />
            <input className="input" placeholder="Senha inicial" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} />
            <select className="input" value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}>
              <option value="MARKET_OWNER">MARKET_OWNER</option>
              <option value="MARKET_MANAGER">MARKET_MANAGER</option>
              <option value="ADMIN">ADMIN</option>
              <option value="INDUSTRY_USER">INDUSTRY_USER</option>
              <option value="SUPER_ADMIN">SUPER_ADMIN</option>
            </select>
            <select className="input" value={newUser.marketId} onChange={(e) => setNewUser({ ...newUser, marketId: e.target.value })}>
              <option value="">Sem mercado</option>
              {marketOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <Button onClick={createUser}>Criar usuario</Button>
          </div>
        </section>

        <section className="analytics-panel reveal">
          <div className="analytics-panel-head">
            <div>
              <span className="section-kicker">Novo mercado</span>
              <h3>Criar filial/grupo</h3>
            </div>
          </div>
          <div className="filter-bar-controls super-admin-form-grid">
            <input className="input" placeholder="Nome do mercado" value={newMarket.name} onChange={(e) => setNewMarket({ ...newMarket, name: e.target.value })} />
            <input className="input" placeholder="CNPJ (opcional)" value={newMarket.cnpj} onChange={(e) => setNewMarket({ ...newMarket, cnpj: e.target.value })} />
            <select className="input" value={newMarket.planType} onChange={(e) => setNewMarket({ ...newMarket, planType: e.target.value })}>
              <option value="BASIC">BASIC</option>
              <option value="INTERMEDIATE">INTERMEDIATE</option>
              <option value="ADVANCED">ADVANCED</option>
            </select>
            <Button onClick={createMarket}>Criar mercado</Button>
          </div>
        </section>

        <section className="analytics-panel reveal">
          <div className="analytics-panel-head">
            <div>
              <span className="section-kicker">Consulta</span>
              <h3>Usuarios cadastrados</h3>
            </div>
          </div>
          <div className="filter-bar-controls">
            <input className="input" placeholder="Buscar por nome, e-mail ou mercado" value={search} onChange={(e) => setSearch(e.target.value)} />
            <Button onClick={() => { setPage(0); load(); }}>Buscar</Button>
          </div>

          {error ? <div className="card" style={{ color: 'var(--danger)' }}>{error}</div> : null}
          {loading ? <div className="card">Carregando...</div> : (
            <div className="catalog-admin-table-wrap">
              <table className="table catalog-admin-table">
                <thead>
                  <tr>
                    <th>Usuario</th>
                    <th>Papel</th>
                    <th>Mercado</th>
                    <th>Status</th>
                    <th>Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <strong>{user.name}</strong>
                        <div style={{ color: 'var(--muted)', fontSize: 12 }}>{user.email}</div>
                      </td>
                      <td>
                        <select className="input" value={user.role} onChange={(e) => updateUserRole(user, e.target.value)}>
                          <option value="MARKET_OWNER">MARKET_OWNER</option>
                          <option value="MARKET_MANAGER">MARKET_MANAGER</option>
                          <option value="ADMIN">ADMIN</option>
                          <option value="INDUSTRY_USER">INDUSTRY_USER</option>
                          <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                        </select>
                      </td>
                      <td>{user.marketName || '--'}</td>
                      <td>{user.isActive ? 'Ativo' : 'Bloqueado'}</td>
                      <td>
                        <Button variant="secondary" onClick={() => toggleUserStatus(user)}>
                          {user.isActive ? 'Bloquear' : 'Liberar'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="pager-actions" style={{ marginTop: 12 }}>
            <Button variant="secondary" onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={page <= 0}>Anterior</Button>
            <Button variant="secondary" onClick={() => setPage((value) => value + 1)} disabled={!usersPage || page >= (usersPage.totalPages - 1)}>Proxima</Button>
          </div>
        </section>

        <section className="analytics-panel reveal">
          <div className="analytics-panel-head">
            <div>
              <span className="section-kicker">Planos</span>
              <h3>Mercados e licenciamento</h3>
            </div>
          </div>
          <div className="catalog-admin-table-wrap">
            <table className="table catalog-admin-table">
              <thead>
                <tr>
                  <th>Mercado</th>
                  <th>CNPJ</th>
                  <th>Plano</th>
                  <th>Usuarios</th>
                  <th>Status</th>
                  <th>Acoes</th>
                </tr>
              </thead>
              <tbody>
                {markets.map((market) => (
                  <tr key={market.id}>
                    <td>{market.name}</td>
                    <td>{market.cnpj || '--'}</td>
                    <td>
                      <select className="input" value={market.planType} onChange={(e) => changeMarketPlan(market.id, e.target.value)}>
                        <option value="BASIC">BASIC</option>
                        <option value="INTERMEDIATE">INTERMEDIATE</option>
                        <option value="ADVANCED">ADVANCED</option>
                      </select>
                    </td>
                    <td>{market.usersCount}</td>
                    <td>{market.isActive ? 'Ativo' : 'Bloqueado'}</td>
                    <td>
                      <Button variant="secondary" onClick={() => toggleMarketStatus(market)}>
                        {market.isActive ? 'Bloquear' : 'Liberar'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </SuperAdminLayout>
  );
};

export default SuperAdminUsers;
