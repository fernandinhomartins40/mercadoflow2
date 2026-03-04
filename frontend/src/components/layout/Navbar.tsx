import React from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const TITLES: Record<string, { title: string; subtitle: string }> = {
  '/app': { title: 'Cockpit', subtitle: 'Visao executiva do mercado' },
  '/app/produtos': { title: 'Produtos', subtitle: 'Giro, tendencia e elasticidade' },
  '/app/cesta': { title: 'Compra casada', subtitle: 'Produtos que se reforcam nas vendas' },
  '/app/previsao-demanda': { title: 'Previsao', subtitle: 'Demanda futura por produto' },
  '/app/campanhas': { title: 'Campanhas', subtitle: 'Impacto antes, durante e depois' },
  '/app/alertas': { title: 'Alertas', subtitle: 'Sinais acionaveis do mercado' },
  '/app/pdvs': { title: 'PDVs', subtitle: 'Origem operacional das vendas' },
  '/app/configuracoes': { title: 'Configuracoes', subtitle: 'Acesso e integracoes' },
  '/app/download-agente': { title: 'Agente', subtitle: 'Distribuicao do coletor desktop' },
};

const Navbar: React.FC = () => {
  const { logout, role, name } = useAuth();
  const location = useLocation();
  const header = TITLES[location.pathname] || TITLES['/app'];

  return (
    <div className="header">
      <div>
        <h2 style={{ margin: 0 }}>{header.title}</h2>
        <span style={{ color: 'var(--muted)' }}>
          {header.subtitle} | {name || 'Usuario'} | Perfil: {role || 'Nao informado'}
        </span>
      </div>
      <button className="button secondary" onClick={logout}>Sair</button>
    </div>
  );
};

export default Navbar;
