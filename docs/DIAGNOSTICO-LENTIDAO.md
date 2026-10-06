# Por que as telas com dados demoram, e o que fazer

Diagnóstico de 06/10/2026, medido em produção (leitura apenas) e numa cópia local com 60 dias de vendas.

## 1. O que medimos

**A máquina**

| Onde | Medida |
|---|---|
| VPS | 2 vCPU; load average **11,8** |
| VPS | `vmstat`: **steal 78–82%**, CPU ociosa 0% |
| VPS | Hospeda também outras 5 aplicações e mais 4 instâncias de PostgreSQL |
| PostgreSQL do MercadoFlow | **300–340% de CPU**; 550 de 640 MB de memória |
| PostgreSQL do MercadoFlow | `shared_buffers` 192 MB, `work_mem` 4 MB, JIT ligado |

**As tabelas**

| Tabela | Linhas vivas | Tamanho | Alterações registradas |
|---|---|---|---|
| `opportunities` | **1.184** | **1,6 GB** + 281 MB de índice | **19,9 milhões de UPDATEs**, ~17 mil por linha |
| `recommendations` | 1.572 | 214 MB | 250 mil UPDATEs |
| `product_price_daily_stats` | 116 mil | 289 MB + 136 MB de índice | 4,8 milhões de INSERTs, 1,9 milhão de linhas mortas |
| `invoice_items` | 163 mil | 41 MB | sem `market_id` nem data na própria tabela |

**Consultas em andamento no momento da medição**
- Duas leituras de `opportunities` rodando há **3 min 56 s**, esperando disco.
- Dois cálculos de "halo" de promoção dentro de requisições de tela, abertos há **1 min 54 s**.
- O job reescrevendo `opportunities`.
- A ingestão das notas que o agente está enviando.

**Tempos de API na cópia local** (8 mil notas)

| Tela | Até a rede parar | Chamada mais lenta |
|---|---|---|
| Início (novo) | 1,3 s | `/analytics/operation`, 0,36 s |
| Decidir | 1,2 s | 0,13 s |
| Comprar | **4,7 s** | `/analytics/cockpit`, 3,9 s |
| Produtos | **4,9 s** | `/analytics/cockpit`, 4,1 s; `/products/performance`, 3,4 s |
| Campanhas, Caixas | ~1 s | < 0,2 s |

Na produção os mesmos números ficam várias vezes maiores, pelo *steal* e pela disputa de disco.

## 2. As causas, da maior para a menor

### C1. Gravações inúteis que incham o banco
A detecção roda a cada 5 minutos para cada loja (ciclo adaptativo) e **regrava todas as oportunidades abertas, mesmo sem mudança** (`OpportunityEngine.refresh`). Ela troca título, evidência e números, e soma `detection_count`. No PostgreSQL, cada UPDATE grava uma linha nova e deixa a antiga para o *vacuum*. O *vacuum* libera o espaço, mas o arquivo não encolhe.

Resultado: 2 MB de dados ocupando 1,6 GB. Qualquer tela que lista oportunidades ou recomendações lê centenas de MB do disco. Isso afeta Início, Decidir, o resumo do Tino e o Copiloto.

O mesmo padrão de apagar e regravar a cada nota aparece em `product_price_daily_stats` e em `recommendations`.

