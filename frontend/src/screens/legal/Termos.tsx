import React from 'react';
import { Link } from 'react-router-dom';
import LegalPage, { CONTROLLER, CONTROLLER_CNPJ, LEGAL_VERSION, LegalSection, Mail } from './LegalPage';

/**
 * Termos de uso do MercadoFlow (painel, agente do PDV e Bipaê).
 * Revisão jurídica e fundamentos: docs/pie/juridico/PARECER_LGPD.md.
 */

const ul: React.CSSProperties = { margin: '6px 0', paddingLeft: 20 };
const linkStyle: React.CSSProperties = { color: '#045e48' };

const Termos: React.FC = () => (
  <LegalPage
    title="Termos de uso"
    intro="Regras para usar o MercadoFlow: o painel, o agente do computador do caixa e o app Bipaê."
  >
    <LegalSection title="Quem presta o serviço">
      <p>O MercadoFlow é prestado pela <strong>{CONTROLLER}</strong>, CNPJ {CONTROLLER_CNPJ}, com sede em Guarapuava/PR. Dúvidas: <Mail />.</p>
      <p>Ao criar a conta, você confirma que leu e aceita estes termos e a <Link to="/privacidade" style={linkStyle}>política de privacidade</Link>, e que tem poderes para representar a empresa cadastrada.</p>
      <p>O tratamento dos dados dos clientes do mercado (por exemplo, o CPF na nota) segue também o Acordo de Tratamento de Dados entre o mercado e a {CONTROLLER}, que faz parte destes termos. O texto vigente está em <Link to="/contrato-operador" style={linkStyle}>Contrato de tratamento de dados (operador)</Link>; dúvidas pelo e-mail <Mail subject="Acordo de Tratamento de Dados" />.</p>
    </LegalSection>

    <LegalSection title="O que é o serviço">
      <p>O MercadoFlow é um sistema para supermercados e lojas: mostra vendas, margens, estoque e compras, faz sugestões (inclusive com inteligência artificial) e confere mercadoria pelo Bipaê. É um serviço para empresas, não para uso pessoal, e não é destinado a menores de 18 anos.</p>
      <p>As sugestões e respostas da inteligência artificial são apoio à decisão. Elas podem errar. Confira antes de mudar preços, fazer pedidos ou tomar outra decisão importante. A decisão final é sempre do mercado, inclusive nos níveis de autonomia que o próprio mercado liga.</p>
    </LegalSection>

    <LegalSection title="Responsabilidades do mercado">
      <ul style={ul}>
        <li>Manter os dados de cadastro corretos e as senhas em segredo. Cada pessoa da equipe deve usar o próprio acesso.</li>
        <li>Dar acesso só a quem precisa e remover quem saiu da equipe.</li>
        <li>Instalar o agente apenas em computadores do próprio mercado e mantê-los protegidos (senha do Windows, antivírus, acesso restrito).</li>
        <li>Como controlador dos dados dos seus clientes (por exemplo, o CPF na nota), definir a base legal para usar esses dados, informar os consumidores (por exemplo, com um aviso no caixa e na sua política de privacidade) e responder aos pedidos deles. O MercadoFlow trata esses dados como operador, só para prestar o serviço, nos termos do Acordo de Tratamento de Dados.</li>
        <li>Não colocar nas perguntas à inteligência artificial dados pessoais de clientes ou funcionários que não sejam necessários.</li>
        <li>Não usar o serviço para fins ilegais, nem tentar acessar dados de outras lojas, burlar limites do plano ou atrapalhar o funcionamento do sistema.</li>
      </ul>
    </LegalSection>

    <LegalSection title="Responsabilidades do MercadoFlow">
      <ul style={ul}>
        <li>Manter o serviço funcionando com cuidado e segurança, sabendo que podem ocorrer pausas para manutenção ou falhas fora do nosso controle (internet, Sefaz, provedores).</li>
        <li>Tratar os dados conforme a <Link to="/privacidade" style={linkStyle}>política de privacidade</Link> e o Acordo de Tratamento de Dados, e seguir as instruções lícitas do mercado sobre os dados dos clientes dele.</li>
        <li>Avisar o mercado, sem demora e em até 48 horas depois de confirmar, sobre incidente de segurança que afete os dados dele, e ajudar na comunicação à ANPD e aos consumidores.</li>
        <li>Não usar os dados da loja para outra finalidade que não esteja na política.</li>
      </ul>
    </LegalSection>

    <LegalSection title="Planos, pagamentos e cancelamento">
      <ul style={ul}>
        <li>Os preços e limites de cada plano estão na página de planos. O plano grátis tem limites menores.</li>
        <li>Pagamentos são feitos pela Asaas. Sem pagamento, a conta pode ficar com acesso limitado depois do prazo de tolerância.</li>
        <li>Você pode cancelar quando quiser no painel, sem multa. Conta cancelada deixa de receber os créditos mensais de IA do plano.</li>
        <li>Se um pagamento for estornado ou contestado, os créditos ainda não usados daquela compra são retirados.</li>
        <li>Desistência em 7 dias (art. 49 do Código de Defesa do Consumidor): na primeira contratação de um plano pago pela internet, você pode desistir em até 7 dias corridos do primeiro pagamento confirmado e receber de volta o valor pago, inteiro. Use o botão "Desistir da contratação (7 dias)" em Minha assinatura ou escreva para <Mail subject="Desistência em 7 dias" />. A conta volta na hora ao plano grátis, sem perder os dados. Renovações mensais não entram nessa regra; para elas, vale o cancelamento normal.</li>
      </ul>
    </LegalSection>

    <LegalSection title="Exclusão e suspensão da conta">
      <p>Você pode excluir a conta no painel, no Bipaê ou por e-mail. A conta é bloqueada na hora e há 30 dias para desistir. Depois, os dados pessoais são apagados ou anonimizados, como explica a política de privacidade. Antes de excluir, use a exportação dos dados da loja nos planos que oferecem essa opção, ou peça uma cópia por e-mail.</p>
      <p>Podemos suspender uma conta que viole estes termos, que coloque em risco a segurança do sistema ou de outras lojas, ou que fique sem pagamento. Avisamos antes, com o motivo, sempre que possível; quando a suspensão for urgente por segurança, avisamos logo depois.</p>
    </LegalSection>

    <LegalSection title="Propriedade">
      <p>Os dados da loja são da loja. O software, a marca e os conteúdos do MercadoFlow são da {CONTROLLER}. Você pode exportar os dados da loja nos planos que oferecem essa opção.</p>
    </LegalSection>

    <LegalSection title="Limite de responsabilidade">
      <p>Entre empresas, a responsabilidade da {CONTROLLER} por danos ligados ao serviço fica limitada ao valor que o mercado pagou nos 12 meses anteriores ao fato, e não inclui lucros cessantes, perda de vendas ou danos indiretos. Também não respondemos por falhas causadas por caso fortuito ou força maior (art. 393 do Código Civil), por sistemas de terceiros fora do nosso controle (internet, Sefaz, sistema de caixa) ou por decisões do mercado tomadas a partir das sugestões do serviço.</p>
      <p>Esse limite não vale para danos causados com dolo ou culpa grave, nem afasta a responsabilidade prevista em lei perante os titulares de dados (arts. 42 a 45 da LGPD) ou perante consumidores. Se o mercado for considerado consumidor, o limite só se aplica na medida permitida pelo art. 51, I, do Código de Defesa do Consumidor.</p>
    </LegalSection>

    <LegalSection title="Mudanças nos termos">
      <p>Esta é a versão {LEGAL_VERSION}. Quando estes termos mudarem, a data e a versão no topo serão atualizadas. Mudanças importantes serão avisadas no painel ou por e-mail com pelo menos 15 dias de antecedência, salvo quando forem exigidas por lei ou necessárias para corrigir um problema de segurança. Se você não concordar, pode cancelar antes da data de início, sem multa.</p>
    </LegalSection>

    <LegalSection title="Lei e foro">
      <p>Vale a lei brasileira. Nas relações entre empresas, fica eleito o foro da comarca de Guarapuava/PR, sede da {CONTROLLER} (art. 63 do Código de Processo Civil). Se a relação for de consumo, você pode entrar com a ação no foro do seu domicílio (art. 101, I, do Código de Defesa do Consumidor).</p>
      <p>Antes de ir à Justiça, procure-nos pelo e-mail <Mail />: a maioria dos problemas se resolve por lá.</p>
    </LegalSection>
  </LegalPage>
);

export default Termos;
