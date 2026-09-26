# 02 — Tese de produto: três direções

Data: 2026-09-26 · Fase: Prompt 2 · Base: `01`, `03` e decisões D-001…D-023

Nada aqui é requisito aprovado. São **apostas comparadas**; a escolha é do owner no Gate 2.
Não há dado de uso real (D-009), então impacto e esforço são qualitativos (baixo/médio/alto) e cada
um explicita sua hipótese.

---

## 1. Restrições que as três direções respeitam

| Restrição | Origem |
|---|---|
| Cliente: mercado independente **e** rede pequena; operador = comprador; celular primeiro | D-006, D-016, D-017, D-018 |
| Sem NF de entrada, sem controle de estoque; compra por **desempenho de venda** | D-019 |
| Aceitar COMPRAR vai direto ao rascunho do pedido, com desfazer | D-011 |
| Pedido sai por WhatsApp, PDF/e-mail, portal ou lista para o representante | D-012 |
| Notificação só por push (PWA) | D-020 |
| Ativação primeiro; menos telas; Painel + Central = 1 tela; sem Alertas | D-014, D-021 |
| Estúdio de ofertas volta como ferramenta independente | D-013 |
| Mapa da loja reinventado | D-022 |
| Gratuito, R$ 197 e R$ 397 mantidos; Gratuito sem fachada | D-023 |
| IA opcional (BYOK) e nunca caminho crítico; monólito na VPS compartilhada | D-005, protocolo §2.4 |

## 2. A hipótese "fluxo com direção" diante da evidência

> O MercadoFlow deve organizar um fluxo de trabalho e decisão — situação, exceções, prioridade e próxima
> melhor ação — com explicação e controle.

| Parte | Evidência | Veredito |
|---|---|---|
| Situação e exceções | oportunidades, anomalias, ritmo da loja já calculados | **se sustenta** |
| Próxima melhor ação | recomendação com `ActionType`, impacto e confiança | **se sustenta**, mas a ação mais frequente (COMPRAR) se apoia em estoque teórico, que D-019 invalida |
| Explicação e controle | evidência numérica + texto determinístico; aceitar/rejeitar | **parcial**: falta desfazer e a ação não acontece |
| Fluxo | 14 destinos no menu, dois conceitos de atenção, ação fora do app | **não se sustenta hoje**: o usuário recebe informação, não um fluxo |

**Conclusão:** a hipótese vale, com um ajuste. O "fluxo com direção" do MercadoFlow é específico:
**da venda de ontem ao pedido de hoje**. A direção não é "mostrar mais inteligência", é **encurtar o caminho
entre o que vendeu e o que o comprador envia ao fornecedor**, e depois entre o que está parado e o que
a loja promove.

## 3. Direção A — "Compra guiada pela venda" (copiloto do comprador)

