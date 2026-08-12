package com.pdv2cloud.service;

import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.model.entity.MarketUsageCounter;
import com.pdv2cloud.model.entity.PlanType;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.repository.MarketUsageCounterRepository;
import com.pdv2cloud.repository.PDVRepository;
import com.pdv2cloud.repository.UserRepository;
import com.pdv2cloud.util.CnpjUtils;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Limites de plano e medição de uso.
 *
 * Única fonte de verdade sobre "o que esta empresa pode fazer". Antes dele,
 * {@code planType} e {@code userSeatLimit} eram gravados mas nunca consultados.
 *
 * Ponto central do desenho: todo limite é apurado sobre a REDE inteira — matriz
 * mais filiais — e não por conta. Uma rede que abre uma conta por loja continua
 * somando contra o mesmo teto, então fatiar-se não contorna nada. Os tetos são
 * três e se cobrem mutuamente:
 *
 *   filiais            impede a rede de crescer em número de lojas;
 *   PDVs por filial    impede concentrar dezenas de caixas numa loja só;
 *   PDVs no total      impede distribuir muitos caixas em várias lojas.
 *
 * Ao estourar o volume mensal a ingestão para, mas a leitura continua: o
 * supermercadista não perde o que já coletou, o que o pressiona a assinar sem
 * destruir o valor acumulado.
 */
@Service
@Slf4j
public class PlanService {

    private final MarketRepository marketRepository;
    private final MarketUsageCounterRepository usageRepository;
    private final PDVRepository pdvRepository;
    private final UserRepository userRepository;
    private final PlanCatalogService planCatalogService;

    public PlanService(
        MarketRepository marketRepository,
        MarketUsageCounterRepository usageRepository,
        PDVRepository pdvRepository,
        UserRepository userRepository,
        PlanCatalogService planCatalogService
    ) {
        this.marketRepository = marketRepository;
        this.usageRepository = usageRepository;
        this.pdvRepository = pdvRepository;
        this.userRepository = userRepository;
        this.planCatalogService = planCatalogService;
    }

    // ── Rede ─────────────────────────────────────────────────────────────────

    /**
     * Matriz da rede a que este mercado pertence.
     *
     * O plano e os limites vivem sempre na matriz: uma filial não tem assinatura
     * própria, ela consome a da rede.
     */
    @Transactional(readOnly = true)
    public Market networkRootOf(Market market) {
        return market.getParentMarket() != null ? market.getParentMarket() : market;
    }

    /** Todos os mercados da rede (matriz + filiais). */
    @Transactional(readOnly = true)
    public List<Market> networkOf(UUID marketId) {
        Market market = requireMarket(marketId);
        return marketRepository.findNetwork(networkRootOf(market).getId());
    }

    // ── Limites efetivos ─────────────────────────────────────────────────────

    /**
     * Limites válidos para a rede deste mercado, considerando plano, overrides
     * negociados e a flag de conta ilimitada.
     */
    @Transactional(readOnly = true)
    public EffectiveLimits limitsFor(Market market) {
        Market root = networkRootOf(market);
        PlanType plan = root.getPlanType() != null ? root.getPlanType() : PlanType.FREE;

        if (Boolean.TRUE.equals(root.getIsUnlimited())) {
            return new EffectiveLimits(
                plan, PlanType.UNLIMITED, PlanType.UNLIMITED, PlanType.UNLIMITED,
                PlanType.UNLIMITED, PlanType.UNLIMITED, true, true, root.getId()
            );
        }

        // Limites vêm do catálogo editável pelo painel; o enum é só o fallback
        // quando a linha não existe (ver PlanCatalogService.entryFor).
        var catalog = planCatalogService.entryFor(plan);

        int invoiceLimit = resolveOverride(root.getInvoiceLimitOverride(), catalog.getMonthlyInvoiceLimit());
        int branchLimit = resolveOverride(root.getBranchLimitOverride(), catalog.getBranchLimit());
        int pdvPerBranch = resolveOverride(root.getPdvPerBranchOverride(), catalog.getPdvPerBranchLimit());
        int pdvLimit = resolveOverride(root.getPdvLimitOverride(), catalog.getPdvLimit());

        // seatLimitOverride tem precedência; userSeatLimit é o campo legado,
        // preenchido em cadastros antigos antes de existir plano de verdade.
        Integer legacySeat = root.getUserSeatLimit();
        int seatLimit = resolveOverride(
            root.getSeatLimitOverride() != null ? root.getSeatLimitOverride() : legacySeat,
            catalog.getUserSeatLimit()
        );

        return new EffectiveLimits(
            plan, invoiceLimit, branchLimit, pdvPerBranch, pdvLimit, seatLimit,
            catalog.getHistoryRetentionDays(),
            Boolean.TRUE.equals(catalog.getFullInsights()),
            root.getId()
        );
    }

