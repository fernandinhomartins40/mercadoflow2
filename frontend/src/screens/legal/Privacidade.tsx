import React from 'react';
import { Link } from 'react-router-dom';
import LegalPage, { CONTROLLER, CONTROLLER_CNPJ, DPO_NAME, LEGAL_VERSION, LegalSection, Mail } from './LegalPage';

/**
 * Política de privacidade do painel MercadoFlow e do agente do PDV.
 * O Bipaê tem página própria em /bipae/privacidade.html; os prazos são os mesmos.
 * Revisão jurídica e fundamentos: docs/pie/juridico/PARECER_LGPD.md.
 */

const ul: React.CSSProperties = { margin: '6px 0', paddingLeft: 20 };
const note: React.CSSProperties = { color: '#4f6159', fontSize: 15 };

const Privacidade: React.FC = () => (
  <LegalPage
    title="Política de privacidade"
    intro="Vale para o painel MercadoFlow (mercadoflow.com), para o agente instalado no computador do caixa, para o app Bipaê e para os avisos por WhatsApp."
  >
    <LegalSection title="Quem cuida dos dados">
      <p>O MercadoFlow é um serviço da <strong>{CONTROLLER}</strong>, CNPJ {CONTROLLER_CNPJ}, com sede em Guarapuava/PR.</p>
      <p>Encarregado pelo tratamento de dados pessoais (art. 41 da LGPD): <strong>{DPO_NAME}</strong>, pelo e-mail <Mail />. É por esse canal que titulares de dados e a Agência Nacional de Proteção de Dados (ANPD) falam conosco.</p>
    </LegalSection>

    <LegalSection title="Dois papéis diferentes">
      <p>Na Lei Geral de Proteção de Dados (Lei nº 13.709/2018, a LGPD), quem decide o que fazer com um dado é o <strong>controlador</strong>. Quem trata o dado em nome de outro, seguindo as instruções dele, é o <strong>operador</strong> (art. 5º, VI e VII). No MercadoFlow existem os dois casos:</p>
      <ul style={ul}>
        <li><strong>Dados das pessoas que usam o serviço</strong> (nome e e-mail de quem usa o painel ou o Bipaê, cobrança, registros de segurança, número de WhatsApp): a {CONTROLLER} é a <strong>controladora</strong>.</li>
        <li><strong>Dados dos clientes do mercado</strong> (por exemplo, o CPF que o consumidor informa na nota do caixa) e dados de terceiros que aparecem nas notas fiscais: o <strong>mercado é o controlador</strong>. A {CONTROLLER} é a <strong>operadora</strong>: trata esses dados só para prestar o serviço contratado pelo mercado, conforme as instruções dele e o Acordo de Tratamento de Dados, e não os usa para fins próprios.</li>
      </ul>
      <p>Por isso, quem informa o consumidor, escolhe a base legal para o uso do CPF e responde aos pedidos dele é o mercado. Se um consumidor nos procurar, encaminhamos o pedido ao mercado e ajudamos a atendê-lo (art. 39 da LGPD).</p>
    </LegalSection>

    <LegalSection title="Quais dados tratamos">
      <ul style={ul}>
        <li><strong>Conta:</strong> nome, e-mail, senha (guardada com criptografia de mão única), papel na equipe e último acesso. Se a pessoa ligar a verificação em duas etapas, guardamos o segredo dela cifrado.</li>
        <li><strong>Dados do mercado:</strong> nome, CNPJ, endereço e contatos comerciais (que podem incluir nome, e-mail e telefone de uma pessoa).</li>
        <li><strong>Vendas do caixa:</strong> as notas fiscais de venda (NFC-e) enviadas pelo agente, com produtos, quantidades, preços, impostos e, quando o consumidor pede CPF na nota, o <strong>CPF ou CNPJ do consumidor</strong>.</li>
        <li><strong>Notas de entrada:</strong> o XML das notas de compra, com fornecedor, produtos e preços. Quando o fornecedor é pessoa física (por exemplo, produtor rural), o XML traz o nome e o CPF dele.</li>
        <li><strong>Inteligência artificial:</strong> as perguntas feitas ao assistente e, se a pessoa usar a voz, o áudio. Não guardamos o texto da pergunta nem o áudio; guardamos só um registro de uso (quantidade, custo e erros).</li>
        <li><strong>WhatsApp:</strong> o número cadastrado para receber avisos e o registro das mensagens enviadas.</li>
        <li><strong>Pagamentos:</strong> plano, valores, datas, situação das cobranças e os dados de quem paga (nome, CPF ou CNPJ, e-mail). Não guardamos o número do cartão.</li>
        <li><strong>Registros de segurança:</strong> quem fez cada ação importante, quando, o endereço IP e o navegador ou aparelho usado.</li>
      </ul>
      <p style={note}>Não pedimos dados sensíveis (saúde, religião, biometria e outros do art. 5º, II). Não use o campo de perguntas da inteligência artificial para escrever dados pessoais de clientes ou funcionários.</p>
    </LegalSection>

    <LegalSection title="O agente do computador do caixa">
      <p>O agente é um programa que o mercado instala no computador do caixa (Windows). Ele serve para levar as vendas ao painel sem digitação.</p>
      <p><strong>O que ele lê:</strong> só os arquivos XML das notas fiscais de venda, nas pastas ou no banco de dados do sistema de caixa indicados na instalação. Esses XML trazem o CPF ou CNPJ do consumidor quando ele pede CPF na nota. O agente não lê outros arquivos do computador.</p>
      <p><strong>O que ele envia:</strong> de cada nota, a chave, número, série, data, valor, CNPJ e endereço do emitente (o próprio mercado), o CPF ou CNPJ do consumidor (quando houver) e os itens (código de barras, código interno, descrição, NCM, CFOP, quantidade, valores e impostos). O envio é feito por conexão criptografada (HTTPS) e assinado com a chave do agente.</p>
      <p><strong>Onde ele guarda:</strong> numa fila local no próprio computador (pasta <code>C:\ProgramData\PDV2Cloud</code>), para não perder vendas quando a internet cai. As notas já enviadas saem da fila em 30 dias; as que ainda não foram enviadas ficam até serem enviadas ou até o agente ser removido. A chave de acesso do agente fica cifrada pelo Windows. Os registros técnicos do agente não guardam CPF.</p>
      <p><strong>Atualização:</strong> o agente baixa as novas versões do MercadoFlow e confere a integridade do arquivo antes de instalar.</p>
      <p style={note}>O mercado é responsável por manter o computador do caixa protegido (senha do Windows, antivírus, acesso só de pessoas autorizadas), porque a fila local fica nele.</p>
    </LegalSection>

    <LegalSection title="Para que usamos e com qual base legal">
      <p>Cada uso tem uma base legal do art. 7º da LGPD:</p>
      <ul style={ul}>
        <li><strong>Criar e manter a conta, dar acesso à equipe e prestar as funções do painel, do agente e do Bipaê</strong> (vendas, margens, estoque, compras, conferência, sugestões): execução do contrato com o mercado (art. 7º, V). Para as pessoas da equipe cadastradas pelo mercado, que não assinam o contrato, a base é o legítimo interesse de prestar o serviço contratado (art. 7º, IX).</li>
        <li><strong>Respostas e sugestões com inteligência artificial</strong> a partir dos números da loja: execução do contrato (art. 7º, V).</li>
        <li><strong>E-mails da conta</strong> (convite, troca de senha, confirmação de exclusão): execução do contrato (art. 7º, V).</li>
        <li><strong>Avisos por WhatsApp:</strong> consentimento (art. 7º, I). Você liga os avisos quando quiser e pode desligar a qualquer momento respondendo "PARAR" ou nas configurações.</li>
        <li><strong>Cobrar o plano e os créditos e emitir os documentos fiscais:</strong> execução do contrato (art. 7º, V) e cumprimento de obrigação legal fiscal e contábil (art. 7º, II).</li>
        <li><strong>Segurança, registros de acesso e prevenção de fraude:</strong> cumprimento de obrigação legal (art. 7º, II, e art. 15 do Marco Civil da Internet, que exige guardar os registros de acesso por 6 meses), legítimo interesse em proteger as contas (art. 7º, IX) e defesa em processos (art. 7º, VI).</li>
        <li><strong>Atender pedidos de titulares, da ANPD e de outras autoridades:</strong> cumprimento de obrigação legal (art. 7º, II) e exercício regular de direitos (art. 7º, VI).</li>
        <li><strong>Calcular indicadores de recompra e frequência dos clientes da loja:</strong> é um tratamento que fazemos como operadora, a pedido do mercado, que define a base legal. O CPF é transformado num código que não permite voltar ao número, e os resultados só aparecem em grupos de pelo menos 5 clientes.</li>
        <li><strong>Estudos de mercado:</strong> usamos só números agregados e anonimizados, que não identificam pessoas (art. 12 da LGPD). A etapa de agregação se apoia no legítimo interesse (art. 7º, IX).</li>
      </ul>
      <p>Quando usamos o legítimo interesse, tratamos só o necessário e você pode se opor (veja "Seus direitos"). Não vendemos dados pessoais e não mostramos anúncios.</p>
    </LegalSection>

    <LegalSection title="Com quem compartilhamos">
      <ul style={ul}>
        <li><strong>Hostinger:</strong> servidor onde o MercadoFlow roda, no Brasil.</li>
        <li><strong>Asaas</strong> (Brasil): cobrança. Recebe nome, CPF ou CNPJ e e-mail de quem paga.</li>
        <li><strong>Resend</strong> (Estados Unidos): envio dos e-mails da conta. Recebe nome, e-mail e o texto do e-mail.</li>
        <li><strong>Meta / WhatsApp</strong> (Estados Unidos): envio dos avisos para o número cadastrado.</li>
        <li><strong>Inteligência artificial:</strong> OpenRouter e OpenAI (Estados Unidos) e DeepSeek (China), só em planos pagos, com as opções que impedem o uso dos dados para treinar modelos sempre que o provedor as oferece. Eles recebem a pergunta e os números da loja necessários para responder. Não enviamos o CPF dos consumidores. A voz é transcrita pelo Deepgram (Estados Unidos), com a opção de não uso do áudio para melhoria do serviço. Se o mercado cadastrar a própria chave de um provedor, vale o contrato do mercado com ele.</li>
        <li><strong>Sefaz e Meu Danfe:</strong> para buscar notas de entrada (o Meu Danfe recebe só a chave de acesso da nota).</li>
        <li><strong>Parceiros que a loja autorizar:</strong> por exemplo, o sistema de gestão (ERP) conectado em Integrações. Cada um recebe só o que a loja liberou e pode ser desligado a qualquer momento.</li>
        <li><strong>Fabricantes:</strong> recebem só números agregados de várias lojas. A loja só aparece pelo nome se ligar essa opção. No plano Grátis, a participação nos números agregados e anônimos faz parte do plano.</li>
        <li><strong>Autoridades:</strong> quando a lei ou uma ordem judicial exigir.</li>
      </ul>
      <p>Essas empresas tratam os dados como operadoras ou como controladoras independentes, conforme o caso, só para a finalidade descrita acima.</p>
    </LegalSection>

    <LegalSection id="transferencia-internacional" title="Dados enviados para fora do Brasil">
      <p>Os dados ficam guardados no Brasil. Alguns serviços acima, porém, processam dados em outros países:</p>
      <ul style={ul}>
        <li><strong>Estados Unidos:</strong> OpenRouter e OpenAI (pergunta e números da loja), Deepgram (áudio da pergunta por voz), Resend (e-mails) e Meta/WhatsApp (avisos).</li>
        <li><strong>China:</strong> DeepSeek (pergunta e números da loja).</li>
      </ul>
      <p><strong>Como e por quanto tempo:</strong> o envio é feito por conexão criptografada, no momento do uso (uma pergunta, um e-mail, um aviso, um pagamento), e só com os dados necessários para aquela tarefa. O tempo que cada provedor guarda os dados segue o contrato dele com a {CONTROLLER}; nos provedores de inteligência artificial, usamos só planos pagos e as opções que impedem o uso dos dados para treinar modelos, quando oferecidas.</p>
      <p><strong>Com que garantia:</strong> a transferência internacional segue o art. 33 da LGPD e a Resolução CD/ANPD nº 19/2024. Hoje ela se apoia nos contratos e termos de proteção de dados de cada provedor e, quando cabível, a transferência necessária para executar o contrato com você (art. 33, IX, com o art. 7º, V) ou o seu consentimento específico e em destaque (art. 33, VIII), por exemplo ao ligar os avisos por WhatsApp. Estamos formalizando com esses provedores as cláusulas-padrão contratuais aprovadas pela ANPD; esta política será atualizada quando estiverem assinadas. Você pode pedir os termos em vigor pelo e-mail <Mail subject="Cláusulas de transferência internacional" />. Respondemos em até 15 dias, preservados os segredos comercial e industrial.</p>
      <p style={note}>Nem todos esses países têm lei de proteção de dados reconhecida pela ANPD como equivalente à brasileira. Se preferir, o mercado pode deixar a inteligência artificial e a voz desligadas; o resto do serviço funciona sem elas.</p>
    </LegalSection>

    <LegalSection title="Quem pode ver os dados da loja e como protegemos">
      <ul style={ul}>
        <li>a equipe do mercado, conforme o papel de cada pessoa na conta;</li>
        <li>a equipe de suporte e administração do MercadoFlow, quando precisa atender um pedido, corrigir um problema ou cuidar da segurança;</li>
        <li>parceiros autorizados pela loja;</li>
        <li>empresas contratadas para operar o serviço, como a Asaas e a Hostinger, só no que for necessário para o trabalho delas.</li>
      </ul>
      <p>A comunicação é criptografada (HTTPS), as senhas são guardadas com criptografia de mão única, chaves de integração e certificados ficam cifrados e cada loja só enxerga os próprios dados no painel (art. 46 da LGPD). Nenhum sistema é totalmente imune a falhas; por isso também mantemos registros de segurança e cópias de segurança.</p>
    </LegalSection>

    <LegalSection id="incidentes" title="Se acontecer um incidente de segurança">
      <p>Se um incidente puder causar risco ou dano relevante às pessoas, a {CONTROLLER} avisa a ANPD e as pessoas afetadas em até 3 dias úteis depois de saber que dados pessoais foram atingidos, como manda o art. 48 da LGPD e a Resolução CD/ANPD nº 15/2024. O aviso diz quais dados foram afetados, os riscos, o que já foi feito e como falar conosco.</p>
      <p>Quando os dados afetados forem dos clientes do mercado (por exemplo, o CPF nas notas), avisamos o mercado sem demora, porque é ele quem comunica a ANPD e os consumidores, e entregamos as informações de que ele precisar. Todo incidente fica registrado por pelo menos 5 anos.</p>
    </LegalSection>

    <LegalSection title="Por quanto tempo guardamos">
      <ul style={ul}>
        <li><strong>Notas, vendas e estoque:</strong> enquanto a conta existir, porque formam o histórico da loja.</li>
        <li><strong>CPF do consumidor nas notas de venda:</strong> 5 anos contados da data da nota, que é o prazo em que o Fisco pode rever o imposto (arts. 173 e 174 do Código Tributário Nacional). Depois disso, o CPF é mascarado e fica só o final do número.</li>
        <li><strong>Links de troca de senha, convites e desafios de verificação vencidos:</strong> apagados 90 dias depois de vencer.</li>
        <li><strong>Mensagens de WhatsApp e registros de uso da inteligência artificial:</strong> 2 anos.</li>
        <li><strong>Registros de segurança</strong> (quem fez o quê, IP e navegador): 5 anos. O Marco Civil da Internet exige pelo menos 6 meses; o prazo maior serve para investigar fraudes e para a defesa em processos, que podem ser abertos em até 5 anos.</li>
        <li><strong>Registros de pagamento:</strong> pelo prazo exigido pela lei fiscal e contábil, mesmo depois da exclusão da conta.</li>
        <li><strong>Registros técnicos do servidor:</strong> 30 dias.</li>
        <li><strong>Cópias de segurança (backup):</strong> são substituídas em rodízio de até 30 dias. Um dado apagado pode continuar numa cópia até ela ser substituída; essas cópias só são usadas para recuperar o sistema.</li>
        <li><strong>Fila do agente:</strong> notas enviadas saem do computador do caixa em 30 dias.</li>
      </ul>
      <p>Quando a finalidade acaba, os dados são apagados ou anonimizados, exceto nos casos do art. 16 da LGPD (por exemplo, obrigação legal).</p>
    </LegalSection>

    <LegalSection id="exclusao" title="Seus direitos e como exercê-los" highlight>
      <p>Pelo art. 18 da LGPD, você pode pedir, de graça:</p>
      <ul style={ul}>
        <li>confirmação de que tratamos dados seus e acesso a eles;</li>
        <li>correção de dados incompletos, errados ou desatualizados;</li>
        <li>anonimização, bloqueio ou eliminação de dados desnecessários, excessivos ou tratados em desacordo com a lei;</li>
        <li>portabilidade dos dados a outro fornecedor;</li>
        <li>eliminação dos dados tratados com o seu consentimento;</li>
        <li>informação sobre com quem compartilhamos os seus dados;</li>
        <li>informação sobre a possibilidade de não dar consentimento e o que acontece se não der;</li>
        <li>revogação do consentimento (por exemplo, dos avisos por WhatsApp);</li>
        <li>oposição a um tratamento feito com base no legítimo interesse, se ele não cumprir a lei;</li>
        <li>revisão de decisões tomadas só por meios automatizados que afetem os seus interesses (art. 20).</li>
      </ul>
      <p><strong>Como pedir:</strong> escreva para <Mail subject="Pedido LGPD" />, de preferência a partir do e-mail cadastrado. Podemos pedir uma confirmação de identidade para não entregar dados a outra pessoa. A confirmação de que tratamos dados seus e o acesso simplificado são respondidos na hora ou o mais rápido possível; a declaração completa, em até 15 dias (art. 19 da LGPD). Os demais pedidos são atendidos em até 15 dias; se não pudermos atender, explicamos o motivo, por exemplo quando a lei nos obriga a guardar o dado.</p>
      <p><strong>Excluir a conta:</strong> use a opção "Excluir minha conta" no painel ou no Bipaê, ou peça por e-mail. A conta é bloqueada na hora e você tem 30 dias para desistir. Depois disso, os dados pessoais da conta são apagados ou anonimizados. As notas de venda continuam no histórico, com o CPF do consumidor mascarado; os XML das notas de compra continuam guardados como foram emitidos. Guardamos também o que a lei obriga (por exemplo, registros de pagamento) e os registros de segurança até o fim do prazo deles.</p>
      <p><strong>Consumidor do mercado:</strong> se você comprou numa loja que usa o MercadoFlow e quer saber o que foi feito com o seu CPF, fale primeiro com o mercado, que é o controlador. Também pode escrever para <Mail subject="Pedido de consumidor" />: encaminhamos ao mercado e ajudamos a atender.</p>
      <p>Se não ficar satisfeito, você pode reclamar à Agência Nacional de Proteção de Dados (ANPD), em gov.br/anpd, e aos órgãos de defesa do consumidor (art. 18, §§ 1º e 8º).</p>
    </LegalSection>

    <LegalSection title="Crianças e adolescentes">
      <p>O MercadoFlow e o Bipaê são serviços para empresas e não são feitos para menores de 18 anos. Não coletamos de propósito dados de crianças. Se o mercado der acesso a um empregado adolescente (por exemplo, jovem aprendiz), ele deve fazer isso de acordo com a lei e no melhor interesse do adolescente (art. 14 da LGPD); o acesso é o mesmo de qualquer usuário. Se soubermos que há dados de uma criança na conta sem autorização de um responsável, nós os apagamos.</p>
    </LegalSection>

    <LegalSection title="Armazenamento no navegador e no aparelho">
      <p>O painel e o Bipaê guardam no navegador ou no aparelho só o necessário para funcionar, como a sessão de login, preferências da tela e contagens feitas sem internet. Não usamos cookies de publicidade nem ferramentas de rastreamento de terceiros.</p>
    </LegalSection>

    <LegalSection title="Mudanças nesta política">
      <p>Esta é a versão {LEGAL_VERSION}. Quando a política mudar, a data e a versão no topo desta página serão atualizadas. Mudanças importantes serão avisadas no painel ou por e-mail com pelo menos 15 dias de antecedência, salvo quando a mudança for exigida por lei ou necessária para corrigir um problema de segurança. Se a mudança envolver um uso que dependa do seu consentimento, pediremos de novo (art. 9º, § 2º, e art. 8º, § 6º, da LGPD).</p>
      <p>Esta política é regida pela lei brasileira. Veja também os <Link to="/termos" style={{ color: '#045e48' }}>Termos de uso</Link>.</p>
    </LegalSection>
  </LegalPage>
);

export default Privacidade;