| Campo | Conteúdo |
|---|---|
| Público primário | comprador/encarregado de loja independente ou de rede pequena, no celular |
| Problema prioritário | montar o pedido certo (o quê e quanto) sem planilha e sem controlar estoque |
| Promessa de valor | "Abra o app, veja o que repor e em que quantidade pelo que vendeu, ajuste e mande ao fornecedor em minutos." |
| Momento de ativação | **primeiro pedido sugerido** gerado com as vendas reais da loja e enviado (compartilhado) pelo comprador |
| Core loop | vendas → **"Hoje"** (feed único) → sugestão de reposição por fornecedor → aceitar (vai ao rascunho) → ajustar → enviar (WhatsApp/PDF/portal/representante) → próximo ciclo mede o vendido desde este pedido → push quando for hora de pedir de novo |
| Modelo de quantidade (hipótese) | **reposição pelo vendido**: vendido desde o último pedido daquele fornecedor, corrigido por tendência, sazonalidade semanal/calendário e cesta. Não exige estoque. No primeiro pedido, usa a janela equivalente ao ciclo informado ("peço a cada N dias") |
| Diferencial defensável | sugestão calculada **das NFC-e do próprio caixa**, item a item, sem digitação e sem ERP; aprende com o resultado de cada pedido (outcomes já existem) |
| Preservar | ingestão/agente, `ExpectedDemandService`, `SeasonalCalendarService`, `StoreRhythmService`, `SalesAnomalyDetector`, cesta/halo, `SupplierOrder`, outcomes, gating de plano, RLS |
| Unificar | Painel do dia + Central de Inteligência + Resumo semanal → **Hoje**; "Onde investir" + Lista + Pedidos + Fornecedores → **Comprar** |
| Reduzir/remover da navegação | Alertas (vira oportunidade ou some); tela órfã `SupplierOrders`; 4 telas órfãs de ofertas; "Pergunte aos dados" vira botão global, não destino |
| Adiar | Mapa da loja (reinvenção vem na direção B), preços estaduais, indústria |
| Rever | oportunidades baseadas em estoque teórico (`EXCESSO_DE_ESTOQUE`, `CAPITAL_PARADO`, compra por cobertura) → substituir por sinais de venda: **queda de giro**, **produto sem venda há X dias**, **ruptura provável** (venda que para abruptamente num item de giro alto: sinal de falta na gôndola) |
| Dados necessários | NFC-e (existe); vínculo produto → fornecedor (existe `Supplier`; cobertura na loja DESCONHECIDA); ciclo de pedido por fornecedor (**novo, informado pelo usuário**); data do último pedido (vem do próprio uso) |
| Riscos de adoção | comprador desconfiar da quantidade; produto sem fornecedor cadastrado; primeiro ciclo sem histórico de pedido |
| Esforço técnico relativo | **médio**: reaproveita o motor; novo: feed único, modelo de reposição, ações no rascunho, saídas de pedido, PWA/push |
| Impacto em infraestrutura | baixo: sem serviço novo; push via Web Push no backend (sem fila); PDF gerado sob demanda |
| Validar antes de construir muito | (1) protótipo navegável do fluxo Hoje → Comprar → Enviar no celular com 3–5 compradores; (2) **teste "concierge"**: gerar à mão o pedido sugerido, a partir das vendas reais de uma loja (quando houver piloto), e comparar com o pedido que o comprador faria |

## 4. Direção B — "Loja que vende mais" (promoção, encarte e mapa)

| Campo | Conteúdo |
|---|---|
| Público primário | dono de loja independente que quer movimento e ticket maior |
| Problema prioritário | decidir o que promover, divulgar e onde expor |
| Promessa de valor | "O app mostra o que promover, gera o encarte pronto e diz onde colocar na loja." |
| Momento de ativação | primeiro encarte gerado com produtos sugeridos pelas vendas |
| Core loop | vendas → o que promover (halo, combos, queda de giro) → campanha → encarte/post (estúdio) → exposição no **mapa** → efetividade medida → próxima campanha |
| Diferencial defensável | a promoção nasce da cesta real (halo e combo calculados das notas) e o resultado é medido; o encarte visual reforça o valor percebido |
| Preservar | estúdio de ofertas, `PromoIntelligence`, `PromoEffectiveness`, `CampaignImpact`, halo, cesta, render FFmpeg |
| Unificar | Promoções + Estúdio + Mapa da loja → **Vender** |
| Reinvenção do mapa (D-022, hipótese) | **"Montar a loja andando"**: no celular, o usuário percorre a loja e registra corredor por corredor numa **lista vertical** (Entrada → Corredor 1: Bebidas, Mercearia → …), com foto opcional. O mapa é **gerado**, não desenhado em grade. Visualização em faixas coloridas pelo desempenho de venda da categoria e sugestões do tipo "coloque X perto de Y" (cesta). Sem arrastar células, pensado para o polegar |
| Adiar | parte do pedido (fica o que existe), rede |
| Dados necessários | notas (existe), catálogo com imagens (existe), marca da loja (brand kit existe), layout por corredores (novo formato) |
| Riscos de adoção | promoção é decisão eventual, menos recorrente que compra; encarte compete com ferramentas gratuitas (Canva, fornecedor); render consome CPU na VPS |
| Esforço técnico relativo | **médio a alto**: estúdio pronto, mas integração, reinvenção do mapa e custo de render |
| Impacto em infraestrutura | **médio**: render com FFmpeg sob demanda disputa as 2 vCPU; precisa de fila limitada, que já existe (`OfferGenerationJob`), e teto de CPU |
| Validar | protótipo do "montar a loja andando" com 3–5 donos em loja real; medir se um encarte gerado é usado de fato (publicado/impresso) |

