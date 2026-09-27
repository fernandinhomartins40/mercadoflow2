# 07 — Segurança, privacidade, desempenho e operação

Data: 2026-09-26 · Fase: Prompt 4 · Evidência: sondagem só de leitura em `mercadoflow.com`, ambiente local descartável
com as mesmas roles/RLS (04 §0), código, e as auditorias VPS de 24–26/09 (`docs/VPS-IMPLEMENTATION-PLAN.md`).

Legenda: `MEDIDO` (com data/ambiente) · `ESTIMADO` · `NÃO MEDIDO`.

## 1. Segurança e privacidade

| ID | Tema (OWASP) | Achado | Evidência | Risco | Prioridade | Status |
|---|---|---|---|---|---|---|
| SEC-00 | A01/A04 | login de mercado 500 sob RLS; 500 expunha SQL; 1ª nota travava a ingestão | 04 UX-C01/C02/C07 | indisponibilidade total, vazamento de estrutura | P0 | **corrigido** (D-028) |
| SEC-01 | A10 SSRF | provedor de IA `CUSTOM` aceita **qualquer URL**; não há checagem de IP interno/loopback/link-local em todo o backend (`AiCredentialService:109-153`, sem `InetAddress` no código) | código | dono de mercado faz o backend chamar serviços internos da VPS compartilhada (outras stacks, portas do host, metadados) | **P0** | aberto |
| SEC-02 | A07 | **login, cadastro e login do super admin sem limite de tentativas**: 12 logins errados seguidos → 12 × 401, nenhum 429; o `RateLimitFilter` só cobre `/agent`, `/ingest` e pareamento | produção, 2026-09-26 | força bruta de senha; cadastro em massa | **P0** | aberto |
| SEC-03 | A07 | o rate limit identifica o cliente pelo **primeiro valor de `X-Forwarded-For`**, que o cliente controla (o proxy do host acrescenta, não substitui) | `RateLimitFilter:86-91`, `deploy-web.sh` | limite do pareamento contornável | P1 | aberto |
| SEC-04 | LGPD | **CPF do consumidor final em claro** em `invoices.cpf_cnpj_destinatario` (2.227/2.227 no ambiente sintético); a análise usa HMAC na consulta, mas o dado bruto fica em repouso e nos dumps de backup | banco local, `InvoiceProcessingService:191` | minimização (LGPD art. 6º III); exposição em backup | P1 | aberto |
| SEC-05 | A05 | páginas sem `Strict-Transport-Security`, `Content-Security-Policy`, `X-Frame-Options`, `Referrer-Policy`; servidor anuncia `nginx/1.18.0 (Ubuntu)` | `curl -I` em produção | clickjacking, downgrade, fingerprint | P1 | aberto |
| SEC-06 | A05 | Swagger e actuator liberados no `SecurityConfig`, mas **não expostos**: o proxy só encaminha `/api/` e `/health` (as rotas devolvem o `index.html`) | produção | baixo | P2 | mitigado pelo proxy |
| SEC-07 | A01 | `/api/v1/auth/me` responde **403** a visitante anônimo e é chamado em toda página pública | produção | ruído e requisição inútil; semântica (deveria ser 401) | P2 | aberto |
| SEC-08 | A04 | cabeçalho obrigatório ausente no ingest vira **500** (deveria ser 400) | local | ruído de erro; mascara falhas reais | P2 | aberto |
| SEC-09 | Segredos | contas de teste do `CREDENCIAIS-TESTE.md` retornam 401 em produção (secret provavelmente ausente); o arquivo com senhas está no disco local, mas no `.gitignore` | produção + `.gitignore:51` | ferramental de QA inoperante | P2 | aberto |
| SEC-10 | Conta descartável | 2 mercados de auditoria criados em produção (`d563f027…`, `47df9649…`) | D-028 | lixo de teste | P2 | desativar |
| OK | CORS | origem estranha não recebe `Access-Control-Allow-Origin` | produção | — | — | bom |
| OK | Sessão | JWT em cookie `HttpOnly`; nada em `localStorage` | código | — | — | bom |
| OK | Webhook | Stripe com `Webhook.constructEvent` | código | — | — | bom |
| OK | Upload | imagem decodificada e regravada como PNG | código | — | — | bom |
| OK | Isolamento | outro mercado → 403; RLS ativa (validado com a role de aplicação) | local | — | — | bom |
| OK | IA | contexto enviado ao LLM exclui CPF, chave de NF-e e CNPJ (`AiContextBuilder:23`) | código | — | — | bom |

Trilha de auditoria: `AuditLog` assíncrono existe; decisões de recomendação registram autor e data. Retenção e acesso ao log: NÃO VERIFICADOS.

## 2. Desempenho

| ID | Achado | Evidência | Prioridade |
|---|---|---|---|
| PERF-01 | cálculo na leitura: `analytics/cockpit` 2,6 s (Painel e Pedido), `products/performance` 2,3 s, `promo-intelligence/recommendations` 4,8 s, com só 34 mil itens | resource timing local | P1 |
| PERF-02 | LCP local: Painel 7,8 s (360 px), Catálogo 7,2 s, Pedido 6,5 s, Promoções 5,7 s, detalhe do produto 8,0 s; páginas públicas < 1 s | Playwright local e produção | P1 |
| PERF-03 | "Analisar agora" (`/opportunities/detect`) > 60 s → 504 | local | P1 |
| PERF-04 | ingestão ≈0,4 s/nota; carga histórica de um ano (dezenas de milhares de notas) levaria horas | local | P1 |
| PERF-05 | Central de Inteligência renderiza 147 cards (3.292 nós, 53 mil px no celular), sem paginação | 04 UX-05 | P0 (UX) |
| PERF-06 | bundle: 31 rotas sob demanda; JS inicial ≈74 KB comprimido; estáticos com gzip e cache imutável | produção (Fase 15 VPS) | bom |

