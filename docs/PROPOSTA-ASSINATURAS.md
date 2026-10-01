# MercadoFlow — assinaturas, planos e acessos: diagnóstico e proposta

Versão 1 · 01/10/2026

---

## 1. Resumo

Hoje o MercadoFlow vende **quatro coisas de quatro jeitos diferentes**:

| O que se vende | Como é cobrado |
|---|---|
| Plano | Stripe |
| Contrato de rede | Fatura manual no Stripe |
| Créditos de IA | Pix com confirmação manual |
| Leituras do Confere | Pix com confirmação manual |

Além disso, há **seis campos diferentes** dizendo se o cliente pode entrar. Não existe nenhum e-mail ou
aviso automático para o lojista. Inadimplência nunca vira consequência. O dono da loja não consegue
convidar a própria equipe. E não há "esqueci minha senha".

O código tem boas peças isoladas:
- limites por rede;
- carga histórica que não gasta cota;
- catálogo editável;
- painel do superadmin com contas no limite e redes suspeitas.

Falta o **produto** que amarra essas peças: um jeito único de assinar, pagar, mudar de plano, convidar
pessoas e ser avisado.

A proposta tem cinco pilares:

1. **Um catálogo só.** Planos que já incluem Copiloto e créditos, e adicionais (recarga de créditos,
   loja extra, usuário extra) no mesmo carrinho.
2. **Uma assinatura só por cliente.** Uma máquina de estados (teste → ativa → em atraso → restrita →
   cancelada), automática do começo ao fim.
3. **Cobrança brasileira automática.** Pix Automático, boleto e cartão confirmados por webhook, régua
   de cobrança automática e nota fiscal de serviço emitida sozinha. Nenhum "confirmar pagamento" manual.
4. **Equipe na mão do dono.** Convite por e-mail ou WhatsApp, papéis por função (dono, gerente,
   comprador, conferente, financeiro) e acesso por loja da rede.
5. **Avisos em todo momento que importa.** No app, por e-mail e por WhatsApp: boas-vindas, teste
   acabando, limite chegando, pagamento falhou, conta restrita.

Antes de tudo, há **cinco correções urgentes** (seção 6), independentes da decisão de produto. Duas
delas mexem com dinheiro.

---

## 2. Como está hoje

### 2.1 O que se vende e como se paga

| Produto | Onde está | Como paga | Quem libera |
|---|---|---|---|
| **Plano** (Gratuito, Essencial R$ 197, Profissional R$ 397, Rede sob medida) | `plan_catalog` + enum `PlanType` | Stripe Checkout (cartão e boleto) | Webhook do Stripe |
| **Contrato de rede** | `network_contracts` + `network_invoices` | Fatura avulsa no Stripe, criada à mão | Superadmin |
| **Créditos de IA** (pacotes) | `ai_plans` + `ai_orders` | Pix "copia e cola" na chave da plataforma | **Superadmin confere o extrato e clica "Confirmar pagamento"** |
| **Leituras do Confere** | `confere_plans` + `confere_orders` | Pix "copia e cola" | **Superadmin confirma à mão** |
| **Copiloto** (R$ 79 / R$ 199 na proposta de IA) | — | Não existe no catálogo | — |

Para o lojista são quatro lugares diferentes para comprar, sem um extrato único. Para a operação são
dois tipos de pagamento que dependem de alguém olhar o banco.

### 2.2 Os planos

| | Gratuito | Essencial | Profissional | Rede |
|---|---|---|---|---|
| Preço | 0 | R$ 197 | R$ 397 | sob medida |
| Notas por semana* | 1.000 | 15.000 | 50.000 | negociado |
| Lojas | 1 | 1 | 3 | negociado |
| PDVs (por loja / total) | 1 / 1 | 3 / 3 | 4 / 10 | negociado |
| Usuários | 2 | 5 | 15 | negociado |
| Histórico | 90 dias | 1 ano | 2 anos | negociado |
| Nível de inteligência | básico | completo | avançado | avançado |

\* No banco o campo se chama `monthly_invoice_limit`, mas o ciclo virou **semanal** em 11/08/2026. A
página de planos diz "por semana" e o campo diz "mês".