    @Transactional(readOnly = true)
    public EffectiveLimits limitsFor(UUID marketId) {
        return limitsFor(requireMarket(marketId));
    }

    private static int resolveOverride(Integer override, int planDefault) {
        if (override == null) {
            return planDefault;
        }
        // Override <= 0 significa "sem teto" para este cliente.
        return override <= 0 ? PlanType.UNLIMITED : override;
    }

    // ── Medição de uso ───────────────────────────────────────────────────────

    /**
     * Ciclo corrente: a segunda-feira da semana em curso.
     *
     * SEMANAL E NÃO MENSAL (decisão do dono, 11/08/2026, apoiada no que se viu
     * em produção): com teto mensal, uma loja pequena que tem uma semana boa
     * fica travada nas três seguintes — e "travada" aqui significa que a
     * análise para de acompanhar a operação, que é justamente o que o produto
     * vende. Semanal devolve a capacidade toda segunda, então o cliente nunca
     * fica muito tempo cego, e ainda assim o volume total é maior
     * (~4.300/mês contra 1.000).
     */
    public LocalDate currentCycleStart() {
        return LocalDate.now().with(java.time.DayOfWeek.MONDAY);
    }

    /**
     * Notas ingeridas no ciclo por toda a rede.
     *
     * Somar as filiais é o que impede o contorno mais óbvio: sem isso, cada loja
     * teria o teto cheio para si.
     */
    @Transactional(readOnly = true)
    public int networkInvoicesThisCycle(UUID rootId) {
        LocalDate cycle = currentCycleStart();
        int total = 0;
        for (Market member : marketRepository.findNetwork(rootId)) {
            total += usageRepository.findByMarketIdAndCycleStart(member.getId(), cycle)
                .map(MarketUsageCounter::getInvoicesIngested)
                .orElse(0);
        }
        return total;
    }

    @Transactional(readOnly = true)
    public UsageSnapshot usageFor(UUID marketId) {
        Market market = requireMarket(marketId);
        EffectiveLimits limits = limitsFor(market);
        LocalDate cycle = currentCycleStart();

        List<Market> network = marketRepository.findNetwork(limits.networkRootId());

        int used = 0;
        int rejected = 0;
        int pdvCount = 0;
        int seatCount = 0;
        LocalDateTime limitReachedAt = null;
        int historical = 0;

        for (Market member : network) {
            MarketUsageCounter counter = usageRepository
                .findByMarketIdAndCycleStart(member.getId(), cycle)
                .orElse(null);
            if (counter != null) {
                used += counter.getInvoicesIngested();
                rejected += counter.getInvoicesRejected();
                historical += counter.getHistoricalIngested() == null
                    ? 0 : counter.getHistoricalIngested();
                if (counter.getLimitReachedAt() != null
                    && (limitReachedAt == null || counter.getLimitReachedAt().isBefore(limitReachedAt))) {
                    limitReachedAt = counter.getLimitReachedAt();
                }
            }
            pdvCount += pdvRepository.findByMarketId(member.getId()).size();
            seatCount += (int) userRepository.countByMarket_IdAndIsActive(member.getId(), true);
        }

        // A semana termina no domingo: o ciclo vira toda segunda, quando a
        // cota renova. Somar um mês aqui (como era no ciclo mensal) faria a UI
        // anunciar uma renovação que aconteceria muito antes.
        return new UsageSnapshot(
            limits, cycle, cycle.plusWeeks(1),
            used, rejected, network.size(), pdvCount, seatCount, limitReachedAt,
            historical
        );
    }

