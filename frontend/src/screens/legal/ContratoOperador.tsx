import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { CONTROLLER, CONTROLLER_CNPJ, DPO_NAME, LEGAL_VERSION, LegalSection, Mail, UPDATED_AT } from './LegalPage';

/**
 * Contrato de tratamento de dados (DPA, art. 39 da LGPD) entre o mercado
 * (controlador) e a FUSE (operadora). Texto de docs/pie/juridico/DPA_OPERADOR.md.
 * Fica fora do <PanelStyles> do App.tsx: estilos inline, sem o CSS do painel.
 */

const ul: React.CSSProperties = { margin: '6px 0', paddingLeft: 20 };
const linkStyle: React.CSSProperties = { color: '#045e48' };
const cell: React.CSSProperties = { border: '1px solid #dde7e2', padding: '6px 8px', textAlign: 'left', verticalAlign: 'top' };

const Table: React.FC<{ head: string[]; rows: string[][] }> = ({ head, rows }) => (
  <div style={{ overflowX: 'auto', margin: '8px 0' }}>
    <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 14, minWidth: 520 }}>
      <thead>
        <tr>{head.map((h) => <th key={h} style={{ ...cell, background: '#f4f8f6' }}>{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r) => <tr key={r[0]}>{r.map((c, i) => <td key={i} style={cell}>{c}</td>)}</tr>)}
      </tbody>
    </table>
  </div>
);