O que diferencia de verdade o Essencial do Profissional mora **no código** (`PlanService`):
- previsão de 30 contra 90 dias;
- inteligência de rede;
- clientes;
- simulação de preço;
- exportação;
- histórico de resultados.

Nada disso aparece na página de planos: os destaques listam só limites. O cliente vê "Profissional =
mais notas e mais PDVs" e paga o dobro sem saber por quê.

Também há **duas fontes de verdade**. Limites e preço vêm do `plan_catalog` (editável no painel), mas
a escada de recursos vem do enum. Mudar o que um plano dá exige deploy, e o painel não mostra isso.

### 2.3 O estado da conta: seis campos para uma pergunta

Para responder "este cliente pode entrar e o que ele vê?", o sistema consulta:

| Campo | Quem escreve | Quem lê |
|---|---|---|
| `markets.is_active` | superadmin, Stripe | login |
| `markets.billing_status` (PENDING, ACTIVE, TRIAL, PAST_DUE, SUSPENDED, CANCELLED) | superadmin, Stripe, régua | login (só PENDING/SUSPENDED/CANCELLED), relatórios |
| `markets.access_expires_at` | superadmin | login (bloqueia sem explicar) |
| `markets.trial_ends_at` | superadmin | painel (nada acontece quando vence) |
| `markets.stripe_status` + `cancel_at_period_end` + `current_period_end` | webhook | quase ninguém |
| `markets.plan_type` | superadmin, Stripe | limites |

Cada caminho decide de um jeito, e as regras divergem:
- o **login** bloqueia por data de acesso;
- o **painel** mostra "EXPIRING_SOON";
- o **Stripe** pode dizer `past_due` enquanto o `billing_status` diz `ACTIVE`, se a mudança veio por
  outro caminho.

### 2.4 Cobrança e inadimplência

**Upgrade, downgrade e cancelamento.** Ficam no portal do Stripe, fora do app. O checkout é sempre
uma assinatura nova (ver 6.1).

**Inadimplência:**
- **No plano (Stripe):** o status `past_due` mantém o plano pago **para sempre**. Nada rebaixa, nada
  restringe e o lojista não é avisado pelo MercadoFlow.
- **Régua de cobrança** (`DunningService`, todo dia às 9h): cobre **só as faturas de rede**. Ela
  reenvia a fatura pelo Stripe, abre tarefa no CRM e anota "avaliar suspensão". Bloquear é decisão
  humana, por escolha.

**Comunicação.** **Não existe envio de e-mail no sistema.** Os únicos e-mails que o cliente recebe
são os do próprio Stripe.

**Período de teste.** Só existe se o superadmin marcar a conta como TRIAL à mão. Todo cadastro cai
direto no Gratuito. Quando o `trial_ends_at` vence, nada acontece.

**Nota fiscal de serviço.** Não é emitida pelo sistema.

### 2.5 Acesso e equipe

**Papéis existentes:** SUPER_ADMIN, ADMIN, MARKET_OWNER, MARKET_MANAGER e INDUSTRY_USER.

**Dono e gerente são quase iguais.** Das 26 rotas da loja, só 3 são exclusivas do dono:
- cobrança;
- chave de IA própria;
- inteligência de rede.

Não há papel para:
- quem só confere mercadoria (o conferente do Confere);
- quem só compra;
- quem só cuida do financeiro;
- acesso limitado a uma loja da rede.

**O dono não gerencia a equipe.** Não há tela de usuários na loja; usuário novo é criado pelo
superadmin. O limite de usuários do plano é verificado (`canAddUser`), mas não há onde o lojista
adicionar alguém.

**Não há "esqueci minha senha".** Quem esquece depende do suporte.

**Conta expirada.** Quando o acesso vence, o login simplesmente falha, como se a senha estivesse
errada. O lojista não sabe que precisa pagar.

### 2.6 O que já está bom e deve ser mantido