    /**
     * Decide se o mercado ainda pode ingerir uma nota. Roda no caminho quente da
     * ingestão, então evita trabalho quando o plano já é ilimitado.
     */
    @Transactional(readOnly = true)
    /**
     * Compatibilidade: sem data de emissão, trata como operação corrente.
     *
     * Só use quando a data for de fato desconhecida. O caminho de ingestão
     * deve chamar {@link #canIngest(UUID, LocalDateTime)}, senão a carga
     * histórica consome cota — que é exatamente o defeito que a V52 corrige.
     */
    public QuotaDecision canIngest(UUID marketId) {
        return canIngest(marketId, null);
    }

    /**
     * Decide se a nota entra, considerando se ela é acervo ou operação.
     *
     * A REGRA QUE MUDA TUDO: nota emitida ANTES do primeiro envio do mercado é
     * carga histórica e entra sempre, sem consumir cota. É o acervo que já
     * estava na pasta do PDV quando o agente foi instalado.
     *
     * Sem esta separação, um mercado que instala o agente com dois anos de XML
     * acumulado gasta a cota inteira no acervo e fica sem espaço para a venda
     * de hoje — foi o que aconteceu em produção: o sistema analisava fevereiro
     * em julho, porque as 1.000 notas que couberam eram o COMEÇO do acervo.
     *
     * O corte é a data de emissão contra o marco do primeiro envio, e não uma
     * janela de dias após a instalação. A diferença importa: janela premiaria
     * quem segura notas novas para entrarem de graça; a data de emissão não se
     * burla sem falsificar o XML.
     *
     * @param dataEmissao data de emissão da nota; null trata como operação
     */
    public QuotaDecision canIngest(UUID marketId, LocalDateTime dataEmissao) {
        Market market = marketRepository.findById(marketId).orElse(null);
        if (market == null) {
            return QuotaDecision.allowed(PlanType.UNLIMITED, 0);
        }

        EffectiveLimits limits = limitsFor(market);
        if (PlanType.isUnlimited(limits.monthlyInvoices())) {
            return QuotaDecision.allowed(PlanType.UNLIMITED, 0);
        }

        if (isHistorical(market, dataEmissao)) {
            return QuotaDecision.historical(limits.monthlyInvoices(),
                networkInvoicesThisCycle(limits.networkRootId()));
        }

        int used = networkInvoicesThisCycle(limits.networkRootId());
        if (used >= limits.monthlyInvoices()) {
            return QuotaDecision.denied(limits.monthlyInvoices(), used, limits.plan(),
                String.format(
                    "Limite semanal do plano %s atingido (%d notas por semana na rede). "
                        + "A cota renova toda segunda-feira e seus dados seguem disponíveis. "
                        + "Para enviar mais agora, faça upgrade.",
                    limits.plan().getDisplayName(), limits.monthlyInvoices()
                ));
        }
        return QuotaDecision.allowed(limits.monthlyInvoices(), used);
    }

    /**
     * A nota é do acervo anterior à instalação?
     *
     * Mercado sem marco ainda (primeiríssima nota) conta como histórico: é
     * exatamente o momento da carga inicial, e é ela que grava o marco.
     */
    private boolean isHistorical(Market market, LocalDateTime dataEmissao) {
        if (dataEmissao == null) {
            return false;
        }
        LocalDateTime marco = market.getFirstIngestAt();
        return marco == null || dataEmissao.isBefore(marco);
    }