A comunidade descreve exatamente esse caso:
- atualizar uma linha grande com frequência multiplica o tamanho da tabela mesmo com o *autovacuum* ligado;
- a saída é não regravar o que não mudou e tirar contadores voláteis da linha principal ([Nainar, JSONB/TOAST](https://nainar.me/notes/postgres-toast-jsonb/); [pganalyze](https://pganalyze.com/blog/5mins-postgres-jsonb-toast); [JusDB](https://www.jusdb.com/blog/postgresql-toast-storage-mechanism-guide)).

### C2. A máquina não tem CPU para o que pedimos
O *steal* de ~80% significa que o provedor entrega cerca de 20% dos 2 vCPU. Isso vem de vizinhos, ou de um limite do plano, e se soma às outras 9 aplicações e bancos da mesma VPS.

O PostgreSQL do MercadoFlow quer 3 núcleos por causa de C1, C3 e C4. Com menos de meio núcleo disponível, tudo entra em fila. A configuração de memória (640 MB no contêiner, 192 MB de cache) também obriga a ler do disco o que deveria estar em memória.

### C3. Cada tela recalcula tudo a partir das notas brutas
- O `cockpit` faz de **15 a 20 varreduras de `invoice_items` em sequência**, de 150 a 500 ms cada. Várias são idênticas: a lista de produtos e a "última venda" se repetem até 4 vezes na mesma requisição.
- `invoice_items` não tem `market_id` nem data. Toda consulta precisa juntar com `invoices`, e o PostgreSQL acaba lendo os itens **de todas as lojas**.
- A RLS de `invoice_items` roda um `EXISTS` na nota para **cada item** e usa `current_setting()` direto na política. Isso atrapalha a escolha do plano: a estimativa foi de 1 linha onde havia 3.816, o que levou a *nested loop*. Na medição, a RLS acrescenta ~40% sobre uma consulta que já é cara.

A recomendação da comunidade para painéis é não agregar a tabela de transações a cada carregamento: o cálculo vai para tabelas resumo diárias, atualizadas na chegada dos dados, com ganhos relatados de 10 a 100 vezes ([Citus, agregação incremental](https://www.citusdata.com/blog/2018/06/14/scalable-incremental-data-aggregation/); [Bold BI](https://support.boldbi.com/kb/article/14344/optimize-db-performance-with-materialized-views-and-aggregated-tables); [ClickHouse sobre Postgres](https://clickhouse.com/resources/engineering/real-time-analytics-postgres)).

Para a RLS, a orientação é:
- pôr a coluna do inquilino na própria tabela, com índice;
- colocar `current_setting()` dentro de um `(select …)` ou de uma função STABLE, para ser avaliado uma vez por consulta;
- evitar subconsultas por linha na política.

Fontes: [Supabase, desempenho de RLS](https://supabase.com/docs/guides/database/postgres/row-level-security-performance); [Rivestack](https://rivestack.io/blog/postgresql-row-level-security); [MVP Factory](https://mvpfactory.io/blog/postgresql-row-level-security-without-the-performance-tax-policies-indexes-and).

### C4. Cálculos pesados de madrugada caem dentro da tela
O "halo" de promoção (180 dias, uma consulta por produto) deveria vir pronto do job noturno. Quando a tabela pronta está vazia, ou a janela pedida é diferente, `HaloEffectsReader` **calcula na hora**, dentro da requisição. Foram essas as consultas abertas há quase 2 minutos.

### C5. O navegador pede tudo de novo a cada tela
- Não há cache no cliente: voltar a uma tela refaz todas as chamadas.
- Há chamadas repetidas na mesma tela: `supplier-orders` x3 e `recommendations` x2 em Comprar.
- Telas que usam um pedaço pequeno do `cockpit` (Comprar e Produtos) pagam o `cockpit` inteiro.

A prática comum é o *stale-while-revalidate*: mostrar na hora o último dado da tela e atualizar em segundo plano, com uma janela em que o dado conta como fresco ([TanStack Query / SWR](https://naveedkarimi.com/learn/courses/frontend-100-concepts/63-caching-with-stale-while-revalidate.html); [newline](https://www.newline.co/courses/react-data-fetching-beyond-the-basics/stale-while-revalidate)).

## 3. O plano, em ordem de ganho

| # | O que | Ataca | Esforço | Efeito esperado |
|---|---|---|---|---|
| 1 | **Parar as regravações inúteis.** Só fazer UPDATE em oportunidade e recomendação quando título, valor ou evidência mudarem. `last_detected_at` e `detection_count` vão para uma atualização leve, de no máximo 1 vez por hora. Fazer o mesmo no `product_price_daily_stats`. | C1 | Baixo (código) | Para o inchaço; corta a maior parte das gravações e da CPU do banco |
| 2 | **Compactar as tabelas inchadas uma vez** (`VACUUM FULL` em `opportunities`, `recommendations` e `product_price_daily_stats`, de madrugada, cerca de 1 min de bloqueio). *Escrita em produção: precisa do seu ok.* | C1 | Baixo | 1,6 GB → poucos MB; Decidir e Início deixam de ler do disco |
| 3 | **Ajustar o PostgreSQL ao que a VPS tem:** contêiner com 1,5 GB, `shared_buffers` 384 MB, `work_mem` 16 MB, `effective_cache_size` 1 GB, `jit=off`, `random_page_cost=1.1` (SSD) e `pg_stat_statements` para medir. | C2 | Baixo (compose) | Menos leitura de disco; o JIT deixa de somar 50–200 ms a cada consulta analítica |
| 4 | **Halo e sazonalidade só do pronto.** A requisição nunca calcula o halo; sem cálculo noturno, mostra "em cálculo" e agenda o cálculo. | C4 | Baixo | Some a consulta de 2 minutos |
| 5 | **Cache no navegador** (gancho próprio de ~50 linhas, sem dependência nova): voltar a uma tela é instantâneo, chamadas iguais em andamento são unificadas e as repetidas de Comprar somem. Comprar e Produtos deixam de usar o `cockpit`. | C5 | Médio | Navegação entre telas sem espera; −4 s em Comprar e Produtos |
| 6 | **`market_id` e data em `invoice_items`** (migração nova com preenchimento), índice `(market_id, data_emissao)` e RLS por coluna, sem `EXISTS`, com `(select current_setting(...))`. | C3 | Médio | Consultas de itens leem só a loja e o período; RLS sem custo por linha |
| 7 | **Tabela resumo `vendas_diarias_produto`** (loja, produto, dia: faturamento, quantidade, cupons), atualizada na ingestão. Cockpit, desempenho, ficha do produto e Início passam a ler dela. | C3 | Alto | Telas analíticas de segundos para < 200 ms, sem piorar com o volume |
| 8 | **Infraestrutura:** com *steal* de 80%, a VPS entrega cerca de 0,4 vCPU. Abrir chamado com o provedor ou subir para um plano com vCPU dedicada, ou mover o MercadoFlow para uma VPS só dele. | C2 | Decisão sua | Teto real de CPU; hoje qualquer otimização disputa com 9 vizinhos |

**Ordem sugerida**
- Itens 1 a 5 primeiro: rápidos e com o maior ganho.
- Depois o item 6.
- O item 7 resolve de vez o crescimento: hoje cada loja nova e cada mês de notas deixa todas as telas mais lentas.
- O item 8 corre em paralelo e não depende de código.

## 4. Como medir que melhorou
- `pg_stat_statements` (item 3) para as 10 consultas mais caras, antes e depois.
- Repetir `scratchpad/perf-pages.mjs` (tempo até a rede parar em cada tela) e medir em produção com o tempo de resposta no log do nginx (`$request_time`).
- Acompanhar `vmstat` (*steal*) e `docker stats` do `mercadoflow-postgres`.
- Meta: toda tela com dados abaixo de 1,5 s, e voltar a uma tela já visitada sem esperar.
