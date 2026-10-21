# Bipaê na Play Store: o que preencher no Play Console

Guia para quem vai publicar o app. Cada seção corresponde a uma tela do Play Console. Os textos já estão prontos para copiar.

| Item | Valor |
|---|---|
| Nome do app | **Bipaê** |
| ID do pacote | `br.com.bipae.confere` (permanente, não muda nunca) |
| Versão | 1.0.0 (versionCode 1) |
| Arquivo para enviar | `C:\Users\fusea\.bipae\bipae-1.0.0.aab` |
| Chave de envio | `C:\Users\fusea\.bipae\bipae-upload.jks` + `keystore.properties` (**faça backup**, veja o passo 2) |
| Política de privacidade | https://mercadoflow.com/bipae/privacidade.html |
| Imagens | `docs/bipae-play/icon-512.png` (ícone) e `docs/bipae-play/feature-graphic.png` (gráfico de destaque) |

---

## 1. Criar o app

Play Console › **Criar app**:
- Nome do app: `Bipaê`
- Idioma padrão: Português (Brasil)
- App ou jogo: **App**
- Gratuito ou pago: **Gratuito** (os créditos de leitura são cobrados pelo site, por Pix ou cartão, fora da Play Store; veja o aviso no fim)
- Aceite as declarações.

## 2. Assinatura do app e backup da chave

1. Em **Teste e lançamento › Configuração › Integridade do app**, deixe ligada a **Assinatura de apps do Google Play** (vem ligada por padrão). O Google guarda a chave final do app, e nós só usamos a **chave de envio**.
2. A chave de envio já existe em `C:\Users\fusea\.bipae\`:
   - `bipae-upload.jks`: o arquivo da chave
   - `keystore.properties`: as senhas
3. **Copie a pasta `.bipae` inteira para um lugar seguro**: um pendrive e um cofre de senhas ou drive privado. Não coloque no GitHub. Sem essa chave, cada nova versão precisa de um pedido de troca de chave ao Google, que pode levar dias.

## 3. Ficha da loja (Presença na loja › Ficha principal)

**Nome do app** (até 30): `Bipaê`

**Descrição curta** (até 80):
```
Confira a nota do fornecedor e conte o estoque do mercado bipando o código.
```

**Descrição completa** (até 4000):
```
O Bipaê é o app do mercado para receber mercadoria e contar estoque sem papel e sem erro.

CONFERIR A NOTA DO FORNECEDOR
Chegou mercadoria? Bipe o código de barras do DANFE (a folha que vem com a entrega). Na hora aparecem todos os produtos da nota, com foto e em letras grandes. Você confere item por item e marca o que chegou certo, o que faltou e o que sobrou. No fim, o Bipaê mostra o resumo para você cobrar o fornecedor.

• Leitura pelo código de barras do DANFE ou digitando a chave de acesso
• Produtos com foto e nome fácil de reconhecer
• Falta e sobra calculadas sozinhas
• Histórico de todas as notas conferidas

CONTAR O ESTOQUE BIPANDO
Bipe o produto na prateleira, diga quantos tem na prateleira e no depósito, e pronto: o Bipaê já pede o próximo. Sem planilha e sem caderno.

• Leitor de código de barras rápido, do próprio Google
• Mostra a foto do produto e quanto ele vende por dia
• Funciona até sem internet no depósito: a contagem fica guardada no celular e é enviada quando o sinal volta

NOTAS DIRETO DA SEFAZ (OPCIONAL)
Com o certificado digital A1 do mercado, o Bipaê baixa sozinho todas as notas emitidas contra o seu CNPJ, sem custo e sem limite. O certificado fica guardado com criptografia e pode ser removido quando você quiser. Sem o certificado, você usa créditos de leitura, e as primeiras leituras são grátis para testar.

FEITO PARA O MERCADO
O Bipaê usa a conta MercadoFlow do seu mercado. As notas e as contagens alimentam o painel MercadoFlow da loja, com custo real, estoque e sugestões de compra.