    /**
     * Registra uma nota aceita.
     *
     * Em transação própria (REQUIRES_NEW) para que o contador sobreviva a um
     * rollback do processamento: uma falha no parse não deve zerar a medição do
     * que já entrou.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordIngested(UUID marketId, int itemCount) {
        recordIngested(marketId, itemCount, false);
    }

    /**
     * Registra uma nota aceita, separando acervo de operação.
     *
     * A carga histórica é medida num contador próprio: precisa aparecer (o
     * tamanho do acervo trazido é informação útil) sem entrar na conta da cota.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordIngested(UUID marketId, int itemCount, boolean historical) {
        try {
            if (historical) {
                usageRepository.incrementHistorical(
                    marketId, currentCycleStart(), Math.max(0, itemCount));
            } else {
                usageRepository.incrementIngested(
                    marketId, currentCycleStart(), Math.max(0, itemCount));
            }
        } catch (Exception exc) {
            // Medição nunca deve derrubar a ingestão de uma nota válida.
            log.warn("Falha ao registrar uso do mercado {}: {}", marketId, exc.getMessage());
        }
    }

    /**
     * Grava o marco do primeiro envio, se ainda não existir.
     *
     * O marco é o QUE SEPARA acervo de operação, então é escrito uma única vez
     * e nunca sobrescrito: se pudesse ser reescrito, reinstalar o agente
     * zeraria a cota do cliente para sempre.
     *
     * Também acompanha a nota mais antiga já vista, que serve de diagnóstico do
     * acervo trazido — essa sim pode recuar, porque o agente pode enviar XML
     * mais antigo numa varredura posterior.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void markFirstIngest(UUID marketId, LocalDateTime dataEmissao) {
        try {
            marketRepository.findById(marketId).ifPresent(market -> {
                boolean changed = false;
                if (market.getFirstIngestAt() == null) {
                    market.setFirstIngestAt(LocalDateTime.now());
                    changed = true;
                }
                if (dataEmissao != null) {
                    LocalDate emissao = dataEmissao.toLocalDate();
                    if (market.getOldestInvoiceDate() == null
                        || emissao.isBefore(market.getOldestInvoiceDate())) {
                        market.setOldestInvoiceDate(emissao);
                        changed = true;
                    }
                }
                if (changed) {
                    marketRepository.save(market);
                }
            });
        } catch (Exception exc) {
            log.warn("Falha ao marcar primeiro envio do mercado {}: {}",
                marketId, exc.getMessage());
        }
    }

    /** Registra uma nota recusada por estouro de cota. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordRejected(UUID marketId) {
        try {
            usageRepository.incrementRejected(marketId, currentCycleStart());
        } catch (Exception exc) {
            log.warn("Falha ao registrar recusa do mercado {}: {}", marketId, exc.getMessage());
        }
    }

    // ── Limites estruturais ──────────────────────────────────────────────────

    /**
     * Se ainda cabe outro PDV nesta loja.
     *
     * Checa os dois tetos: o da loja e o da rede. Passar em apenas um não basta
     * — é justamente a combinação que impede a rede de se acomodar num plano
     * barato distribuindo caixas entre muitas lojas.
     */
    @Transactional(readOnly = true)
    public QuotaDecision canAddPdv(UUID marketId) {
        Market market = requireMarket(marketId);
        EffectiveLimits limits = limitsFor(market);

        int inThisBranch = pdvRepository.findByMarketId(marketId).size();
        if (!PlanType.isUnlimited(limits.pdvsPerBranch()) && inThisBranch >= limits.pdvsPerBranch()) {
            return QuotaDecision.denied(limits.pdvsPerBranch(), inThisBranch, limits.plan(),
                String.format(
                    "Seu plano %s permite %d PDV(s) por loja e esta já tem %d. "
                        + "Faça upgrade para conectar mais caixas nesta loja.",
                    limits.plan().getDisplayName(), limits.pdvsPerBranch(), inThisBranch
                ));
        }

        if (!PlanType.isUnlimited(limits.pdvs())) {
            int inNetwork = 0;
            for (Market member : marketRepository.findNetwork(limits.networkRootId())) {
                inNetwork += pdvRepository.findByMarketId(member.getId()).size();
            }
            if (inNetwork >= limits.pdvs()) {
                return QuotaDecision.denied(limits.pdvs(), inNetwork, limits.plan(),
                    String.format(
                        "Seu plano %s permite %d PDV(s) somando todas as lojas e já há %d. "
                            + "Fale com o comercial para um plano sob medida.",
                        limits.plan().getDisplayName(), limits.pdvs(), inNetwork
                    ));
            }
        }

        return QuotaDecision.allowed(limits.pdvs(), inThisBranch);
    }