- Limites apurados sobre a **rede inteira** (matriz + filiais) e detecção de CNPJ raiz repetido.
- **Carga histórica não gasta cota:** nota emitida antes do primeiro envio entra sempre.
- Ciclo **semanal** de notas, que devolve capacidade toda segunda.
- **Catálogo editável** com histórico de preço e preço antigo preservado para quem já assina.
- **Webhook do Stripe idempotente** (`stripe_processed_events`).
- No superadmin:
  - overrides por cliente;
  - lista de contas gratuitas no limite;
  - redes suspeitas;
  - contratos de rede;
  - CRM com tarefas;
  - relatório de MRR.
- A régua de cobrança **não repete ações** (registro por fatura e regra).

---

## 3. Problemas, por gravidade

### Críticos (dinheiro ou bloqueio indevido)

| # | Problema | Efeito |
|---|---|---|
| C1 | O checkout sempre cria **assinatura nova**, mesmo para quem já assina | Quem passa do Essencial para o Profissional fica com **duas assinaturas cobrando** |
| C2 | `past_due` **eterno** no plano | Quem para de pagar segue com o plano pago indefinidamente; ninguém é avisado |
| C3 | **Pix manual** em créditos de IA e Confere | O lojista paga e espera alguém conferir o extrato. Nada é liberado à noite ou no fim de semana, e o risco de erro e fraude cresce |
| C4 | **Sem "esqueci minha senha"** e login que falha sem explicar (acesso vencido) | Lojista travado vira chamado de suporte, ou desiste |

### Produto confuso

| # | Problema | Efeito |
|---|---|---|
| P1 | Quatro produtos, quatro caixas | O lojista não entende o que está pagando; a operação concilia quatro trilhos |
| P2 | Copiloto (IA) fora do catálogo de planos | A proposta de IA prevê Copiloto R$ 79 e Pro R$ 199, mas não há onde vender |
| P3 | Diferença entre os planos escondida no código | O Profissional parece "mais do mesmo" pelo dobro do preço |
| P4 | Métrica de limite técnica ("notas fiscais por semana") | O dono não pensa em notas; ele pensa em lojas, caixas e pessoas |
| P5 | "Mensal" no banco, "semanal" na tela | Confunde quem configura o plano |
| P6 | Período de teste inexistente para os planos pagos | Não há como experimentar o Essencial antes de pagar |

### Automação ausente

| # | Problema |
|---|---|
| A1 | Nenhum aviso automático: boas-vindas, teste acabando, 80% do limite, pagamento falhou, conta restrita |
| A2 | Régua de cobrança só para rede, e ela não age (só anota) |
| A3 | Contas no limite viram lista para o superadmin abordar à mão; o app não oferece o próximo plano na hora |
| A4 | Fatura e nota fiscal de serviço não são emitidas nem guardadas para o cliente baixar |
| A5 | Seis campos de estado com regras espalhadas e divergentes |

### Acesso

| # | Problema |
|---|---|
| X1 | O dono não convida nem remove a própria equipe |
| X2 | Papéis só "dono" e "gerente", quase iguais |
| X3 | Sem acesso por loja numa rede (o gerente da filial vê a matriz) |
| X4 | Sem transferência de titularidade (o dono vendeu a loja ou saiu da empresa) |

---

## 4. Princípios da proposta

1. **O lojista compra resultado, não infraestrutura.** O limite que ele vê é loja, caixa, pessoa e
   crédito de IA. Notas viram proteção técnica contra abuso, invisível no uso normal.
2. **Uma conta, uma assinatura, um extrato.** Plano e adicionais no mesmo carrinho e na mesma fatura.
3. **Nada de "confirmar pagamento" manual.** O pagamento confirma por webhook e libera na hora.
4. **Inadimplência tem consequência, mas nunca apaga dados.** Carência, depois restrição (só
   leitura), nunca exclusão.
5. **Toda mudança de estado gera aviso e registro:** aviso para o lojista e registro para a auditoria.
6. **Uma fonte de verdade.** Preço, limites **e recursos** de cada plano no catálogo editável.

---

## 5. A proposta

### 5.1 Produto: um catálogo só

Os planos passam a **incluir o Copiloto e uma cota mensal de créditos de IA**. Quem quer mais compra
**adicionais** no mesmo carrinho.