Dúvidas: contato@mercadoflow.com
```

**Recursos gráficos**:
- Ícone do app (512 × 512): `docs/bipae-play/icon-512.png`
- Gráfico de destaque (1024 × 500): `docs/bipae-play/feature-graphic.png`
- Capturas de tela do celular: mínimo 2, ideal 4 a 8, em pé (ex.: 1080 × 1920). Sugestão de telas: Início, Ler nota, Conferência de uma nota, Contar estoque com um produto bipado. [PREENCHER: usar as capturas geradas no emulador pelo outro agente, ou tirar no celular com uma conta de demonstração com dados de exemplo]

**Detalhes de contato**:
- E-mail: `contato@mercadoflow.com` [PREENCHER: confirmar]
- Site: `https://mercadoflow.com`
- Telefone: opcional

## 4. Categoria e tags (Presença na loja › Configurações da loja)

- Categoria: **Empresas** (alternativa: Produtividade)
- Tags sugeridas: Empresas, Produtividade, Gerenciamento de estoque, Leitor de código de barras

## 5. Conteúdo do app (Política › Conteúdo do app)

### Política de privacidade
`https://mercadoflow.com/bipae/privacidade.html`
(Antes de enviar, preencha os campos marcados com [PREENCHER] na página: razão social, CNPJ, endereço, encarregado, prazos e servidor.)

### Acesso ao app
O app exige login. Escolha **"Todas ou algumas funcionalidades estão restritas"** e informe uma conta de demonstração:
1. Crie uma conta de mercado de demonstração no site (mercadoflow.com/register ou pelo próprio app), por exemplo `revisor.bipae@mercadoflow.com`, com CNPJ de teste e alguns produtos e notas de exemplo. [PREENCHER: criar a conta e definir a senha]
2. No Play Console, cole o e-mail e a senha e escreva as instruções:
   ```
   Entre com o e-mail e a senha acima. Na aba "Contar", toque em "Bipar produto" e leia qualquer código de barras de produto (ou toque em "Digitar o código" e use 7891000100103). Na aba "Notas" há notas de exemplo para abrir e conferir.
   ```
   [PREENCHER: trocar o código de exemplo por um EAN que exista na conta de demonstração]
3. Não use a conta real de um cliente.

### Anúncios
**Não, o app não contém anúncios.**

### Classificação de conteúdo
Responda o questionário IARC:
- Categoria: **Utilitário, produtividade, comunicação ou outro**
- Violência, sexo, linguagem imprópria, drogas, jogos de azar: **Não** para tudo
- Os usuários interagem entre si ou compartilham conteúdo: **Não**
- Compartilha a localização: **Não**
- Compras digitais: **Sim** (créditos de leitura comprados pelo site)

Resultado esperado: **Livre**.

### Público-alvo
- Faixa etária: **18 anos ou mais** (app para empresas)
- O app não é direcionado a crianças.

### App de notícias / governo / saúde / financeiro
Responda **Não** para todos.

### Segurança dos dados (Data safety)

**O app coleta ou compartilha dados do usuário?** Sim.
**Todos os dados são criptografados em trânsito?** Sim (HTTPS).
**O usuário pode pedir a exclusão dos dados?** Sim. Informe o link: `https://mercadoflow.com/bipae/privacidade.html#exclusao` (pedido por e-mail a contato@mercadoflow.com).

Tipos de dados (marque estes):

| Tipo no formulário | Coletado | Compartilhado | Obrigatório? | Finalidade |
|---|---|---|---|---|
| Informações pessoais › Nome | Sim | Não | Obrigatório | Funcionalidade do app, gerenciamento da conta |
| Informações pessoais › Endereço de e-mail | Sim | Não | Obrigatório | Funcionalidade do app, gerenciamento da conta, comunicações |
| Informações financeiras › Histórico de compras | Sim | Sim (provedor de pagamento) | Opcional (só quem compra créditos) | Funcionalidade do app |
| Arquivos e documentos (notas fiscais XML e certificado A1) | Sim | Sim (Sefaz e Meu Danfe, para buscar as notas) | Opcional | Funcionalidade do app |
| Atividade no app › Outras ações (conferências e contagens de estoque) | Sim | Não | Obrigatório para usar a função | Funcionalidade do app, análises (agregadas e anônimas) |