    /** Se a rede ainda pode abrir outra loja. */
    @Transactional(readOnly = true)
    public QuotaDecision canAddBranch(UUID marketId) {
        Market market = requireMarket(marketId);
        EffectiveLimits limits = limitsFor(market);
        if (PlanType.isUnlimited(limits.branches())) {
            return QuotaDecision.allowed(PlanType.UNLIMITED, 0);
        }

        int current = (int) marketRepository.countNetworkMembers(limits.networkRootId());
        if (current >= limits.branches()) {
            return QuotaDecision.denied(limits.branches(), current, limits.plan(),
                String.format(
                    "Seu plano %s permite %d loja(s) e a rede já tem %d. "
                        + "Fale com o comercial para um plano sob medida para redes.",
                    limits.plan().getDisplayName(), limits.branches(), current
                ));
        }
        return QuotaDecision.allowed(limits.branches(), current);
    }

    /** Se a rede ainda pode cadastrar outro usuário ativo. */
    @Transactional(readOnly = true)
    public QuotaDecision canAddUser(UUID marketId) {
        Market market = requireMarket(marketId);
        EffectiveLimits limits = limitsFor(market);
        if (PlanType.isUnlimited(limits.seats())) {
            return QuotaDecision.allowed(PlanType.UNLIMITED, 0);
        }

        int current = 0;
        for (Market member : marketRepository.findNetwork(limits.networkRootId())) {
            current += (int) userRepository.countByMarket_IdAndIsActive(member.getId(), true);
        }
        if (current >= limits.seats()) {
            return QuotaDecision.denied(limits.seats(), current, limits.plan(),
                String.format(
                    "Seu plano %s permite %d usuário(s) na rede e já há %d.",
                    limits.plan().getDisplayName(), limits.seats(), current
                ));
        }
        return QuotaDecision.allowed(limits.seats(), current);
    }

    // ── Anti-fatiamento de rede ──────────────────────────────────────────────

    /**
     * Contas já existentes da mesma empresa (mesmo CNPJ raiz).
     *
     * Usado no cadastro para recusar a segunda conta de uma rede que tenta se
     * fatiar, e no painel do super admin para achar as que entraram antes desta
     * regra existir.
     */
    @Transactional(readOnly = true)
    public List<Market> findSameCompanyAccounts(String cnpj) {
        String root = CnpjUtils.root(cnpj);
        if (root == null) {
            return List.of();
        }
        return marketRepository.findByCnpjRoot(root);
    }

    @Transactional(readOnly = true)
    public Optional<Market> findMarket(UUID marketId) {
        return marketRepository.findById(marketId);
    }

    // ── Recorte de listas de inteligência ────────────────────────────────────

    /**
     * Aplica o recorte do plano gratuito às listas de inteligência.
     *
     * O gratuito enxerga o produto inteiro, mas só os
     * {@link PlanType#FREE_INSIGHT_PREVIEW_SIZE} primeiros itens de cada lista.
     * A lista já chega ordenada por prioridade, então o recorte preserva o que
     * há de mais relevante.
     */
    // ── Régua do plano gratuito (12/08/2026) ─────────────────────────────────
    //
    // MUDANÇA DE ESTRATÉGIA. Até aqui o gratuito via 5 itens de cada lista, o
    // que impedia USAR o recurso — 5 produtos de 300 não planejam compra
    // nenhuma. A frustração vinha no primeiro dia, antes de qualquer valor
    // percebido, e o cliente concluía que o produto era quebrado, não que era
    // uma versão gratuita.
    //
    // A régua nova limita ALCANCE em vez de QUANTIDADE:
    //
    //   passado é grátis, futuro é pago — o gratuito descreve o que já
    //   aconteceu (e que o lojista poderia apurar sozinho com trabalho); o pago
    //   antecipa o que vai acontecer, que é cálculo que ele nunca faria.
    //
    // O limite passa a incomodar só quem já está ganhando com o produto, e aí o
    // upgrade não é pedágio: é a conta que fecha.

