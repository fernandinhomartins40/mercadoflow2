import React from 'react';
import { Link } from 'react-router-dom';
import ButtonLink from '../components/common/ButtonLink';

const operationalHighlights = [
  {
    title: 'Painel geral da operacao',
    text: 'Receita, ticket medio, produtos ativos, sazonalidade e alertas em uma visao unica.',
  },
  {
    title: 'Inteligencia por produto',
    text: 'Historico de preco, eventos de variacao, janelas de promocao e desempenho por PDV.',
  },
  {
    title: 'Decisao comercial orientada por dados',
    text: 'Compra casada, impacto de campanha e previsao para reduzir erro de compra e promocao.',
  },
];

const modules = [
  {
    label: 'Painel geral',
    text: 'Leitura executiva da operacao com dados de vendas reais.',
  },
  {
    label: 'Mapa de produtos',
    text: 'Busca por nome ou codigo para abrir o dashboard do item.',
  },
  {
    label: 'Inteligencia de preco',
    text: 'Linha do tempo de valor e deteccao automatica de eventos e promocoes.',
  },
  {
    label: 'Compra casada',
    text: 'Pares com suporte, confianca e lift para orientar exposicao conjunta.',
  },
  {
    label: 'Campanhas',
    text: 'Comparacao antes, durante e depois para validar resultado real.',
  },
  {
    label: 'Configuracoes e agente',
    text: 'Gestao de chaves API, revogacao, heartbeat e download do coletor.',
  },
];

const steps = [
  {
    title: 'Instale o agente desktop',
    text: 'Configure a chave da API e as pastas de XML/NFCe no Windows.',
  },
  {
    title: 'Coleta e envio automaticos',
    text: 'O agente monitora as pastas, cria fila local e envia quando a conexao estiver disponivel.',
  },
  {
    title: 'Analise no painel web',
    text: 'Use dashboards de operacao e produto para orientar compra, promocao e mix.',
  },
];

const pricingSignals = [
  'Preco medio liquido por dia (sem perder historico)',
  'Primeira e ultima variacao de preco detectadas',
  'Maior alta e maior queda por periodo',
  'Janelas promocionais com confianca e lift estimado',
  'Eventos de variacao relevantes para decisao de compra',
];

const securityAndReliability = [
  {
    title: 'Fila offline no desktop',
    text: 'Se a internet oscilar, os XMLs ficam em fila local e sao enviados quando a conexao retorna.',
  },
  {
    title: 'Chave de API por agente',
    text: 'Controle granular: criar, revogar e acompanhar atividade por credencial.',
  },
  {
    title: 'Sincronizacao com API web',
    text: 'Desktop e web operam com a mesma base de dados, sem tela isolada com dados simulados.',
  },
];