const ContratoOperador: React.FC = () => {
  useEffect(() => {
    document.title = 'Contrato de tratamento de dados · MercadoFlow';
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: '#f4f8f6', fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' }}>
      <header style={{ padding: '14px 16px', borderBottom: '1px solid #dde7e2', background: '#fff' }}>
        <Link to="/" style={{ textDecoration: 'none', color: '#10231c', fontWeight: 800, fontSize: 18 }}>MercadoFlow</Link>
      </header>
      <main style={{ maxWidth: 820, margin: '0 auto', padding: '24px 16px 64px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 'clamp(26px, 4vw, 38px)', letterSpacing: '-.02em', lineHeight: 1.15, color: '#10231c' }}>
            Contrato de tratamento de dados (operador)
          </h1>
          <p style={{ margin: '8px 0 0', color: '#4f6159' }}>
            Acordo entre o mercado (controlador) e a {CONTROLLER} (operadora), nos termos do art. 39 da Lei nº 13.709/2018 (LGPD).
          </p>
        </div>

        <LegalSection title="Versão vigente" highlight>
          <p style={{ margin: 0 }}>
            Esta é a <strong>versão vigente</strong> do contrato: versão <strong>{LEGAL_VERSION}</strong>, em vigor desde <strong>{UPDATED_AT}</strong>.
            O dono da loja aceita este contrato no cadastro ou na tela de aceite do painel e do Bipaê; o aceite fica registrado com a data, a hora e a versão.
          </p>
        </LegalSection>

        <LegalSection title="Partes">
          <p><strong>CONTROLADOR:</strong> o mercado identificado no cadastro do MercadoFlow (razão social e CNPJ informados na conta), representado pela pessoa que faz o aceite eletrônico em nome dele ("Mercado").</p>
          <p><strong>OPERADORA:</strong> {CONTROLLER}, CNPJ {CONTROLLER_CNPJ}, com sede em Guarapuava/PR, que presta o serviço MercadoFlow (painel, agente do PDV e app Bipaê) ("FUSE").</p>
          <p>Este Acordo integra os <Link to="/termos" style={linkStyle}>Termos de uso</Link> do MercadoFlow. Se houver conflito sobre tratamento de dados pessoais, vale este Acordo.</p>
        </LegalSection>

        <LegalSection title="Cláusula 1. Definições">
          <p>Os termos "dado pessoal", "titular", "controlador", "operador", "tratamento", "anonimização", "incidente de segurança" e "transferência internacional" têm o sentido da LGPD (art. 5º) e das resoluções da Agência Nacional de Proteção de Dados (ANPD). "Suboperador" é a empresa contratada pela FUSE que trata dados pessoais do Mercado para prestar o serviço.</p>
        </LegalSection>

        <LegalSection title="Cláusula 2. Objeto e papéis">
          <p>2.1. Este Acordo regula o tratamento, pela FUSE, dos dados pessoais de que o Mercado é controlador e que chegam ao MercadoFlow para a prestação do serviço ("Dados do Mercado"), em especial:</p>
          <Table
            head={['Categoria de titular', 'Dados', 'Origem']}
            rows={[
              ['Consumidores do Mercado', 'CPF ou CNPJ informado na NFC-e, com data, valor e itens da compra', 'Agente do PDV (XML das NFC-e)'],
              ['Fornecedores pessoas físicas (produtor rural, MEI)', 'Nome, CPF, endereço e telefone que constem do XML da NF-e de compra', 'Bipaê, Sefaz, Meu Danfe, importação'],
              ['Contatos comerciais de fornecedores', 'Nome, e-mail e telefone cadastrados pelo Mercado', 'Painel'],
              ['Outros dados que o Mercado inserir em campos livres', 'Conforme inserido', 'Painel e Bipaê'],
            ]}
          />
          <p>2.2. <strong>Finalidades autorizadas:</strong> (a) receber, guardar e organizar as notas e mostrar ao Mercado vendas, margens, estoque, compras e conferência; (b) calcular indicadores de recompra e frequência com o CPF pseudonimizado (HMAC com chave própria do Mercado) e exibição só em grupos de pelo menos 5 consumidores; (c) gerar respostas e sugestões de inteligência artificial <strong>sem envio de CPF de consumidores</strong>; (d) cumprir as rotinas de retenção, anonimização e exclusão descritas na Cláusula 9; (e) cumprir obrigações legais e ordens de autoridade.</p>
          <p>2.3. Os dados das pessoas que usam o MercadoFlow (conta, login, cobrança, registros de segurança, WhatsApp) <strong>não</strong> fazem parte deste Acordo: a FUSE é controladora deles, conforme a <Link to="/privacidade" style={linkStyle}>Política de privacidade</Link>.</p>
          <p>2.4. <strong>Duração:</strong> enquanto durar o contrato de uso do MercadoFlow e, depois dele, pelo tempo necessário para cumprir a Cláusula 9.</p>
        </LegalSection>

        <LegalSection title="Cláusula 3. Instruções do controlador">
          <p>3.1. A FUSE trata os Dados do Mercado <strong>somente</strong> segundo as instruções do Mercado (art. 39 da LGPD). São instruções documentadas: este Acordo, os Termos de uso, as configurações escolhidas pelo Mercado no painel (por exemplo, integrações, IA, fabricantes) e pedidos escritos pelo canal de privacidade.</p>
          <p>3.2. <strong>Instrução de retenção:</strong> o Mercado instrui a FUSE a manter o CPF do consumidor em claro por 5 anos contados da data de emissão da nota, prazo que acompanha a decadência tributária (arts. 173 e 174 do CTN), e a mascará-lo depois disso. O Mercado pode pedir prazo menor por escrito; a FUSE informará se a mudança depende de ajuste técnico e em quanto tempo será feita.</p>
          <p>3.3. A FUSE avisará o Mercado se entender que uma instrução viola a LGPD ou outra lei, e poderá suspender o cumprimento dessa instrução até que seja esclarecida.</p>
          <p>3.4. A FUSE não usará os Dados do Mercado para finalidade própria, salvo dados anonimizados que não permitam identificar titulares nem o Mercado (art. 12 da LGPD).</p>
        </LegalSection>

        <LegalSection title="Cláusula 4. Deveres do Mercado (controlador)">
          <p>4.1. Definir e documentar a base legal para cada uso dos dados dos consumidores, inclusive para os indicadores de recompra (por exemplo, legítimo interesse, com o teste de balanceamento do art. 10 da LGPD).</p>
          <p>4.2. Informar os consumidores de forma clara, por exemplo com aviso no caixa e na política de privacidade do Mercado, indicando que usa um serviço contratado para guardar e analisar as notas.</p>
          <p>4.3. Responder aos pedidos dos titulares e comunicar incidentes à ANPD e aos titulares quando for o caso, com o apoio da FUSE.</p>
          <p>4.4. Proteger os computadores onde o agente do PDV está instalado (senha, antivírus, acesso restrito), porque a fila local do agente fica neles.</p>
          <p>4.5. Não inserir dados pessoais sensíveis nem dados de crianças em campos livres do serviço.</p>
        </LegalSection>

        <LegalSection title="Cláusula 5. Confidencialidade e pessoal">
          <p>5.1. Só acessam os Dados do Mercado as pessoas da FUSE que precisam deles para suporte, correção de falhas ou segurança, obrigadas a sigilo por contrato ou por dever legal.</p>
          <p>5.2. Todo acesso administrativo fica registrado na trilha de auditoria.</p>
        </LegalSection>

        <LegalSection title="Cláusula 6. Segurança">
          <p>6.1. A FUSE mantém medidas técnicas e administrativas adequadas ao risco (art. 46 da LGPD), entre elas:</p>
          <ul style={ul}>
            <li>comunicação criptografada (HTTPS/TLS) entre agente, app, painel e servidor;</li>
            <li>isolamento dos dados por mercado no banco (controle de acesso por linha);</li>
            <li>senhas com hash de mão única; segredos, chaves de integração e certificado A1 cifrados (AES-256-GCM);</li>
            <li>assinatura das mensagens do agente e verificação de integridade das atualizações;</li>
            <li>pseudonimização do CPF para os indicadores de recompra e exibição só em grupos de 5 ou mais;</li>
            <li>trilha de auditoria de ações relevantes;</li>
            <li>cópias de segurança diárias, em rodízio de até 30 dias;</li>
            <li>servidor no Brasil (Hostinger).</li>
          </ul>
          <p>6.2. A FUSE pode trocar uma medida por outra de eficácia igual ou maior, sem reduzir o nível de proteção.</p>
        </LegalSection>

        <LegalSection title="Cláusula 7. Suboperadores">
          <p>7.1. O Mercado autoriza, de forma geral, os suboperadores abaixo:</p>
          <Table
            head={['Suboperador', 'Serviço', 'País do tratamento', 'Dados do Mercado envolvidos']}
            rows={[
              ['Hostinger', 'Servidor (VPS)', 'Brasil', 'Todos (armazenamento)'],
              ['Asaas', 'Cobrança', 'Brasil', 'Nenhum dado de consumidor (só dados de quem paga, fora deste Acordo)'],
              ['Resend', 'E-mail transacional', 'EUA', 'Nenhum dado de consumidor, salvo se o Mercado inserir em campo que vá por e-mail'],
              ['OpenRouter', 'Roteamento de IA (só provedores que não guardam dados)', 'EUA e país do modelo escolhido', 'Números da loja e textos de produtos e fornecedores; sem CPF'],
              ['OpenAI', 'Modelos de IA', 'EUA', 'Idem'],
              ['DeepSeek', 'Modelos de IA', 'China', 'Idem'],
              ['Deepgram', 'Transcrição de voz', 'EUA', 'Áudio da pergunta do usuário'],
              ['Meta (WhatsApp)', 'Avisos ao lojista', 'EUA', 'Avisos sobre a loja; sem CPF'],
              ['Meu Danfe', 'Consulta de NF-e pela chave', 'Brasil', 'Só a chave de acesso (o XML retornado pode conter dados de fornecedor)'],
            ]}
          />
          <p>7.2. A FUSE avisará o Mercado, pelo painel ou por e-mail, com pelo menos 15 dias de antecedência, antes de incluir ou trocar um suboperador. O Mercado pode se opor por motivo razoável ligado à proteção de dados; se não houver solução, pode encerrar o contrato sem multa.</p>
          <p>7.3. A FUSE exigirá de cada suboperador obrigações de proteção de dados equivalentes às deste Acordo e responde perante o Mercado pelo que o suboperador fizer, nos limites da Cláusula 13.</p>
        </LegalSection>

        <LegalSection title="Cláusula 8. Transferência internacional">
          <p>8.1. Só há transferência internacional de Dados do Mercado nos usos listados na Cláusula 7 e apenas com o mínimo necessário. O CPF de consumidores não é enviado para fora do Brasil.</p>
          <p>8.2. A FUSE adota, para cada suboperador estrangeiro, um mecanismo válido do art. 33 da LGPD e do art. 9º do Regulamento aprovado pela Resolução CD/ANPD nº 19/2024, preferencialmente as cláusulas-padrão contratuais da ANPD (Anexo II), sem alteração. A FUSE entrega ao Mercado, a pedido, cópia das cláusulas em até 10 dias, para que ele possa atender o titular no prazo de 15 dias do art. 17, § 1º, daquela Resolução.</p>
          <p>8.3. O Mercado pode desligar a inteligência artificial e a voz a qualquer momento, o que interrompe a transferência correspondente.</p>
        </LegalSection>

        <LegalSection title="Cláusula 9. Retenção, devolução e eliminação">
          <p>9.1. Durante o contrato, valem as regras de retenção da Política de privacidade, entre elas: CPF do consumidor mascarado 5 anos após a emissão da nota; fila local do agente com notas enviadas apagada em 30 dias; cópias de segurança em rodízio de até 30 dias.</p>
          <p>9.2. <strong>Fim do contrato ou exclusão da conta:</strong> (a) antes de pedir a exclusão, o Mercado pode exportar os dados da loja (nos planos com essa opção) ou pedir uma cópia pelo canal de privacidade; (b) o acesso é bloqueado na hora e o Mercado tem 30 dias para desistir; (c) passado o prazo, a FUSE mascara o CPF dos consumidores em todas as notas, apaga os perfis de recompra e a chave de pseudonimização (o que impede ligar os indicadores a qualquer pessoa) e anonimiza os dados de contato; (d) os dados restantes saem das cópias de segurança no rodízio delas.</p>
          <p>9.3. Ficam guardados, depois da exclusão, só os dados que a lei obriga a FUSE a manter ou que são necessários para o exercício de direitos (art. 16, I, da LGPD), como registros de cobrança e de segurança, pelo prazo correspondente. As notas de venda (com CPF mascarado) e os XML de compra são mantidos conforme a Política de privacidade vigente; o Mercado pode pedir a eliminação desses documentos, e a FUSE informará o prazo técnico para atender.</p>
          <p>9.4. A FUSE confirma ao Mercado, por e-mail, a conclusão da eliminação ou anonimização.</p>
        </LegalSection>

        <LegalSection title="Cláusula 10. Pedidos dos titulares">
          <p>10.1. Se um titular procurar a FUSE sobre Dados do Mercado, a FUSE encaminha o pedido ao Mercado em até 2 dias úteis e não responde ao mérito sem instrução, salvo para informar ao titular quem é o controlador.</p>
          <p>10.2. A FUSE ajuda o Mercado a responder, com as informações e ações técnicas disponíveis (localização, cópia, correção, anonimização do CPF de um consumidor), em prazo que permita ao Mercado cumprir os 15 dias do art. 19 da LGPD.</p>
        </LegalSection>

        <LegalSection title="Cláusula 11. Incidentes de segurança">
          <p>11.1. A FUSE avisa o Mercado <strong>sem demora injustificada e em até 48 horas</strong> depois de confirmar um incidente de segurança que afete Dados do Mercado, mesmo que ainda não tenha todas as informações.</p>
          <p>11.2. O aviso traz, assim que disponíveis: descrição do incidente, data em que foi conhecido, categorias e quantidade aproximada de titulares e de dados, riscos prováveis, medidas tomadas e planejadas, e o contato do encarregado da FUSE. Esse conteúdo segue o art. 48, § 1º, da LGPD e os arts. 6º e 9º da Resolução CD/ANPD nº 15/2024, para que o Mercado possa comunicar a ANPD e os titulares em 3 dias úteis.</p>
          <p>11.3. A FUSE registra o incidente e o mantém por pelo menos 5 anos (art. 10 da Resolução CD/ANPD nº 15/2024), não comunica a ANPD nem os titulares em nome do Mercado sem autorização dele (salvo obrigação legal própria) e coopera na investigação e na mitigação.</p>
        </LegalSection>

        <LegalSection title="Cláusula 12. Auditoria e prestação de contas">
          <p>12.1. A FUSE fornece ao Mercado, a pedido feito com 15 dias de antecedência e no máximo uma vez por ano (ou a qualquer tempo depois de incidente ou por ordem da ANPD), as informações necessárias para demonstrar o cumprimento deste Acordo: descrição das medidas de segurança, lista de suboperadores e mecanismos de transferência, e o registro das operações de tratamento referentes ao Mercado (art. 37 da LGPD).</p>
          <p>12.2. Auditoria presencial ou por terceiro, quando necessária, será feita em horário comercial, por profissional sob sigilo, sem acesso a dados de outros clientes, com custo a cargo do Mercado, salvo se apontar descumprimento relevante da FUSE.</p>
        </LegalSection>

        <LegalSection title="Cláusula 13. Responsabilidade">
          <p>13.1. Cada parte responde pelos danos que causar ao violar a LGPD ou este Acordo. A FUSE responde solidariamente perante o titular quando descumprir a lei ou as instruções lícitas do Mercado (art. 42, § 1º, I, da LGPD); o Mercado responde pelas decisões que toma como controlador, inclusive a base legal e a informação aos consumidores.</p>
          <p>13.2. Entre as partes, aplica-se o limite de responsabilidade dos Termos de uso, que não vale para dolo, culpa grave nem para a violação deliberada deste Acordo. Nenhuma cláusula limita os direitos dos titulares ou dos consumidores perante qualquer das partes (arts. 42 a 45 da LGPD).</p>
          <p>13.3. Quem indenizar o titular por dano causado pela outra parte pode cobrar dela o que pagou, na medida da participação dela no dano (art. 42, § 4º, da LGPD).</p>
        </LegalSection>

        <LegalSection title="Cláusula 14. Disposições gerais">
          <p>14.1. Mudanças neste Acordo seguem o procedimento de mudança dos Termos de uso (aviso com 15 dias e direito de encerrar sem multa). Mudança exigida por lei ou pela ANPD vale a partir da exigência.</p>
          <p>14.2. Vale a lei brasileira. Foro: comarca de Guarapuava/PR, sede da FUSE (art. 63 do CPC), salvo relação de consumo, caso em que o Mercado pode demandar no seu domicílio (art. 101, I, do CDC).</p>
          <p>14.3. Contatos: encarregado da FUSE, {DPO_NAME}, <Mail subject="Contrato de tratamento de dados" />. Contato de privacidade do Mercado: o e-mail do dono cadastrado na conta, salvo outro informado por escrito.</p>
        </LegalSection>

        <LegalSection title="Como o aceite é registrado">
          <p>O aceite é eletrônico (contrato de adesão, art. 10, § 2º, da MP 2.200-2/2001 e art. 107 do Código Civil). Ficam guardados o usuário e o mercado, o documento, a versão, a data e a hora, o IP e o navegador de quem aceitou. Quando este contrato mudar de versão, o dono da loja vê uma tela de aceite no próximo acesso ao painel ou ao Bipaê.</p>
        </LegalSection>

        <p style={{ margin: '8px 0 0', fontSize: 14, color: '#4f6159', textAlign: 'center' }}>
          <Link to="/termos" style={linkStyle}>Termos de uso</Link>
          {' · '}
          <Link to="/privacidade" style={linkStyle}>Política de privacidade</Link>
          {' · '}
          <a href="/bipae/privacidade.html" style={linkStyle}>Privacidade do Bipaê</a>
          <br />
          MercadoFlow · {CONTROLLER} · CNPJ {CONTROLLER_CNPJ}
        </p>
      </main>
    </div>
  );
};

export default ContratoOperador;
