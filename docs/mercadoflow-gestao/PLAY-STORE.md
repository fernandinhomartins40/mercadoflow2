# MercadoFlow Gestão na Play Store: o que preencher no Play Console

Guia para publicar o app do painel do supermercadista. Cada seção corresponde a uma tela do Play Console, com os textos prontos para copiar.

| Item | Valor |
|---|---|
| Nome do app | **MercadoFlow Gestão** |
| ID do pacote | `br.com.mercadoflow.gestao` (permanente, não muda nunca) |
| Versão | 1.0.0 (versionCode 1) |
| Arquivo para enviar | `C:\Users\fusea\.mercadoflow-gestao\mercadoflow-gestao-1.0.0.aab` |
| Chave de envio | `C:\Users\fusea\.mercadoflow-gestao\gestao-upload.jks` + `keystore.properties` (**faça backup**, veja o passo 2) |
| Política de privacidade | https://mercadoflow.com/privacidade |
| Exclusão de conta (link) | https://mercadoflow.com/privacidade#exclusao |
| Ícone 512 × 512 | `docs/mercadoflow-gestao/icon-512.png` |
| Gráfico de destaque 1024 × 500 | `docs/mercadoflow-gestao/feature-graphic.png` |

## Como o app funciona

- As telas do painel ficam **dentro do app** (build `gestao`). O app não abre o site: ele carrega as telas do próprio aparelho e conversa com a API em `https://mercadoflow.com/api`.
- O login fica guardado no aparelho (token de 30 dias, "Manter conectado" já vem marcado). Sair apaga o token.
- O nativo do celular é usado para ler código de barras (leitor do Google, ML Kit), vibrar, abrir a folha de compartilhar para encartes, PDFs e CSVs, e na barra de status e tela de abertura.
- **Não há venda dentro do app.** Planos, pagamento, faturas e adicionais não aparecem: a tela "Assinatura e planos" só mostra o plano em uso. É isso que dispensa o faturamento do Google Play. O cadastro cria a conta no plano Grátis.
- Mudou uma tela do painel? É preciso gerar uma versão nova e enviar à loja (veja "Nova versão" no fim).

## 1. Criar o app

Play Console › **Criar app**:
- Nome do app: `MercadoFlow Gestão`
- Idioma padrão: Português (Brasil)
- App ou jogo: **App**
- Gratuito ou pago: **Gratuito**
- Aceite as declarações.

A conta é de organização, então não se aplica a exigência de teste fechado com 12 testadores (ela vale só para contas pessoais novas). Dá para enviar direto em **Produção**. A análise do Google para um app novo costuma levar de algumas horas a alguns dias.

## 2. Assinatura do app e backup da chave

1. Em **Teste e lançamento › Configuração › Integridade do app**, deixe ligada a **Assinatura de apps do Google Play**.
2. A chave de envio já existe em `C:\Users\fusea\.mercadoflow-gestao\`:
   - `gestao-upload.jks`: a chave
   - `keystore.properties`: as senhas
3. **Copie a pasta `.mercadoflow-gestao` inteira para um lugar seguro** (pendrive e cofre de senhas ou drive privado). Não coloque no GitHub. Sem essa chave, cada versão nova exige pedir ao Google a troca da chave.

Impressão digital SHA-256 do certificado de envio:
`C9:2C:22:96:DB:2E:88:DC:9A:FA:DC:40:53:1D:3B:3E:C6:45:37:43:E9:69:93:FF:DC:2B:E9:DB:98:B3:46:84`

## 3. Ficha da loja (Presença na loja › Ficha principal)

**Nome do app** (até 30): `MercadoFlow Gestão`

**Descrição curta** (até 80):
```
O painel do seu mercado no celular: vendas, estoque, compras e ofertas.
```

**Descrição completa** (até 4000):
```
O MercadoFlow Gestão é o painel do supermercado no celular. Com ele, o dono e a equipe acompanham a loja e decidem o que fazer, de qualquer lugar.

VEJA COMO A LOJA ESTÁ
• Vendas do dia, da semana e do mês, direto dos caixas
• Produtos que mais vendem e os que estão parados
• Margem, ticket médio e movimento por horário

DECIDA COM AJUDA
• Sugestões do que comprar, promover ou liquidar, com o motivo de cada uma
• Pergunte em português e receba a resposta com os números da loja
• Alertas de produto acabando, preço fora do mercado e estoque parado

COMPRE MELHOR
• Lista de compras e pedidos para os fornecedores, enviados pelo WhatsApp ou e-mail
• Contato dos fornecedores e histórico do que já foi pedido

CONTE O ESTOQUE BIPANDO
• Leitor de código de barras rápido, do próprio Google
• Foto do produto e quanto ele vende por dia
• Conferência das notas dos fornecedores

VENDA MAIS
• Ofertas e encartes prontos para imprimir ou mandar no WhatsApp
• Planta da loja para organizar as gôndolas

EQUIPE E LOJA
• Convide gerente, comprador, conferente e financeiro, cada um com o seu acesso
• Caixas e integração com o sistema da loja

O app usa a conta MercadoFlow do mercado. Os dados vêm dos caixas da loja, pelo programa MercadoFlow instalado no computador do caixa. Quem ainda não tem conta pode criar a sua grátis pelo próprio app.