| | **Grátis** | **Essencial** | **Profissional** | **Rede** |
|---|---|---|---|---|
| Para quem | Experimentar e conferir mercadoria | Loja única | Até 3 lojas | 4+ lojas |
| Preço (hipótese) | R$ 0 | R$ 197 | R$ 397 | sob medida |
| Lojas | 1 | 1 | 3 | negociado |
| Caixas | 1 | 3 | 10 | negociado |
| Pessoas | 2 | 5 | 15 | negociado |
| Confere | grátis com certificado A1 | grátis com certificado A1 | grátis com certificado A1 | grátis com certificado A1 |
| Inteligência | o presente da loja | análise completa | + rede, clientes, simulação | tudo |
| Copiloto | resumo do dia e voz | + perguntas e agentes nível 2 | + WhatsApp e nível 3 | tudo |
| Créditos de IA por mês | 50 | 500 | 1.500 | negociado |
| Teste grátis | — | 14 dias, sem cartão | 14 dias, sem cartão | piloto negociado |

**Adicionais**, comprados a qualquer momento e cobrados na mesma assinatura:
- recarga de créditos de IA (pacotes da proposta de IA);
- loja extra;
- usuário extra;
- leituras do Confere sem certificado.

**Mudanças de raciocínio:**

1. **Copiloto dentro do plano, e não como produto à parte.** A proposta de IA previa Copiloto R$ 79
   e Pro R$ 199 avulsos. Embutir nos planos atuais dá ao Essencial e ao Profissional um motivo
   visível de preço, e a recarga de créditos vira a receita variável. *Decisão do dono (seção 9).*
2. **Notas por semana saem da vitrine.** Continuam como teto técnico (proteção contra abuso), com um
   teto alto o bastante para que uma loja do porte do plano nunca o sinta. A página de planos fala de
   lojas, caixas, pessoas e o que o sistema faz.
3. **A página de planos mostra recursos, não só limites.** Os recursos saem do código e vão para o
   catálogo (seção 5.6). Cada plano lista o que faz, com um "Por que o Profissional?" claro.

### 5.2 Uma assinatura só, com estados claros

Uma tabela nova, `subscriptions`, vira **a** resposta para "pode entrar e o que vê". Ela substitui os
seis campos espalhados:

```
                 cadastro
                    │
        ┌───────────┴────────────┐
        ▼                        ▼
     GRÁTIS ◄──────────────── TESTE (14 dias)
        ▲  upgrade               │ pagou
        │                        ▼
        │                     ATIVA ◄─────────── pagamento confirmado
        │                        │ cobrança falhou
        │                        ▼
        │                    EM ATRASO (carência de 7 dias: tudo funciona, avisos diários)
        │                        │ 7 dias sem pagar
        │                        ▼
        │                    RESTRITA (só leitura: vê os dados, IA e agentes pausados,
        │                        │      nada novo é processado além do Confere)
        │  30 dias restrita      │
        └────────────────────────┘ (volta ao Grátis; dados preservados)

   CANCELADA a pedido: continua ATIVA até o fim do período pago e depois vai para GRÁTIS.
   SUSPENSA (superadmin, fraude ou abuso): sem acesso, com motivo visível no login.
```

Cada transição tem quatro coisas:
- **gatilho automático:** webhook de pagamento ou job diário;
- **aviso ao lojista:** no app, por e-mail e por WhatsApp;
- **registro:** `subscription_events`, que já existe;
- **regra de acesso única:** um serviço `AccessPolicy` que o login, o app e as rotas consultam.

A carência e os prazos (7 e 30 dias) ficam **configuráveis no superadmin**.

O login nunca falha em silêncio. Conta restrita entra e vê um aviso claro com o botão de pagar. Conta
suspensa vê o motivo e o contato.

### 5.3 Cobrança brasileira automática

**A descoberta que muda a escolha do meio de cobrança:** com conta brasileira, o Stripe aceita Pix
**só para pagamento único**. O **Pix Automático** (recorrente) **não está disponível para contas Stripe
no Brasil**. Já o Asaas oferece Pix Automático para assinatura desde maio de 2026, e a maior parte dos
bancos já suporta a modalidade.