## 5. Direção C — "Rede na palma da mão" (visão de negócio multiloja)

| Campo | Conteúdo |
|---|---|
| Público primário | dono de rede pequena (2–3 lojas) no celular |
| Problema prioritário | comparar lojas e saber qual está indo mal, em quê |
| Promessa de valor | "Suas lojas lado a lado: o que vende numa e falta na outra, e o que mudou nesta semana." |
| Momento de ativação | segunda loja conectada e primeira comparação |
| Core loop | vendas de N lojas → comparação semanal → divergências (produto que gira numa e não na outra) → ação (compra/transferência/promoção) → resultado |
| Diferencial defensável | comparação item a item entre lojas vinda do caixa, sem ERP comum |
| Preservar | `NetworkIntelligenceService`, `NetworkContract`, resumo semanal, plano Profissional (3 filiais) |
| Unificar | "Semana e rede" vira filtro "todas as lojas / esta loja" em Hoje e Produtos |
| Adiar | encarte, mapa |
| Riscos de adoção | exclui a loja única, a maior parte da base-alvo (D-006); a ativação depende de 2+ lojas instaladas; valor só aparece depois |
| Esforço técnico relativo | médio |
| Impacto em infraestrutura | baixo a médio (consultas agregadas por rede) |
| Validar | entrevistar 3 donos de rede pequena sobre como comparam lojas hoje |

## 6. Matriz comparativa

| Direção | Impacto | Evidência | Esforço | Risco | Custo operacional | Reversibilidade |
|---|---|---|---|---|---|---|
| A — Compra guiada pela venda | **alto**: ataca o job principal (J1), recorrente e ligado ao dinheiro | **média-alta**: é o foco declarado (D-003, D-019) e o motor de demanda existe; o predomínio de oportunidades de compra vem só do mercado de teste, não de uso real | médio | médio (confiança na quantidade) | baixo | alta (feed e ações atrás de flag; motor preservado) |
| B — Loja que vende mais | médio: decisão menos frequente | média (D-007/D-013/D-022 pedem, mas sem dado de uso) | médio a alto | médio (CPU de render, concorrência de ferramentas grátis) | médio | média |
| C — Rede na palma da mão | médio para o segmento, baixo para a base | média (D-017) | médio | alto (ativação depende de 2+ lojas) | baixo a médio | alta |

## 7. Recomendação

**Apostar em A como núcleo**, entregue em cima de uma **fundação comum** que as três direções exigem:

1. **Fundação** (independe da direção): ativação guiada do dono até a primeira nota (D-014); estado "sem dados"
   honesto; **nova arquitetura de informação** (§8); PWA instalável com push (D-020); correção da cota do
   Gratuito (§9).
2. **Núcleo A:** Hoje (feed único) → Comprar (reposição pelo vendido, aceitar vai ao rascunho, desfazer, enviar multicanal).
3. **Depois, de B:** mapa "montar a loja andando" e o estúdio de ofertas de volta ao menu (D-013), dentro de **Vender**.
4. **De C, no Profissional:** o filtro "todas as lojas" entra em Hoje e Produtos, sem tela própria.

Por que A é a melhor próxima aposta, e não uma verdade: é a única direção em que **o job é semanal ou diário,
o dado já existe, o motor já existe e o resultado é mensurável pelo próprio produto** (vendido desde o pedido).
O risco principal, a desconfiança na quantidade, é testável barato, com protótipo e concierge, antes de construir.
Se a validação mostrar que compradores não confiam na sugestão, B passa a ser a aposta de valor percebido.

## 8. Arquitetura de informação proposta (para as três direções)

Hoje: **14 destinos** no menu do mercado, 4 seções, dois conceitos de atenção. Proposta: **5 destinos** (barra inferior no celular).

| Destino | Absorve | Observação |
|---|---|---|
| **Hoje** | Painel do dia, Central de Inteligência (4 abas), Alertas, Resumo semanal, "Semana e rede" (como filtro) | um feed priorizado: fazer agora → acompanhando → resultados |
| **Comprar** | Pedido inteligente (Onde investir, Lista, Pedidos, Fornecedores), tela órfã `SupplierOrders` | pedido por fornecedor, enviar multicanal |
| **Produtos** | Catálogo (Boas duplas, Desempenho, Combos, Previsão), Detalhe do produto, Clientes/recompra | busca e ficha do produto como hub |
| **Vender** | Promoções (O que promover, Campanhas, Efetividade), Estúdio de ofertas (D-013), Mapa da loja (D-022) | a promoção e sua execução |
| **Loja** | PDVs e agente, Plano e consumo, Conta, IA/BYOK, catálogo global e preços estaduais (admin) | configuração e ativação |
| (global) | Pergunte aos dados | botão/ação disponível em qualquer tela, não um destino |

