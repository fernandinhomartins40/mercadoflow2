import React from 'react';
import LegalPage, { CONTROLLER, CONTROLLER_CNPJ, DPO_NAME, LegalSection, Mail } from './LegalPage';

/**
 * Política de privacidade do painel MercadoFlow e do agente do PDV.
 * O Bipaê tem página própria em /bipae/privacidade.html; os prazos são os mesmos.
 */

const ul: React.CSSProperties = { margin: '6px 0', paddingLeft: 20 };
const note: React.CSSProperties = { color: '#4f6159', fontSize: 15 };

const Privacidade: React.FC = () => (
  <LegalPage
    title="Política de privacidade"
    intro="Vale para o painel MercadoFlow (mercadoflow.com), para o agente instalado no computador do caixa e para os avisos por WhatsApp."
  >
    <LegalSection title="Quem cuida dos dados">
      <p>O MercadoFlow é um serviço da <strong>{CONTROLLER}</strong>, CNPJ {CONTROLLER_CNPJ}, de Guarapuava/PR.</p>
      <p>Encarregado de dados (LGPD): <strong>{DPO_NAME}</strong>, pelo e-mail <Mail />.</p>
    </LegalSection>

    <LegalSection title="Dois papéis diferentes">
      <p>Na LGPD, quem decide o que fazer com um dado é o <strong>controlador</strong>. Quem trata o dado a mando de outro é o <strong>operador</strong>. No MercadoFlow existem os dois casos:</p>
      <ul style={ul}>
        <li><strong>Dados da conta da loja</strong> (nome e e-mail de quem usa o painel, cobrança, registros de segurança): a {CONTROLLER} é a controladora.</li>
        <li><strong>Dados dos clientes do mercado</strong> (por exemplo, o CPF que o consumidor informa na nota do caixa): o <strong>mercado é o controlador</strong>. A {CONTROLLER} é a <strong>operadora</strong>: trata esses dados só para prestar o serviço contratado pelo mercado e não os usa para fins próprios.</li>
      </ul>
      <p>Por isso, quem informa o consumidor e responde aos pedidos dele é o mercado. Se um consumidor nos procurar, encaminhamos o pedido ao mercado e ajudamos a atendê-lo.</p>
    </LegalSection>

    <LegalSection title="Quais dados tratamos">
      <ul style={ul}>
        <li><strong>Conta:</strong> nome, e-mail, senha (guardada com criptografia de mão única), papel na equipe e último acesso. Se a pessoa ligar a verificação em duas etapas, guardamos o segredo dela cifrado.</li>
        <li><strong>Dados do mercado:</strong> nome, CNPJ, endereço e contatos comerciais.</li>
        <li><strong>Vendas do caixa:</strong> as notas fiscais de venda (NFC-e) enviadas pelo agente, com produtos, quantidades, preços, impostos e, quando o consumidor pede CPF na nota, o <strong>CPF ou CNPJ do consumidor</strong>.</li>
        <li><strong>Notas de entrada:</strong> o XML das notas de compra, com fornecedor, produtos e preços (veja também a política do Bipaê).</li>
        <li><strong>Inteligência artificial:</strong> as perguntas feitas ao assistente e, se a pessoa usar a voz, o áudio. Não guardamos o texto da pergunta nem o áudio; guardamos só um registro de uso (quantidade, custo e erros).</li>
        <li><strong>WhatsApp:</strong> o número cadastrado para receber avisos e o registro das mensagens enviadas.</li>
        <li><strong>Pagamentos:</strong> plano, valores, datas e situação das cobranças. Não guardamos o número do cartão.</li>
        <li><strong>Registros de segurança:</strong> quem fez cada ação importante, quando, o endereço IP e o navegador usado.</li>
      </ul>
    </LegalSection>

    <LegalSection title="O agente do computador do caixa">
      <p>O agente é um programa que o mercado instala no computador do caixa (Windows). Ele serve para levar as vendas ao painel sem digitação.</p>
      <p><strong>O que ele lê:</strong> só os arquivos XML das notas fiscais de venda, nas pastas ou no banco de dados do sistema de caixa indicados na instalação. Esses XML trazem o CPF ou CNPJ do consumidor quando ele pede CPF na nota. O agente não lê outros arquivos do computador.</p>
      <p><strong>O que ele envia:</strong> de cada nota, a chave, número, série, data, valor, CNPJ e endereço do emitente (o próprio mercado), o CPF ou CNPJ do consumidor (quando houver) e os itens (código de barras, código interno, descrição, NCM, CFOP, quantidade, valores e impostos). O envio é feito por conexão criptografada (HTTPS) e assinado com a chave do agente.</p>
      <p><strong>Onde ele guarda:</strong> numa fila local no próprio computador (pasta <code>C:\ProgramData\PDV2Cloud</code>), para não perder vendas quando a internet cai. As notas já enviadas saem da fila em 30 dias. A chave de acesso do agente fica cifrada pelo Windows. Os registros técnicos do agente não guardam CPF.</p>
      <p><strong>Atualização:</strong> o agente baixa as novas versões do MercadoFlow e confere a integridade do arquivo antes de instalar.</p>
      <p style={note}>O mercado é responsável por manter o computador do caixa protegido (senha do Windows, antivírus, acesso só de pessoas autorizadas), porque a fila local fica nele.</p>
    </LegalSection>

    <LegalSection title="Para que usamos">
      <ul style={ul}>
        <li>Mostrar ao mercado as vendas, margens, estoque, compras e sugestões do painel.</li>
        <li>Calcular indicadores de recompra e frequência dos clientes da loja. Para isso o CPF é transformado num código que não permite voltar ao número, e os resultados só aparecem em grupos de pelo menos 5 clientes.</li>
        <li>Gerar respostas e sugestões com inteligência artificial a partir dos números da loja.</li>
        <li>Enviar avisos por WhatsApp e e-mails da conta (convite, troca de senha).</li>
        <li>Cobrar o plano e os créditos contratados.</li>
        <li>Proteger a conta, investigar uso indevido e cumprir obrigações legais.</li>
        <li>Estudos de mercado de forma agregada, sem identificar a loja nem pessoas.</li>
      </ul>
      <p>Não vendemos dados pessoais e não mostramos anúncios.</p>
    </LegalSection>

    <LegalSection title="Com quem compartilhamos">
      <ul style={ul}>
        <li><strong>Hostinger:</strong> servidor onde o MercadoFlow roda, no Brasil.</li>
        <li><strong>Asaas e Stripe:</strong> cobrança. Recebem nome, CPF ou CNPJ e e-mail de quem paga.</li>
        <li><strong>Resend:</strong> envio dos e-mails da conta.</li>
        <li><strong>Meta (WhatsApp):</strong> envio dos avisos para o número cadastrado. Para parar, responda "PARAR".</li>
        <li><strong>Inteligência artificial:</strong> usamos só provedores em planos pagos, que não usam os dados para treinar os modelos deles. Eles recebem a pergunta e números da loja; não enviamos o CPF dos consumidores. A voz é transcrita pelo Deepgram. Esses provedores podem processar os dados fora do Brasil (por exemplo, nos Estados Unidos). Se o mercado cadastrar a própria chave de um provedor, vale o contrato do mercado com ele.</li>
        <li><strong>Sefaz e Meu Danfe:</strong> para buscar notas de entrada (veja a política do Bipaê).</li>
        <li><strong>Parceiros que a loja autorizar:</strong> por exemplo, o sistema de gestão (ERP) conectado em Integrações. Cada um recebe só o que a loja liberou e pode ser desligado a qualquer momento.</li>
        <li><strong>Fabricantes:</strong> recebem só números agregados de várias lojas. A loja só aparece pelo nome se ligar essa opção.</li>
        <li><strong>Autoridades:</strong> quando a lei ou uma ordem judicial exigir.</li>
      </ul>
    </LegalSection>

    <LegalSection title="Quem pode ver os dados da loja">
      <ul style={ul}>
        <li>a equipe do mercado, conforme o papel de cada pessoa na conta;</li>
        <li>a equipe de suporte e administração do MercadoFlow, quando precisa atender um pedido, corrigir um problema ou cuidar da segurança;</li>
        <li>parceiros autorizados pela loja;</li>
        <li>empresas contratadas para operar o serviço, como a Asaas e a Hostinger, só no que for necessário para o trabalho delas.</li>
      </ul>
      <p>A comunicação é criptografada (HTTPS), as senhas são guardadas com criptografia de mão única e chaves de integração e certificados ficam cifrados. Cada loja só enxerga os próprios dados no painel.</p>
    </LegalSection>

    <LegalSection title="Por quanto tempo guardamos">
      <ul style={ul}>
        <li><strong>Notas, vendas e estoque:</strong> enquanto a conta existir, porque formam o histórico da loja.</li>
        <li><strong>CPF do consumidor nas notas de venda:</strong> 5 anos. Depois disso, o CPF é mascarado.</li>
        <li><strong>Links de troca de senha e convites vencidos:</strong> apagados 90 dias depois de vencer.</li>
        <li><strong>Mensagens de WhatsApp e registros de uso da inteligência artificial:</strong> 2 anos.</li>
        <li><strong>Registros de segurança:</strong> 5 anos.</li>
        <li><strong>Fila do agente:</strong> notas enviadas saem do computador do caixa em 30 dias.</li>
      </ul>
    </LegalSection>

    <LegalSection id="exclusao" title="Seus direitos e como excluir a conta" highlight>
      <p>Pela LGPD, você pode pedir acesso, correção, cópia ou exclusão dos seus dados e revogar consentimentos. Escreva para <Mail subject="Pedido LGPD" />, a partir do e-mail cadastrado. Respondemos em até 15 dias.</p>
      <p><strong>Excluir a conta:</strong> use a opção "Excluir minha conta" no painel ou no Bipaê, ou peça por e-mail. A conta é bloqueada na hora e você tem 30 dias para desistir. Depois disso, os dados pessoais são apagados ou anonimizados. As notas fiscais continuam no histórico, sem os dados pessoais. Guardamos só o que a lei obriga (por exemplo, registros de pagamento).</p>
      <p><strong>Consumidor do mercado:</strong> se você comprou numa loja que usa o MercadoFlow e quer saber o que foi feito com o seu CPF, fale primeiro com o mercado. Também pode escrever para <Mail subject="Pedido de consumidor" /> e nós ajudamos o mercado a atender.</p>
      <p>Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).</p>
    </LegalSection>

    <LegalSection title="Mudanças nesta política">
      <p>Quando esta política mudar, a data no topo desta página será atualizada. Mudanças importantes serão avisadas no painel ou por e-mail.</p>
    </LegalSection>
  </LegalPage>
);

export default Privacidade;
