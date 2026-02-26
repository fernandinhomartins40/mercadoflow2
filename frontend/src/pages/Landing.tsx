import React from 'react';
import { Link } from 'react-router-dom';

const insights = [
  {
    title: 'Controle total das vendas',
    text: 'Veja em tempo real quanto cada loja está vendendo, quais produtos estão saindo mais e em quais horários.',
  },
  {
    title: 'Identifique oportunidades',
    text: 'Descubra quais produtos seus clientes compram juntos e crie promoções que realmente vendem.',
  },
  {
    title: 'Evite perdas',
    text: 'Receba alertas quando produtos estão acabando ou parados no estoque há muito tempo.',
  },
];

const pillars = [
  {
    label: 'Instalação Simples',
    text: 'Um programa leve que roda no seu computador e coleta automaticamente as notas fiscais dos seus caixas.',
  },
  {
    label: 'Análise Automática',
    text: 'Nosso sistema processa todas as vendas e transforma em informações úteis para você tomar decisões.',
  },
  {
    label: 'Painel Fácil de Usar',
    text: 'Veja gráficos e relatórios simples com tudo que importa: vendas, produtos mais vendidos e alertas importantes.',
  },
];

const steps = [
  {
    title: '1. Baixe e instale',
    text: 'Baixe nosso programa e instale em um computador da sua rede. É rápido e não precisa de conhecimento técnico.',
  },
  {
    title: '2. Deixe funcionar',
    text: 'O sistema coleta automaticamente as vendas de todos os seus caixas e envia para a nuvem de forma segura.',
  },
  {
    title: '3. Veja os resultados',
    text: 'Acesse de qualquer lugar e veja suas vendas, produtos que mais vendem, e receba alertas para melhorar seus resultados.',
  },
];

const Landing: React.FC = () => {
  return (
    <div className="landing">
      <header className="landing-header reveal">
        <div className="landing-header-inner">
          <div className="brand">
            <span className="brand-mark">MF</span>
            <div>
              <p className="brand-name">MercadoFlow</p>
              <p className="brand-subtitle">Inteligência de vendas para supermercados</p>
            </div>
          </div>
          <nav className="landing-nav">
            <a href="#funcionalidades">Funcionalidades</a>
            <a href="#fluxo">Fluxo</a>
            <a href="#seguranca">Segurança</a>
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
            <strong>MercadoFlow Agent disponível para download</strong>
            <p>Instalador público para Windows com fila offline e envio seguro.</p>
          </div>
          <div className="landing-banner-actions">
            <Link className="button" to="/download-agente">
              Baixar agora
            </Link>
          </div>
        </div>
      </section>

      <section className="hero reveal stagger-1">
        <div className="hero-text">
          <span className="eyebrow">Tecnologia simples para seu supermercado</span>
          <h1>
            Descubra o que seus clientes realmente compram e{' '}
            <span className="accent-text">venda mais</span>.
          </h1>
          <p>
            MercadoFlow mostra em tempo real quais produtos estão vendendo, quais estão parados, e o que seus
            clientes costumam comprar junto. Simples assim. Sem complicação.
          </p>
          <div className="hero-actions">
            <Link className="button" to="/login">
              Acessar plataforma
            </Link>
            <Link className="button secondary" to="/download-agente">
              Baixar agente
            </Link>
            <a className="button secondary" href="#funcionalidades">
              Ver funcionalidades
            </a>
          </div>
          <div className="hero-stats">
            <div className="stat-chip">
              <span>1000+</span>
              <small>XMLs processados por hora</small>
            </div>
            <div className="stat-chip">
              <span>99.9%</span>
              <small>Uptime garantido</small>
            </div>
            <div className="stat-chip">
              <span>100%</span>
              <small>Conforme LGPD</small>
            </div>
          </div>
        </div>
        <div className="hero-board">
          <div className="hero-card">
            <p className="hero-card-title">Radar de performance</p>
            <div className="hero-metric">
              <h3>R$ 2,45M</h3>
              <span>Receita dos últimos 30 dias</span>
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
        </div>
      </section>

      <section className="section reveal stagger-2" id="funcionalidades">
        <h2>Tudo que você precisa em um só lugar</h2>
        <p className="section-subtitle">
          Ferramentas simples e poderosas para você entender suas vendas e tomar melhores decisões no seu dia a dia.
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

      <section className="section flow reveal stagger-3" id="fluxo">
        <h2>Fluxo operacional simples</h2>
        <p className="section-subtitle">Equipe técnica instala uma vez. O restante é automático.</p>
        <div className="flow-content">
          <div className="steps">
            {steps.map((step) => (
              <div key={step.title} className="step-card">
                <h4>{step.title}</h4>
                <p>{step.text}</p>
              </div>
            ))}
          </div>
          <div className="flow-panel">
            <div className="flow-row">
              <span>PDVs conectados</span>
              <strong>48 ativos</strong>
            </div>
            <div className="flow-row">
              <span>Latência média</span>
              <strong>1.2s</strong>
            </div>
            <div className="flow-row">
              <span>Alertas abertos</span>
              <strong>7 críticos</strong>
            </div>
            <div className="flow-row">
              <span>Campanhas sugeridas</span>
              <strong>18 oportunidades</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="section security reveal" id="seguranca">
        <h2>Seus dados protegidos e sempre disponíveis</h2>
        <div className="security-grid">
          <div className="security-card">
            <h3>Segurança total</h3>
            <p>Todas as informações são criptografadas e transmitidas com segurança. Seus dados ficam protegidos.</p>
          </div>
          <div className="security-card">
            <h3>Conforme a lei (LGPD)</h3>
            <p>Seguimos todas as regras de proteção de dados. Você pode usar tranquilo, tudo dentro da lei.</p>
          </div>
          <div className="security-card">
            <h3>Funciona sempre</h3>
            <p>Mesmo se a internet cair, o sistema continua coletando. Quando voltar, envia tudo automaticamente.</p>
          </div>
        </div>
      </section>

      <section className="cta reveal">
        <div className="cta-inner">
          <h2>Pronto para elevar as vendas do seu supermercado?</h2>
          <p>
            Ative o MercadoFlow e tenha uma visão única das suas operações, campanhas e oportunidades em minutos.
          </p>
          <div className="cta-actions">
            <Link className="button" to="/login">
              Entrar agora
            </Link>
            <a className="button secondary" href="mailto:contato@mercadoflow.com">
              Falar com especialista
            </a>
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <span>MercadoFlow - Inteligência de Vendas</span>
        <span>contato@mercadoflow.com</span>
      </footer>
    </div>
  );
};

export default Landing;