Dúvidas: fuseagencia10@gmail.com
```

**Recursos gráficos**:
- Ícone do app (512 × 512): `docs/mercadoflow-gestao/icon-512.png`
- Gráfico de destaque (1024 × 500): `docs/mercadoflow-gestao/feature-graphic.png`
- Capturas de tela do celular: mínimo 2, ideal 4 a 8, em pé. **Pendente:** tirar com a conta de demonstração (passo 6) nas telas Início, Decidir, Produtos, Pedidos e Ofertas. Não usar dados de cliente real.

**Detalhes de contato**:
- E-mail: `fuseagencia10@gmail.com`
- Site: `https://mercadoflow.com`

**Categoria**: Empresas. **Tags**: gestão de negócios, varejo.

## 4. Conteúdo do app (Política › Conteúdo do app)

| Tela | Resposta |
|---|---|
| Política de privacidade | `https://mercadoflow.com/privacidade` |
| Acesso ao app | **Todas ou algumas funções exigem acesso especial** → informar a conta de demonstração (passo 6) |
| Anúncios | **Não**, o app não tem anúncios |
| Classificação do conteúdo | Questionário: categoria "Utilitário, produtividade, comunicação ou outro". Responder **não** para violência, sexo, drogas, apostas. Tem interação entre usuários? **Não**. Compartilha localização? **Não**. Compras digitais? **Não** |
| Público-alvo | **18 anos ou mais** |
| App de notícias | Não |
| Apps governamentais | Não |
| Recursos financeiros | Nenhum |
| Saúde | Nenhum |
| Exclusão de conta | Pode criar conta no app: **Sim**. Link: `https://mercadoflow.com/privacidade#exclusao`. No app: Conta › Excluir minha conta |

### Segurança dos dados

Confirmado no código: o app não tem SDK de anúncios nem de estatística (sem Google Analytics, Firebase, Sentry etc.). Tudo é enviado criptografado (HTTPS). A pessoa pode pedir a exclusão.

| Tipo de dado | Coletado | Compartilhado | Finalidade | Obrigatório |
|---|---|---|---|---|
| Informações pessoais › Nome | Sim | Não | Funcionalidade do app, Gerenciamento da conta | Obrigatório |
| Informações pessoais › E-mail | Sim | Não | Funcionalidade do app, Gerenciamento da conta, Comunicações do desenvolvedor | Obrigatório |
| Informações pessoais › Telefone | Sim | Não | Funcionalidade do app (telefone da loja e dos fornecedores) | Opcional |
| Informações pessoais › Outras informações (CNPJ do mercado) | Sim | Não | Funcionalidade do app, Gerenciamento da conta | Opcional |
| Informações financeiras › Histórico de compras (vendas e compras da loja) | Sim | Não | Funcionalidade do app, Análises | Obrigatório |
| Atividade no app › Outras ações (o que a pessoa faz no painel) | Sim | Não | Funcionalidade do app, Segurança | Obrigatório |
| Fotos e vídeos | **Não** (o leitor de código de barras do Google lê na hora e não envia foto) | | | |
| Identificadores do dispositivo | **Não** | | | |
| Localização | **Não** | | | |

Os dados são processados de forma temporária? **Não**. São criptografados em trânsito? **Sim**. A pessoa pode pedir exclusão? **Sim**.

## 5. Versão de produção (Teste e lançamento › Produção)

1. **Criar nova versão**.
2. Enviar `C:\Users\fusea\.mercadoflow-gestao\mercadoflow-gestao-1.0.0.aab`.
3. Nome da versão: `1.0.0`
4. Notas da versão:
```
<pt-BR>
Primeira versão do MercadoFlow Gestão: o painel do seu mercado no celular, com vendas, estoque, compras, ofertas e equipe.
</pt-BR>
```
5. Países: **Brasil**.
6. **Revisar versão** › **Iniciar lançamento para produção**.

## 6. Conta de demonstração para o revisor (obrigatória)

O Google precisa entrar no app. Crie uma conta só para a revisão:
1. No site, crie a conta (ex.: `revisao.play@mercadoflow.com`) com um mercado de demonstração, sem autenticação em duas etapas.
2. Deixe dados de exemplo nela: alguns produtos, vendas e um pedido. **Não use dados de cliente.**
3. Em **Acesso ao app**, informe e-mail e senha e escreva:
```
Entre com o e-mail e a senha acima. A conta é de um mercado de demonstração.
Na tela Início aparecem as vendas. Em Produtos › Contar estoque, toque em "Bipar" para abrir o leitor de código de barras do Google.
O app não vende nada: a assinatura do MercadoFlow é contratada fora do app, e a tela "Assinatura e planos" só mostra o plano em uso.
```
Não coloque a senha neste repositório.

## Nova versão

```powershell
cd frontend
npm run android:gestao        # build das telas + cópia para o Android
cd android-gestao
$env:JAVA_HOME = "$env:USERPROFILE\.jdks\jdk-21.0.13.0.2+1"   # o Capacitor 7 exige Java 21
.\gradlew.bat bundleRelease
```
Antes, aumente `versionCode` (+1) e `versionName` em `frontend/android-gestao/app/build.gradle`. O arquivo sai em `frontend/android-gestao/app/build/outputs/bundle/release/app-release.aab`.

## Requisito no servidor

A API aceita o app porque `CORS_ORIGIN`, no `.env` da VPS (`/root/mercadoflow-web/.env`), inclui `https://localhost` (Android) e `capacitor://localhost` (iPhone). Se essa linha for refeita, mantenha as duas origens, senão o login do app para de funcionar.