Consultas N+1: NÃO VERIFICADO de forma sistemática; os tempos acima indicam agregação pesada em leitura, não N+1.

## 3. Operação

| ID | Tema | Estado | Evidência | Prioridade |
|---|---|---|---|---|
| OPS-01 | **Testes fora do pipeline** | o workflow não tem etapa de teste e o Dockerfile usa `-DskipTests`; os 169 testes só rodaram manualmente | `.github/workflows/deploy-pdv2cloud-web.yml`, `backend/Dockerfile:6-8` | **P0** |
| OPS-02 | **Sem teste de integração com banco/RLS** | os três bugs críticos de hoje eram invisíveis a testes unitários | D-028 | **P0** |
| OPS-03 | Backup | `pg_dump` a cada deploy, validado com `pg_restore`, 7 retidos **na própria VPS**, sem cópia externa; restauração completa nunca ensaiada; contém CPF em claro (SEC-04) | `deploy-web.sh:355-390` | P1 |
| OPS-04 | Observabilidade | logs JSON (logstash encoder), `health`/`info`; **sem id de correlação**, sem métricas, sem rastreamento de erros | grep: 0 ocorrências de MDC/correlação | P1 |
| OPS-05 | Cron | ciclo de vida corrigido (loop de restart, Fases 12–15); 244–338 MiB em repouso; sem evidência de vazamento | `docs/VPS-IMPLEMENTATION-PLAN.md` | ok |
| OPS-06 | Healthcheck | `/health` do backend pelo proxy; gate de deploy corrigido na Fase 9 | idem | ok |
| OPS-07 | `DevSeeder` quebra sob RLS | perfil `dev` não sobe com a role de aplicação | local | P2 |

## 4. Orçamento inicial de recursos

| Métrica | Baseline | Limite proposto | Como medir | Ação se exceder |
|---|---|---|---|---|
| RAM backend | MEDIDO 384–441 MiB de 1 GiB (VPS, 25/09, repouso) | ≤ 700 MiB em pico | `docker stats`, cgroup | investigar heap; revisar materializações |
| RAM cron | MEDIDO 244–338 MiB de 640 MiB | ≤ 500 MiB | idem | revisar job que pico |
| RAM PostgreSQL | MEDIDO 288–569 MiB de 640 MiB | ≤ 600 MiB | idem + `pg_stat_activity` | revisar `work_mem`/consultas |
| CPU | VPS 2 vCPU compartilhada; cron limitado a 1 vCPU; coletores 0,5 (Fase 15) | backend p95 < 60% de 1 vCPU | `docker stats`, PSI | materializar leituras pesadas |
| Imagem backend | MEDIDO 819 MB (818.610.920 bytes, Alpine) | ≤ 850 MB | `docker image ls` | revisar camadas |
| Containers permanentes | MEDIDO 7 (+1 por profile) | sem aumento pela tese (§6 do 06) | `docker ps` | justificar cada novo |
| Conexões do banco | MEDIDO 11 de 50 (25/09) | pool 8 (backend) + 4 (cron) | `pg_stat_activity` | alarme em > 30 |
| Bundle inicial | MEDIDO ≈74 KB gzip | ≤ 120 KB | build + `curl` | code split |
| LCP rotas prioritárias | MEDIDO local 5,7–8,0 s (Painel, Catálogo, Pedido, Promoções) | ≤ 2,5 s no celular | Playwright local e produção | materializar (PERF-01) |
| INP | NÃO MEDIDO | ≤ 200 ms | web-vitals no campo | — |
| CLS | MEDIDO ≤ 0,03 em geral; 0,158 no cadastro a 768 px | ≤ 0,1 | Playwright | reservar espaço |
| Duração de jobs | MEDIDO local: recálculo de inteligência 16 s, de preço 15 s, detecção > 60 s | detecção < 30 s ou assíncrona | log do job | tornar incremental |
| Ingestão | MEDIDO local ≈0,4 s/nota | ≤ 0,1 s/nota | tempo do lote | tirar recálculo pesado do caminho da nota |

## 5. Riscos críticos e quick wins (Gate 3B)

**Riscos críticos abertos:** SEC-01 (SSRF pelo provedor de IA), SEC-02 (login sem limite), OPS-01/OPS-02 (testes fora do CI,
sem teste com RLS), e, do lado de produto, o núcleo de compra baseado em estoque teórico (04 §4.1).

**Quick wins comprovados (pequenos, reversíveis, sem arquitetura nova):**
1. Rodar `mvn test` no workflow antes do build (OPS-01).
2. Limitar login/cadastro por IP real (`X-Real-IP` definido pelo proxy) e por e-mail (SEC-02, SEC-03).
3. Validar a URL do provedor `CUSTOM`: só `https`, resolver o host e recusar faixas privadas/loopback/link-local (SEC-01).
4. Cabeçalhos de segurança e `server_tokens off` no Nginx do host/stack (SEC-05).
5. `/auth/me` não chamado em páginas públicas; ingest com 400 para cabeçalho ausente (SEC-07, SEC-08).
6. Desativar as duas contas de auditoria (SEC-10).