Efeito esperado (hipótese a medir quando houver uso): menos decisões de navegação por tarefa; a tarefa
principal (pedido) fica a um toque.

## 9. Escada de planos — análise e proposta (hipótese para o Gate 2)

### Achados que tornam o Gratuito "fachada" hoje

| Achado | Evidência | Efeito |
|---|---|---|
| Teto de 1.000 notas **por semana**, excedente **rejeitado** | `PlanService:271-280` | numa loja maior que o teto, a semana é cortada no fim, o período de maior venda; as recomendações passam a enxergar uma semana sem sábado |
| Página pública diz "por mês" | `PublicPlanController:74` | promessa diferente do comportamento |
| Recorte de 5 itens ainda no código | `PlanService:701` | contradiz o plano de agosto ("listas completas"); comportamento real a confirmar no Prompt 3 |
| Estrutura do Gratuito: 1 filial, 1 PDV, 2 usuários | `PlanType.FREE` | uma loja com 2+ caixas analisa só parte da venda |

### Princípio proposto

> **O Gratuito entrega o ciclo completo com dados verdadeiros, em escopo pequeno. Os pagos ampliam
> alcance, horizonte e execução.** Rejeitar notas distorce a inteligência; limitar escopo não.

| Recurso (direção A + fundação) | Gratuito | Essencial R$ 197 | Profissional R$ 397 |
|---|---|---|---|
| Ingestão | **todas as notas de 1 caixa**; o limite passa a ser estrutural (PDV), sem rejeição por volume | até 3 caixas | até 10 caixas, 3 lojas |
| Hoje (feed) | completo, horizonte de 7 dias | 30 dias | 90 dias + filtro "todas as lojas" |
| Pedido sugerido pelo vendido | **1 fornecedor ativo** (ciclo completo: sugerir → aceitar → enviar) | fornecedores ilimitados | idem + consolidado por rede |
| Envio do pedido | WhatsApp (texto) | + PDF/e-mail e lista para representante | + exportação para portal |
| Push | sim (é o que traz o usuário de volta) | sim | sim + por loja |
| Resultado das decisões | último pedido | resumo | histórico completo |
| Vender: promoções e efetividade | o que promover (visão) | campanhas + efetividade + encartes com limite mensal | encartes ilimitados + mapa com sugestões |
| Clientes/recompra, simulação de preço | — | — | sim |
| Pergunte aos dados | 3 exemplos determinísticos | BYOK | BYOK |

Todos os valores são **hipótese**; nenhum foi validado com cliente. A regra "bloqueado aparece contado, nunca
oculto" continua. O plano REDE (sob consulta) diante de D-017 é **DECISÃO NECESSÁRIA**.

## 10. Orçamento de recursos da recomendação (qualitativo)

| Recurso | Efeito esperado | Motivo |
|---|---|---|
| RAM/CPU | sem container novo; push e PDF no backend | Web Push é uma chamada HTTP; PDF sob demanda |
| Banco | tabelas pequenas novas (inscrição push, ciclo por fornecedor); índices por fornecedor/produto | — |
| Disco | nenhum volume novo | — |
| Rede | push e PWA com poucos KB por evento | — |
| Complexidade operacional | chave VAPID como segredo novo | tem de ficar estável entre deploys, como `AI_ENCRYPTION_KEY` |

## 11. Decisões necessárias no Gate 2

1. Direção principal (A recomendada), com fundação comum.
2. Modelo de quantidade sem estoque: aceita **reposição pelo vendido desde o último pedido** como base?
3. Oportunidades baseadas em estoque teórico: substituir por sinais de venda, ou manter com aviso de baixa confiança?
4. Escada do Gratuito: aceita trocar a rejeição por volume pelo limite estrutural (1 caixa, 1 fornecedor)?