    /** Teto de orçamento do plano de compra no gratuito, em reais. */
    public static final BigDecimal FREE_PURCHASE_BUDGET_CAP = new BigDecimal("5000");

    /** Dias de previsão à frente no gratuito. Uma semana repõe; um mês negocia. */
    public static final int FREE_FORECAST_DAYS = 7;

    /**
     * Tipos de oportunidade reservados ao plano pago.
     *
     * CORRIGIDO em 12/08/2026 contra a distribuição real de produção, que
     * desmentiu a classificação inicial:
     *
     *   OPORTUNIDADE_DE_COMPRA   484 de 715 (68%)   ← estava no pago
     *   EXCESSO_DE_ESTOQUE       146
     *   CAPITAL_PARADO            85
     *   RISCO_DE_RUPTURA           0  (nenhum detector o gera)
     *
     * Dois erros na versão anterior. O primeiro: OPORTUNIDADE_DE_COMPRA é
     * gerada por COBERTURA BAIXA — descreve o presente ("está acabando"), não
     * previsão — e é a resposta literal para "o que eu preciso comprar", a
     * pergunta central do produto. Bloqueá-la deixava o gratuito só com o que
     * está errado na loja e cobrava pelo que fazer a respeito: entregar a má
     * notícia e vender a boa. O segundo: RISCO_DE_RUPTURA está no vocabulário
     * da UI mas nenhum detector o produz, então reservá-lo não gatilhava nada.
     *
     * A régua correta reserva o que o lojista NÃO conseguiria apurar sozinho:
     * PRODUTO_TRACIONADOR (efeito halo — que produto puxa a venda de outros)
     * exige cruzar cupons e comparar velocidade em dias de promoção contra dias
     * normais. É cálculo, não observação.
     *
     * O limite do gratuito na compra continua existindo, e no lugar certo: o
     * teto de orçamento do plano de compra, que só incomoda quem já está
     * comprando muito.
     */
    public static final Set<String> PAID_OPPORTUNITY_TYPES = Set.of(
        "PRODUTO_TRACIONADOR",
        "OPORTUNIDADE_DE_COMBO"
    );

    /**
     * Teto de orçamento para o plano de compra.
     *
     * Limitar o valor no lugar da lista é o que mantém o recurso utilizável:
     * quem compra pouco opera 100%, e quem compra muito esbarra no teto
     * justamente quando o plano está lhe rendendo dinheiro.
     *
     * @return null quando não há teto
     */
    public BigDecimal purchaseBudgetCap(EffectiveLimits limits) {
        return limits.fullInsights() ? null : FREE_PURCHASE_BUDGET_CAP;
    }

    /** Horizonte de previsão que o plano permite ver. */
    public int forecastHorizonDays(EffectiveLimits limits, int requested) {
        if (limits.fullInsights()) {
            return requested;
        }
        return Math.min(requested, FREE_FORECAST_DAYS);
    }

    /** Este tipo de oportunidade é visível no plano do mercado? */
    public boolean canSeeOpportunityType(EffectiveLimits limits, String type) {
        return limits.fullInsights() || !PAID_OPPORTUNITY_TYPES.contains(type);
    }

    /**
     * Janela de análise em dias, limitada pela retenção do plano.
     *
     * O campo {@code historyDays} existia desde sempre no catálogo e era
     * EXIBIDO na comparação de planos, mas nenhuma consulta o aplicava — um
     * limite anunciado que não existia. Passa a valer aqui.
     */
    public int clampWindow(EffectiveLimits limits, int requestedDays) {
        int retention = limits.historyDays();
        if (PlanType.isUnlimited(retention) || retention <= 0) {
            return requestedDays;
        }
        return Math.min(requestedDays, retention);
    }