Não marque: localização, contatos, fotos e vídeos, áudio, mensagens, saúde, identificadores do dispositivo, histórico de navegação.

Notas para responder com segurança:
- **Câmera:** o leitor de código de barras é o do Google Play Services (ML Kit). O app não pede a permissão de câmera e não guarda imagens. Não há nada a declarar sobre fotos ou vídeos.
- **Compartilhamento com fabricantes:** só acontece se o lojista ligar a opção na conta, e o padrão é desligado. Como é opcional e iniciado pelo usuário, o Google não exige declarar como "compartilhamento", mas a política de privacidade cita o caso.
- **Pagamento com cartão:** é processado pelo Stripe. O app não guarda o número do cartão.

### Permissões
O app declara só `INTERNET`. Não há permissões sensíveis (câmera, localização, contatos, SMS) para justificar.

### Declaração de compras / pagamentos
Os créditos de leitura são vendidos no site do MercadoFlow (Pix pelo Asaas ou cartão pelo Stripe), e o app abre essa mesma tela. **Atenção:** a política de Pagamentos do Google Play exige o Faturamento do Google Play para conteúdo digital consumido dentro do app. Antes de enviar para revisão, decida uma destas opções:
1. Esconder a compra de créditos dentro do app Android e deixar a compra só no site (mais simples).
2. Integrar o Google Play Billing.

[PREENCHER: decisão do dono. Recomendação: opção 1 para a primeira versão.]

## 6. Enviar a versão: teste interno primeiro

1. **Teste e lançamento › Testes › Teste interno › Criar nova versão.**
2. Envie `C:\Users\fusea\.bipae\bipae-1.0.0.aab`.
3. Nome da versão: `1.0.0`. Notas da versão:
   ```
   Primeira versão do Bipaê: conferência de nota pelo código de barras do DANFE e contagem de estoque bipando o produto.
   ```
4. Em **Testadores**, crie uma lista com os e-mails Google de quem vai testar (você e a equipe), salve e copie o **link de participação**.
5. Abra o link no celular Android, aceite e instale pela Play Store. Teste:
   - login;
   - bipar uma nota;
   - bipar um produto em "Contar";
   - contar com o celular sem internet e conferir que a contagem chega quando a internet volta.
6. Se estiver tudo certo: **Teste e lançamento › Produção › Criar nova versão › Adicionar da biblioteca** (a mesma versão 1.0.0) › Revisar › **Enviar para revisão**.
7. A primeira revisão do Google costuma levar de alguns dias a uma semana.

Contas pessoais criadas depois de nov/2023 precisam passar por um **teste fechado com pelo menos 12 testadores por 14 dias** antes de liberar a produção. Contas de organização (empresa com D-U-N-S) não têm essa exigência. [PREENCHER: confirmar o tipo da conta de desenvolvedor]

## 7. Próximas versões

1. Atualize `versionCode` (+1) e `versionName` em `frontend/android/app/build.gradle`.
2. Gere o `.aab` assinado:
   ```
   cd frontend
   npm run build
   npx cap sync android
   cd android
   gradlew bundleRelease
   ```
   O arquivo sai em `app/build/outputs/bundle/release/`.
3. Envie como nova versão (teste interno e depois produção).

Mudanças só nas telas (web) **não precisam de nova versão na loja**: o app abre o Bipaê publicado em mercadoflow.com/confere, então o deploy do site já atualiza o app. Nova versão na loja só é necessária ao mudar o nativo: ícone, plugins, permissões ou versão do Android.

## 8. Avisos importantes

- **O app depende do site no ar.** Ele abre mercadoflow.com/confere. Se o site cair, o app mostra a tela "Sem internet agora". As contagens já feitas ficam guardadas no celular.
- **Política de pagamentos:** veja a seção "Declaração de compras" acima, antes de enviar para revisão.
- **Exclusão de conta:** o Google exige que o usuário consiga pedir a exclusão. Hoje isso é feito por e-mail (descrito na política). Responda esses pedidos dentro do prazo informado.