const Landing: React.FC = () => {
  return (
    <div className="landing landing-v2">
      <header className="landing-header reveal">
        <div className="landing-header-inner">
          <div className="brand">
            <span className="brand-mark">MF</span>
            <div>
              <p className="brand-name">MercadoFlow</p>
              <p className="brand-subtitle">Inteligencia de vendas para supermercados e farmacias</p>
            </div>
          </div>
          <nav className="landing-nav">
            <a href="#recursos">Recursos</a>
            <a href="#preco">Inteligencia de preco</a>
            <a href="#fluxo">Fluxo</a>
            <a href="#seguranca">Confiabilidade</a>
            <Link to="/download-agente">Baixar agente</Link>
            <Link className="button secondary" to="/login">
              Entrar
            </Link>
          </nav>
        </div>
      </header>

      <section className="landing-banner reveal">
        <div className="landing-banner-inner">
          <div>
            <strong>Desktop e web sincronizados em uma unica operacao</strong>
            <p>Coleta NFCe no Windows, fila offline e analise completa no painel web.</p>
          </div>
          <div className="landing-banner-actions">
            <Link className="button" to="/download-agente">
              Baixar agora
            </Link>
          </div>
        </div>
      </section>

      <main className="landing-app page analytics-page">
        <section className="dashboard-command-grid reveal stagger-1">
          <article className="dashboard-command-card">
            <div className="dashboard-command-copy">
              <span className="pill">Plataforma de decisao comercial com dados reais</span>
              <h1 className="dashboard-command-title">Pare de decidir no feeling. Compre, promova e exponha com inteligencia.</h1>
              <p className="dashboard-command-text">
                O MercadoFlow une coleta automatica de notas no desktop com analise web de performance por produto, variacao de preco,
                compra casada, sazonalidade e impacto de campanha.
              </p>
              <div className="hero-chip-row">
                <span className="hero-chip">Sem mock: dados vindos de NFCe/XML</span>
                <span className="hero-chip">Dashboard por produto com visao por PDV</span>
                <span className="hero-chip">Sincronizacao desktop + API web</span>
              </div>
              <div className="hero-inline-actions">
                <ButtonLink to="/login">Acessar plataforma</ButtonLink>
                <ButtonLink variant="secondary" to="/download-agente">Baixar agente</ButtonLink>
              </div>
            </div>

            <div className="dashboard-command-showcase">
              <article className="dashboard-glow-card">
                <span className="section-kicker">Leitura central da operacao</span>
                <strong>Painel unico para dono, gestor e comprador</strong>
                <p>Produtos, preco, cesta, campanha, previsao, alerta, PDV e configuracoes trabalhando no mesmo fluxo.</p>
              </article>

              <div className="dashboard-command-mosaic">
                {operationalHighlights.map((item) => (
                  <article key={item.title} className="dashboard-mini-tile">
                    <span>{item.title}</span>
                    <strong>{item.text}</strong>
                  </article>
                ))}
              </div>
            </div>
          </article>

          <aside className="dashboard-priority-rail">
            <article className="dashboard-priority-card">
              <span className="section-kicker">Posicionamento</span>
              <h3>MercadoFlow entra no centro da operacao comercial.</h3>
              <p>Nao e relatorio estatico. E uma rotina de leitura para compra, promocao, reposicao e decisao por produto.</p>
            </article>
            <article className="dashboard-priority-card">
              <span className="section-kicker">Diferencial</span>
              <h3>Coleta real no desktop, analise forte no web.</h3>
              <p>O valor da plataforma esta em unir o que acontece na loja com uma leitura clara para usuario leigo e gestor.</p>
            </article>
          </aside>
        </section>

        <div className="metrics-grid analytics-metrics-grid landing-metrics dashboard-kpi-ribbon reveal">
          <div className="metric-card metric-card-default">
            <div className="metric-card-top"><span className="metric-card-title">Coleta</span><span className="metric-card-icon">NF</span></div>
            <strong className="metric-card-value">Automatica</strong>
            <div className="metric-card-bottom"><span className="metric-card-meta">monitoramento de pastas XML</span></div>
          </div>
          <div className="metric-card metric-card-default">
            <div className="metric-card-top"><span className="metric-card-title">Conexao</span><span className="metric-card-icon">Q</span></div>
            <strong className="metric-card-value">Fila offline</strong>
            <div className="metric-card-bottom"><span className="metric-card-meta">envio quando a internet voltar</span></div>
          </div>
          <div className="metric-card metric-card-warning">
            <div className="metric-card-top"><span className="metric-card-title">Produto</span><span className="metric-card-icon">SKU</span></div>
            <strong className="metric-card-value">Dashboard do item</strong>
            <div className="metric-card-bottom"><span className="metric-card-meta">giro, preco, sazonalidade e PDV</span></div>
          </div>
          <div className="metric-card metric-card-danger">
            <div className="metric-card-top"><span className="metric-card-title">Preco</span><span className="metric-card-icon">PX</span></div>
            <strong className="metric-card-value">Timeline real</strong>
            <div className="metric-card-bottom"><span className="metric-card-meta">eventos e promocoes detectadas</span></div>
          </div>
        </div>

        <section className="analytics-section reveal stagger-2" id="recursos">
          <div className="section-heading-row">
            <div>
              <span className="section-kicker">Recursos atuais da plataforma</span>
              <h2>Tudo integrado ao fluxo real de vendas</h2>
            </div>
          </div>
          <div className="analytics-card-grid three-cols">
            {modules.map((module) => (
              <article key={module.label} className="analytics-panel landing-module-card">
                <div className="analytics-panel-head compact">
                  <div>
                    <span className="section-kicker">Modulo</span>
                    <h3>{module.label}</h3>
                  </div>
                </div>
                <p className="panel-copy">{module.text}</p>
              </article>
            ))}
          </div>
        </section>

        <div className="dashboard-page-grid reveal" id="preco">
          <section className="analytics-panel dashboard-note-card">
            <span className="section-kicker">Inteligencia de preco</span>
            <h3>O que muda no valor de cada produto ao longo do tempo</h3>
            <p className="panel-copy">
              A plataforma preserva historico de preco por observacao e gera sinais para identificar
              variacoes relevantes, possiveis promocoes e mudancas estruturais no comportamento de venda.
            </p>
            <div className="landing-signal-list">
              {pricingSignals.map((signal) => (
                <div key={signal} className="landing-signal-item">
                  <span className="status-pill positive">Ativo</span>
                  <strong>{signal}</strong>
                </div>
              ))}
            </div>
          </section>

          <section className="analytics-panel dashboard-note-card" id="fluxo">
            <span className="section-kicker">Desdobramento no dia a dia</span>
            <h3>Como isso vira decisao de compra</h3>
            <div className="landing-step-stack">
              {steps.map((step, index) => (
                <article key={step.title} className="landing-step-card">
                  <div className="rank-pill">{index + 1}</div>
                  <div>
                    <strong>{step.title}</strong>
                    <p>{step.text}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>

        <section className="analytics-section reveal" id="seguranca">
          <div className="section-heading-row">
            <div>
              <span className="section-kicker">Confiabilidade operacional</span>
              <h2>Desktop e web trabalhando no mesmo fluxo</h2>
            </div>
          </div>
          <div className="analytics-card-grid three-cols">
            {securityAndReliability.map((item) => (
              <article key={item.title} className="analytics-panel landing-module-card">
                <div className="analytics-panel-head compact">
                  <div>
                    <span className="section-kicker">Operacao</span>
                    <h3>{item.title}</h3>
                  </div>
                </div>
                <p className="panel-copy">{item.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="analytics-footer-callout reveal landing-cta">
          <strong>Objetivo do MercadoFlow:</strong> transformar nota fiscal em decisao comercial pratica.
          Consulte produto, valide promocao, compare filiais e ajuste compra com base no que realmente vende.
          <div className="hero-inline-actions">
            <ButtonLink to="/login">Entrar agora</ButtonLink>
            <ButtonLink variant="secondary" to="/download-agente">Baixar agente desktop</ButtonLink>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <span>MercadoFlow - Inteligencia de Vendas</span>
        <span>contato@mercadoflow.com</span>
        <Link className="button secondary" to="/super-admin/login">
          Acessar Super Admin
        </Link>
      </footer>
    </div>
  );
};

export default Landing;

