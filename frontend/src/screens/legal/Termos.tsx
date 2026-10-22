import React from 'react';
import { Link } from 'react-router-dom';
import LegalPage, { CONTROLLER, CONTROLLER_CNPJ, LegalSection, Mail } from './LegalPage';

/** Termos de uso do MercadoFlow (painel, agente do PDV e Bipaê). */

const ul: React.CSSProperties = { margin: '6px 0', paddingLeft: 20 };

const Termos: React.FC = () => (
  <LegalPage
    title="Termos de uso"
    intro="Regras para usar o MercadoFlow: o painel, o agente do computador do caixa e o app Bipaê."
  >
    <LegalSection title="Quem presta o serviço">
      <p>O MercadoFlow é prestado pela <strong>{CONTROLLER}</strong>, CNPJ {CONTROLLER_CNPJ}, de Guarapuava/PR. Dúvidas: <Mail />.</p>
      <p>Ao criar a conta, você confirma que leu e aceita estes termos e a <Link to="/privacidade" style={{ color: '#045e48' }}>política de privacidade</Link>, e que pode representar a empresa cadastrada.</p>
    </LegalSection>

    <LegalSection title="O que é o serviço">
      <p>O MercadoFlow é um sistema para supermercados e lojas: mostra vendas, margens, estoque e compras, faz sugestões (inclusive com inteligência artificial) e confere mercadoria pelo Bipaê. É um serviço para empresas, não para uso pessoal.</p>
      <p>As sugestões e respostas da inteligência artificial são apoio à decisão. Elas podem errar. Confira antes de mudar preços, fazer pedidos ou tomar outra decisão importante.</p>
    </LegalSection>

    <LegalSection title="Responsabilidades do mercado">
      <ul style={ul}>
        <li>Manter os dados de cadastro corretos e as senhas em segredo. Cada pessoa da equipe deve usar o próprio acesso.</li>
        <li>Dar acesso só a quem precisa e remover quem saiu da equipe.</li>
        <li>Instalar o agente apenas em computadores do próprio mercado e mantê-los protegidos (senha do Windows, antivírus, acesso restrito).</li>
        <li>Como controlador dos dados dos seus clientes (por exemplo, o CPF na nota), informar os consumidores e ter uma base legal para usar esses dados, e responder aos pedidos deles. O MercadoFlow trata esses dados como operador, só para prestar o serviço.</li>
        <li>Não usar o serviço para fins ilegais, nem tentar acessar dados de outras lojas, burlar limites do plano ou atrapalhar o funcionamento do sistema.</li>
      </ul>
    </LegalSection>

    <LegalSection title="Responsabilidades do MercadoFlow">
      <ul style={ul}>
        <li>Manter o serviço funcionando com cuidado e segurança, sabendo que podem ocorrer pausas para manutenção ou falhas fora do nosso controle (internet, Sefaz, provedores).</li>
        <li>Tratar os dados conforme a <Link to="/privacidade" style={{ color: '#045e48' }}>política de privacidade</Link> e avisar o mercado se houver incidente de segurança que afete os dados dele.</li>
        <li>Não usar os dados da loja para outra finalidade que não esteja na política.</li>
      </ul>
    </LegalSection>

    <LegalSection title="Planos, pagamentos e cancelamento">
      <ul style={ul}>
        <li>Os preços e limites de cada plano estão na página de planos. O plano grátis tem limites menores.</li>
        <li>Pagamentos são feitos pela Asaas ou pela Stripe. Sem pagamento, a conta pode ficar com acesso limitado depois do prazo de tolerância.</li>
        <li>Você pode cancelar quando quiser no painel. Conta cancelada deixa de receber os créditos mensais de IA do plano.</li>
        <li>Se um pagamento for estornado ou contestado, os créditos ainda não usados daquela compra são retirados.</li>
      </ul>
    </LegalSection>

    <LegalSection title="Exclusão da conta">
      <p>Você pode excluir a conta no painel, no Bipaê ou por e-mail. A conta é bloqueada na hora e há 30 dias para desistir. Depois, os dados pessoais são apagados ou anonimizados, como explica a política de privacidade.</p>
      <p>Podemos suspender uma conta que viole estes termos ou que fique sem pagamento, avisando antes sempre que possível.</p>
    </LegalSection>

    <LegalSection title="Propriedade">
      <p>Os dados da loja são da loja. O software, a marca e os conteúdos do MercadoFlow são da {CONTROLLER}. Você pode exportar os dados da loja nos planos que oferecem essa opção.</p>
    </LegalSection>

    <LegalSection title="Mudanças e foro">
      <p>Quando estes termos mudarem, a data no topo será atualizada e mudanças importantes serão avisadas no painel ou por e-mail. Vale a lei brasileira. Fica eleito o foro da comarca de Guarapuava/PR, salvo regra legal diferente.</p>
    </LegalSection>
  </LegalPage>
);

export default Termos;