| | Stripe (hoje) | Gateway brasileiro (ex.: Asaas) |
|---|---|---|
| Cartão recorrente | sim | sim |
| Boleto | sim (com atraso de compensação) | sim |
| **Pix recorrente (Pix Automático)** | **não, para conta do Brasil** | **sim** |
| Pix avulso (recarga de créditos) | sim | sim |
| Nota fiscal de serviço automática | não | sim (integra com prefeituras) |
| Régua de cobrança com e-mail, SMS e WhatsApp | e-mails do Stripe | nativa |
| Custo de referência | cartão ~4% | cartão ~2,99%; Pix ~R$ 0,49 |

**Recomendação:** um **gateway brasileiro como meio principal** (Pix Automático, boleto e cartão,
nota fiscal e régua nativa), atrás de uma camada `BillingProvider` no código. O Stripe continua
atendendo quem já está nele e fica como alternativa para cartão. O supermercadista paga fornecedor por
Pix e boleto; cartão corporativo é minoria.

**O que deixa de ser manual:**
- Pix de créditos de IA e de leituras do Confere: cobrança pelo gateway, liberação pelo webhook em
  segundos. Some o botão "Confirmar pagamento" do superadmin, que fica só para exceções.
- Contratos de rede: cobrança recorrente no gateway com valor negociado, sem fatura avulsa à mão.
- Nota fiscal de serviço emitida a cada pagamento e guardada na tela "Minha assinatura".

**Mudança de plano dentro do app:** prévia do valor proporcional antes de confirmar. Upgrade vale na
hora; downgrade vale no próximo ciclo. Fica corrigido o problema C1.

### 5.4 Avisos automáticos

Uma central de comunicação única, que reaproveita o canal WhatsApp do Copiloto e acrescenta e-mail
transacional (Amazon SES, Resend ou similar, com domínio próprio e SPF/DKIM).

| Momento | No app | E-mail | WhatsApp |
|---|---|---|---|
| Cadastro | boas-vindas e primeiros passos | sim | — |
| Teste: faltam 3 dias e 1 dia | faixa no topo | sim | sim |
| 80% e 100% de um limite | faixa + "ver planos" com o próximo plano pré-selecionado | sim | — |
| Pagamento confirmado + nota fiscal | — | sim | — |
| Pagamento falhou | faixa vermelha + "pagar agora" (Pix na hora) | sim | sim |
| Atraso: dias 1, 3, 5 e 7 | faixa | sim | sim |
| Conta restrita | tela de aviso no login | sim | sim |
| Convite de equipe | — | sim | sim |
| Esqueci a senha | — | sim | — |
| Créditos de IA acabando (20%) | faixa | sim | — |

Os textos ficam como modelos editáveis no superadmin, com variáveis do tipo {nome}, {plano} e
{valor}. Respeitam o aceite do WhatsApp (opt-in) e o horário de silêncio que já existem.

### 5.5 Equipe e acesso

**Tela "Equipe" para o dono:**
- convidar por e-mail ou WhatsApp, com link de aceite válido por 7 dias;
- escolher o papel e as lojas;
- desativar e reativar;
- reenviar o convite;
- ver o último acesso;
- ver o contador de usuários do plano, com "comprar usuário extra" quando lotar.

**Papéis por função:**

| Papel | O que faz | Não faz |
|---|---|---|
| **Dono** | tudo, incluindo assinatura e equipe | — |
| **Gerente** | operação completa da loja: inteligência, Copiloto, compras, promoções | assinatura, equipe |
| **Comprador** | compras, pedidos, fornecedores, Copiloto de compras | preço, assinatura, equipe |
| **Conferente** | só o Confere (ler nota, conferir, avisar fornecedor) | o resto do app |
| **Financeiro** | assinatura, faturas e notas fiscais, extrato de créditos | operação |
| **Leitura** | ver painéis e relatórios | qualquer ação |

**Acesso por loja na rede.** O gerente da filial vê só a filial; o dono e o comprador central veem a
rede.

