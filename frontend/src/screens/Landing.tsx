import React from 'react';
import { Link } from 'react-router-dom';
import ButtonLink from '../components/common/ButtonLink';

const operationalHighlights = [
  {
    title: 'Painel geral da operação',
    text: 'Receita, ticket médio, produtos ativos, sazonalidade e alertas em uma visão única.',
  },
  {
    title: 'Inteligência por produto',
    text: 'Histórico de preço, eventos de variação, janelas de promoção e desempenho por PDV.',
  },
  {
    title: 'Decisão comercial orientada por dados',
    text: 'Compra casada, impacto de campanha e previsão para reduzir erro de compra e promoção.',
  },
];

const modules = [
  {
    label: 'Painel geral',
    text: 'Leitura executiva da operação com dados de vendas reais.',
  },
  {
    label: 'Mapa de produtos',
    text: 'Busca por nome ou código para abrir o dashboard do item.',
  },
  {
    label: 'Inteligência de preço',
    text: 'Linha do tempo de valor e detecção automática de eventos e promoções.',
  },
  {
    label: 'Compra casada',
    text: 'Pares com suporte, confiança e lift para orientar exposição conjunta.',
  },
  {
    label: 'Campanhas',
    text: 'Comparação antes, durante e depois para validar resultado real.',
  },
  {
    label: 'Configurações e agente',
    text: 'Gestão de chaves API, revogação, heartbeat e download do coletor.',
  },
];

const steps = [
  {
    title: 'Instale o agente desktop',
    text: 'Configure a chave da API e as pastas de XML/NFCe no Windows.',
  },
  {
    title: 'Coleta e envio automáticos',
    text: 'O agente monitora as pastas, cria fila local e envia quando a conexão estiver disponível.',
  },
  {
    title: 'Análise no painel web',
    text: 'Use dashboards de operação e produto para orientar compra, promoção e mix.',
  },
];

const pricingSignals = [
  'Preço médio líquido por dia (sem perder histórico)',
  'Primeira e última variação de preço detectadas',
  'Maior alta e maior queda por período',
  'Janelas promocionais com confiança e lift estimado',
  'Eventos de variação relevantes para decisão de compra',
];

const securityAndReliability = [
  {
    title: 'Fila offline no desktop',
    text: 'Se a internet oscilar, os XMLs ficam em fila local e são enviados quando a conexão retorna.',
  },
  {
    title: 'Chave de API por agente',
    text: 'Controle granular: criar, revogar e acompanhar atividade por credencial.',
  },
  {
    title: 'Sincronização com API web',
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
              <p className="brand-subtitle">Inteligência de vendas para supermercados e farmácias</p>
            </div>
          </div>
          <nav className="landing-nav">
            <a href="#recursos">Recursos</a>
            <a href="#preco">Inteligência de preço</a>
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
            <strong>Desktop e web sincronizados em uma única operação</strong>
            <p>Coleta NFCe no Windows, fila offline e análise completa no painel web.</p>
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
              <span className="pill">Plataforma de decisão comercial com dados reais</span>
              <h1 className="dashboard-command-title">Pare de decidir no feeling. Compre, promova e exponha com inteligência.</h1>
              <p className="dashboard-command-text">
                O MercadoFlow une coleta automática de notas no desktop com análise web de performance por produto, variação de preço,
                compra casada, sazonalidade e impacto de campanha.
              </p>
              <div className="hero-chip-row">
                <span className="hero-chip">Sem mock: dados vindos de NFCe/XML</span>
                <span className="hero-chip">Dashboard por produto com visão por PDV</span>
                <span className="hero-chip">Sincronização desktop + API web</span>
              </div>
              <div className="hero-inline-actions">
                <ButtonLink to="/login">Acessar plataforma</ButtonLink>
                <ButtonLink variant="secondary" to="/download-agente">Baixar agente</ButtonLink>
              </div>
            </div>

            <div className="dashboard-command-showcase">
              <article className="dashboard-glow-card">
                <span className="section-kicker">Leitura central da operação</span>
                <strong>Painel único para dono, gestor e comprador</strong>
                <p>Produtos, preço, cesta, campanha, previsão, alerta, PDV e configurações trabalhando no mesmo fluxo.</p>
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
              <h3>MercadoFlow entra no centro da operação comercial.</h3>
              <p>Não é relatório estático. É uma rotina de leitura para compra, promoção, reposição e decisão por produto.</p>
            </article>
            <article className="dashboard-priority-card">
              <span className="section-kicker">Diferencial</span>
              <h3>Coleta real no desktop, análise forte no web.</h3>
              <p>O valor da plataforma está em unir o que acontece na loja com uma leitura clara para usuário leigo e gestor.</p>
            </article>
          </aside>
        </section>

        <div className="metrics-grid analytics-metrics-grid landing-metrics dashboard-kpi-ribbon reveal">
          <div className="metric-card metric-card-default">
            <div className="metric-card-top"><span className="metric-card-title">Coleta</span><span className="metric-card-icon">NF</span></div>
            <strong className="metric-card-value">Automática</strong>
            <div className="metric-card-bottom"><span className="metric-card-meta">monitoramento de pastas XML</span></div>
          </div>
          <div className="metric-card metric-card-default">
            <div className="metric-card-top"><span className="metric-card-title">Conexão</span><span className="metric-card-icon">Q</span></div>
            <strong className="metric-card-value">Fila offline</strong>
            <div className="metric-card-bottom"><span className="metric-card-meta">envio quando a internet voltar</span></div>
          </div>
          <div className="metric-card metric-card-warning">
            <div className="metric-card-top"><span className="metric-card-title">Produto</span><span className="metric-card-icon">SKU</span></div>
            <strong className="metric-card-value">Dashboard do item</strong>
            <div className="metric-card-bottom"><span className="metric-card-meta">giro, preço, sazonalidade e PDV</span></div>
          </div>
          <div className="metric-card metric-card-danger">
            <div className="metric-card-top"><span className="metric-card-title">Preço</span><span className="metric-card-icon">PX</span></div>
            <strong className="metric-card-value">Timeline real</strong>
            <div className="metric-card-bottom"><span className="metric-card-meta">eventos e promoções detectadas</span></div>
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
                    <span className="section-kicker">Módulo</span>
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
            <span className="section-kicker">Inteligência de preço</span>
            <h3>O que muda no valor de cada produto ao longo do tempo</h3>
            <p className="panel-copy">
              A plataforma preserva histórico de preço por observação e gera sinais para identificar
              variações relevantes, possíveis promoções e mudanças estruturais no comportamento de venda.
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
            <h3>Como isso vira decisão de compra</h3>
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
                    <span className="section-kicker">Operação</span>
                    <h3>{item.title}</h3>
                  </div>
                </div>
                <p className="panel-copy">{item.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="analytics-footer-callout reveal landing-cta">
          <strong>Objetivo do MercadoFlow:</strong> transformar nota fiscal em decisão comercial prática.
          Consulte produto, valide promoção, compare filiais e ajuste compra com base no que realmente vende.
          <div className="hero-inline-actions">
            <ButtonLink to="/login">Entrar agora</ButtonLink>
            <ButtonLink variant="secondary" to="/download-agente">Baixar agente desktop</ButtonLink>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <span>MercadoFlow - Inteligência de Vendas</span>
        <span>contato@mercadoflow.com</span>
        <Link className="button secondary" to="/super-admin/login">
          Acessar Super Admin
        </Link>
      </footer>
    </div>
  );
};

export default Landing;
