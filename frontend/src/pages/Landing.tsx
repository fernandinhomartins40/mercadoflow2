import React from 'react';
import { Link } from 'react-router-dom';

const insights = [
  {
    title: 'Vendas em tempo real',
    text: 'Centralize NFC-e e NF-e de todos os PDVs e acompanhe performance por loja, categoria e hora.',
  },
  {
    title: 'Cesta de compras',
    text: 'Descubra combinações frequentes de produtos e crie campanhas com maior conversão.',
  },
  {
    title: 'Alertas inteligentes',
    text: 'Receba sinais de ruptura, giro lento, oportunidades de promoção e sazonalidade.',
  },
];

const pillars = [
  {
    label: 'Coletor PDV2Cloud',
    text: 'Agente Windows que monitora pastas, valida XML, deduplica e envia com fila offline.',
  },
  {
    label: 'API + Analytics',
    text: 'Pipeline com ingestão segura, normalização e jobs de agregação diária.',
  },
  {
    label: 'Painel MercadoFlow',
    text: 'Dashboards, alertas, produtos top e visão executiva em um só lugar.',
  },
];

const steps = [
  {
    title: '1. Instale o coletor',
    text: 'Configure pastas e credenciais. O serviço roda em background com logs e healthcheck.',
  },
  {
    title: '2. Envie e valide',
    text: 'XMLs chegam assinados, com HMAC e TLS. Duplicatas são descartadas.',
  },
  {
    title: '3. Analise e aja',
    text: 'Dashboards mostram tendências, alertas e oportunidades de margem.',
  },
];

const Landing: React.FC = () => {
  return (
    <div className="landing">
      <header className="landing-header">
        <div className="brand">
          <span className="brand-mark">MF</span>
          <div>
            <p className="brand-name">MercadoFlow</p>
            <p className="brand-subtitle">Inteligencia de vendas para supermercados</p>
          </div>
        </div>
        <nav className="landing-nav">
          <a href="#funcionalidades">Funcionalidades</a>
          <a href="#fluxo">Fluxo</a>
          <a href="#seguranca">Seguranca</a>
          <Link className="button secondary" to="/login">
            Entrar
          </Link>
        </nav>
      </header>

      <section className="hero">
        <div className="hero-text">
          <span className="eyebrow">Do PDV direto para a nuvem</span>
          <h1>
            Pare de vender no escuro. Transforme cada cupom em{' '}
            <span className="accent-text">insight acionavel</span>.
          </h1>
          <p>
            O MercadoFlow conecta o coletor de XMLs dos PDVs a um painel com
            analises de margem, giro e combinacoes de compra. Tudo em tempo real,
            seguro e sem friccao para sua equipe.
          </p>
          <div className="hero-actions">
            <Link className="button" to="/login">
              Acessar plataforma
            </Link>
            <a className="button secondary" href="#funcionalidades">
              Ver funcionalidades
            </a>
          </div>
          <div className="hero-stats">
            <div className="stat-chip">
              <span>+1000 XMLs/hora</span>
              <small>Processamento por PDV</small>
            </div>
            <div className="stat-chip">
              <span>Modo offline</span>
              <small>Fila local resiliente</small>
            </div>
            <div className="stat-chip">
              <span>LGPD ready</span>
              <small>Criptografia ponta a ponta</small>
            </div>
          </div>
        </div>
        <div className="hero-board">
          <div className="hero-card">
            <p className="hero-card-title">Radar de performance</p>
            <div className="hero-metric">
              <h3>R$ 2,45M</h3>
              <span>Receita ultimos 30 dias</span>
            </div>
            <div className="hero-metric">
              <h3>+12,4%</h3>
              <span>Crescimento semanal</span>
            </div>
            <div className="hero-list">
              {insights.map((insight) => (
                <div key={insight.title}>
                  <strong>{insight.title}</strong>
                  <p>{insight.text}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="hero-glow" />
        </div>
      </section>

      <section className="section" id="funcionalidades">
        <h2>Funcionalidades que trazem ROI claro</h2>
        <p className="section-subtitle">
          Do coletor de XMLs ao painel de inteligencia, cada modulo foi pensado
          para reduzir perdas e ampliar margem.
        </p>
        <div className="feature-grid">
          {pillars.map((pillar) => (
            <div className="feature-card" key={pillar.label}>
              <h3>{pillar.label}</h3>
              <p>{pillar.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section flow" id="fluxo">
        <div>
          <h2>Fluxo operacional simples</h2>
          <p className="section-subtitle">
            Equipe tecnica instala uma vez. O restante e automatico.
          </p>
          <div className="steps">
            {steps.map((step) => (
              <div key={step.title} className="step-card">
                <h4>{step.title}</h4>
                <p>{step.text}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="flow-panel">
          <div className="flow-row">
            <span>PDVs conectados</span>
            <strong>48 ativos</strong>
          </div>
          <div className="flow-row">
            <span>Latencia media</span>
            <strong>1.2s</strong>
          </div>
          <div className="flow-row">
            <span>Alertas abertos</span>
            <strong>7 criticos</strong>
          </div>
          <div className="flow-row">
            <span>Campanhas sugeridas</span>
            <strong>18 oportunidades</strong>
          </div>
        </div>
      </section>

      <section className="section security" id="seguranca">
        <h2>Seguranca e compliance na pratica</h2>
        <div className="security-grid">
          <div className="security-card">
            <h3>Criptografia + JWT</h3>
            <p>
              Tokens httpOnly, chaves HMAC e TLS 1.2+ garantem integridade
              ponta a ponta.
            </p>
          </div>
          <div className="security-card">
            <h3>LGPD e auditoria</h3>
            <p>
              Logs saneados, controle de acesso por perfil e trilhas de auditoria
              por mercado e usuario.
            </p>
          </div>
          <div className="security-card">
            <h3>Alta disponibilidade</h3>
            <p>
              Fila offline, reenvio automatico e monitoramento continuo do
              coletor.
            </p>
          </div>
        </div>
      </section>

      <section className="cta">
        <div>
          <h2>Pronto para elevar as vendas do seu supermercado?</h2>
          <p>
            Ative o MercadoFlow e tenha uma visao unica das suas operacoes,
            campanhas e oportunidades em minutos.
          </p>
        </div>
        <div className="cta-actions">
          <Link className="button" to="/login">
            Entrar agora
          </Link>
          <a className="button secondary" href="mailto:contato@mercadoflow.com">
            Falar com especialista
          </a>
        </div>
      </section>

      <footer className="landing-footer">
        <span>MercadoFlow · PDV2Cloud Suite</span>
        <span>contato@mercadoflow.com</span>
      </footer>
    </div>
  );
};

export default Landing;