**Também entram:**
- **"Esqueci minha senha"** por e-mail, com link de uso único e válido por 30 minutos;
- **transferência de titularidade** com confirmação dos dois lados;
- **verificação em duas etapas** opcional para o dono e o financeiro.

Por baixo, as permissões viram uma lista (`permissions`) por papel. Assim a rota pergunta "pode
comprar?" em vez de "é dono ou gerente?". Criar papel novo não exige mexer em rota.

### 5.6 Uma fonte de verdade para o que cada plano dá

O catálogo (`plan_catalog`) ganha uma tabela de **recursos por plano** (`plan_features`):

| Tipo de recurso | Exemplos |
|---|---|
| Liga/desliga | rede, clientes, simulação, exportação, WhatsApp, autonomia |
| Número | previsão em dias, histórico, créditos de IA por mês |
| Limite | lojas, caixas, pessoas |

O código pergunta ao `Entitlements` ("este mercado tem `simulacao_preco`?") em vez de ler o enum.
A página de planos lê o mesmo catálogo, então o que é vendido é o que é entregue. O superadmin muda um
recurso de plano sem deploy, com registro em auditoria e efeito só para novos assinantes ou para
todos (escolhido na hora).

### 5.7 "Minha assinatura" para o lojista

Uma tela só, no lugar de Planos + Créditos de IA + Créditos do Confere:

- plano atual, estado (em teste até..., ativa, em atraso), próximo pagamento, forma de pagamento;
- uso: lojas, caixas e pessoas, e créditos de IA com o que vence e o que sobra;
- **mudar de plano** com comparação e prévia do valor;
- **comprar adicionais** (créditos, loja, usuário) no mesmo carrinho;
- faturas e notas fiscais para baixar;
- trocar a forma de pagamento (Pix Automático, cartão, boleto);
- **cancelar** com pesquisa de motivo e oferta de **pausa por 1 ou 2 meses**, para lojas sazonais.

### 5.8 Superadmin: menos clique, mais visão

**O que fica e melhora:** contas, overrides, CRM, contratos de rede e redes suspeitas.

**Painel de receita:**
- receita recorrente (MRR) por plano e por adicional;
- receita de créditos;
- churn;
- conversão de teste para pago;
- inadimplência por idade;
- previsão do mês.

**Ficha da conta:** histórico completo (`subscription_events` + pagamentos + avisos enviados), com
ações rápidas auditadas:
- prorrogar o teste;
- dar cortesia de X dias;
- conceder créditos;
- mudar de plano sem cobrar.

**Políticas configuráveis:**
- dias de teste;
- carência;
- dias de restrição até voltar ao Grátis;
- modelos de aviso.

**Fila de exceções:** só o que o automático não resolveu (pagamento contestado, nota fiscal recusada
pela prefeitura, rede pedindo condição especial).

---

## 6. Correções urgentes (antes de tudo)

Independentes das decisões de produto, pequenas e com risco alto se ficarem:

| # | Correção | Por quê |
|---|---|---|
| 6.1 | Checkout com assinatura existente passa a **trocar o plano da assinatura atual** (com proporcional), em vez de criar outra | Evita cobrança dupla (C1) |
| 6.2 | `past_due` com **prazo**: 7 dias de carência, depois restrição só leitura; aviso no app desde o primeiro dia | Fecha o plano pago eterno (C2) |
| 6.3 | **"Esqueci minha senha"** (link por e-mail, uso único, 30 min) | Destrava o lojista sem suporte (C4) |
| 6.4 | **Login explica** conta vencida, suspensa ou pendente, com o que fazer | Hoje parece senha errada (C4) |
| 6.5 | Renomear `monthly_invoice_limit` para semanal no código e na tela, e alinhar os textos | Fim do "mês" que é semana (P5) |

A 6.3 exige e-mail transacional. Ele é a primeira peça do pilar de avisos.

---

## 7. Plano de implantação