    /**
     * Recorte de listas — mantido para uso pontual, não mais como régua geral.
     *
     * @deprecated a régua de 12/08/2026 limita alcance, não quantidade. Cortar
     *     a lista impede o lojista de usar o recurso e frustra antes de
     *     convencer. Use {@link #purchaseBudgetCap}, {@link #clampWindow} ou
     *     {@link #forecastHorizonDays}.
     */
    @Deprecated
    public <T> InsightSlice<T> sliceInsights(EffectiveLimits limits, List<T> items) {
        if (items == null || items.isEmpty()) {
            return new InsightSlice<>(List.of(), 0, 0, false);
        }
        if (limits.fullInsights()) {
            return new InsightSlice<>(items, items.size(), 0, false);
        }
        int preview = PlanType.FREE_INSIGHT_PREVIEW_SIZE;
        if (items.size() <= preview) {
            return new InsightSlice<>(items, items.size(), 0, false);
        }
        return new InsightSlice<>(
            items.subList(0, preview), items.size(), items.size() - preview, true
        );
    }

    private Market requireMarket(UUID marketId) {
        return marketRepository.findById(marketId)
            .orElseThrow(() -> new IllegalArgumentException("Mercado não encontrado"));
    }

    // ── Tipos ────────────────────────────────────────────────────────────────

    public record EffectiveLimits(
        PlanType plan,
        int monthlyInvoices,
        int branches,
        int pdvsPerBranch,
        int pdvs,
        int seats,
        int historyDays,
        boolean fullInsights,
        /** Matriz cuja assinatura vale para toda a rede. */
        UUID networkRootId
    ) {
        /** Construtor para contas isentas de teto. */
        EffectiveLimits(
            PlanType plan, int invoices, int branches, int pdvsPerBranch, int pdvs, int seats,
            boolean fullInsights, boolean unlimitedAccount, UUID networkRootId
        ) {
            this(plan, invoices, branches, pdvsPerBranch, pdvs, seats,
                PlanType.UNLIMITED, fullInsights, networkRootId);
        }
    }

    public record UsageSnapshot(
        EffectiveLimits limits,
        LocalDate cycleStart,
        LocalDate cycleEnd,
        int invoicesUsed,
        int invoicesRejected,
        int branchCount,
        int pdvCount,
        int seatCount,
        LocalDateTime limitReachedAt,
        /**
         * Notas de acervo aceitas fora da cota. Medidas porque o tamanho do
         * histórico trazido explica por que a análise tem lastro desde o
         * primeiro dia — mas nunca contam contra o limite.
         */
        int historicalIngested
    ) {
        /** 0..100; -1 quando o plano não tem teto. */
        public int usagePercent() {
            if (PlanType.isUnlimited(limits.monthlyInvoices())) {
                return -1;
            }
            if (limits.monthlyInvoices() <= 0) {
                return 100;
            }
            return Math.min(100, (int) Math.round(invoicesUsed * 100.0 / limits.monthlyInvoices()));
        }

        public boolean limitReached() {
            return !PlanType.isUnlimited(limits.monthlyInvoices())
                && invoicesUsed >= limits.monthlyInvoices();
        }

        /** Aviso antecipado, antes de a ingestão travar. */
        public boolean nearLimit() {
            return !limitReached() && usagePercent() >= 80;
        }

        public int remainingInvoices() {
            if (PlanType.isUnlimited(limits.monthlyInvoices())) {
                return -1;
            }
            return Math.max(0, limits.monthlyInvoices() - invoicesUsed);
        }
    }

    /**
     * @param historical a nota é acervo anterior à instalação do agente —
     *                   entra, mas NÃO consome cota. Quem registra o uso
     *                   precisa olhar este campo, senão a carga histórica
     *                   volta a gastar o limite do cliente
     */
    public record QuotaDecision(
        boolean allowed, int limit, int used, PlanType plan, String message, boolean historical
    ) {

        static QuotaDecision allowed(int limit, int used) {
            return new QuotaDecision(true, limit, used, null, null, false);
        }

        /** Acervo anterior ao primeiro envio: entra sempre, fora da cota. */
        static QuotaDecision historical(int limit, int used) {
            return new QuotaDecision(true, limit, used, null, null, true);
        }

        static QuotaDecision denied(int limit, int used, PlanType plan, String message) {
            return new QuotaDecision(false, limit, used, plan, message, false);
        }
    }

    public record InsightSlice<T>(List<T> items, int totalAvailable, int hiddenCount, boolean truncated) {}
}