| Fase | Entrega | Pronto quando |
|---|---|---|
| **S0 · Urgentes** (1 semana) | 6.1 a 6.5 + e-mail transacional | Upgrade sem cobrança dupla; atraso com prazo; senha recuperável |
| **S1 · Estado único** (2 semanas) | Tabela `subscriptions`, `AccessPolicy`, jobs de teste/carência/restrição, migração dos seis campos | Toda regra de acesso num lugar só; testes cobrindo cada transição |
| **S2 · Cobrança brasileira** (3 semanas) | `BillingProvider` + gateway brasileiro (Pix Automático, boleto, cartão, nota fiscal), recarga de créditos e Confere sem confirmação manual | Pix confirma sozinho; nota fiscal emitida; Stripe segue para quem já assina |
| **S3 · Catálogo e Minha assinatura** (2 semanas) | `plan_features`, `Entitlements`, página de planos nova, "Minha assinatura", adicionais no mesmo carrinho, teste de 14 dias | O que se vende é o que se entrega; tudo comprável no app |
| **S4 · Equipe** (2 semanas) | Tela Equipe, convites, papéis por função, acesso por loja, transferência de titularidade, verificação em duas etapas | O dono monta a equipe sozinho; o conferente só vê o Confere |
| **S5 · Avisos e painel** (2 semanas) | Central de avisos (app, e-mail, WhatsApp), modelos editáveis, painel de receita, fila de exceções | Nenhum aviso manual; MRR e churn à vista |

A ordem protege dinheiro primeiro (S0 e S1). Em seguida tira o trabalho manual (S2), depois melhora
a venda (S3 e S5) e, por fim, a equipe (S4).

---

## 8. Como medir

| Métrica | Hoje | Alvo |
|---|---|---|
| Pagamentos confirmados à mão por semana | todos os Pix | 0 (só exceções) |
| Tempo entre pagar e liberar crédito | horas a dias | < 1 minuto |
| Chamados de "não consigo entrar" | — | −80% |
| Conversão Grátis → pago em 60 dias | — | medir e subir |
| Conversão teste → pago | não existe teste | > 25% (hipótese) |
| Inadimplência acima de 30 dias | não medida | < 3% da receita |
| Contas com mais de 1 usuário | baixo (só via superadmin) | maioria das pagas |

---

## 9. Decisões que ficam com o dono

1. **Copiloto embutido nos planos** (recomendado) ou vendido à parte como na proposta de IA
   (R$ 79 / R$ 199)?
2. **Créditos de IA inclusos por plano:** 50 / 500 / 1.500 por mês (hipótese) ou outro valor?
3. **Gateway brasileiro como principal** (recomendado, por causa do Pix Automático e da nota fiscal)
   ou continuar só com o Stripe?
4. **Teste de 14 dias sem cartão** nos planos pagos (recomendado) ou só o Grátis?
5. **Carência de 7 dias e restrição só leitura** depois disso (recomendado), ou outro prazo?
6. **Notas por semana fora da vitrine** (recomendado), mantidas só como proteção técnica?
7. **Pausa da assinatura** (1 a 2 meses) como alternativa ao cancelamento?

---

## Fontes

- [Stripe: pagamentos com Pix](https://docs.stripe.com/payments/pix) (Pix Automático indisponível para
  contas Stripe no Brasil; Pix avulso disponível)
- [Asaas: Pix Automático, cobranças recorrentes automatizadas](https://docs.asaas.com/changelog/pix-autom%C3%A1tico-cobran%C3%A7as-recorrentes-automatizadas)
- [Asaas: diferença entre Pix Automático e assinaturas](https://docs.asaas.com/docs/diferen%C3%A7a-entre-pix-autom%C3%A1tico-e-assinaturas-1)
- [Pix Automático para SaaS: guia 2026](https://forjadesistemas.com.br/blog/pix-automatico-recorrencia-saas-proprio-2026/)
- [Gateways de pagamento no Brasil em 2026: comparativo](https://mindconsulting.com.br/2026/07/gateways-pagamento-online-brasil-comparativo-2026/)
- Código analisado:
  - `PlanType`, `PlanService`, `StripeService`, `DunningService`, `CustomUserDetailsService`,
    `AuthService`, `SuperAdminService`;
  - migrações V15, V33–V37, V58 e V61;
  - telas `Plans.tsx`, `SuperAdminSubscriptions.tsx` e `Settings.tsx`.
