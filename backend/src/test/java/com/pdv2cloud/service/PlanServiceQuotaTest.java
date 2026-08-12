package com.pdv2cloud.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.model.entity.MarketUsageCounter;
import com.pdv2cloud.model.entity.PlanType;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.repository.MarketUsageCounterRepository;
import com.pdv2cloud.repository.PDVRepository;
import com.pdv2cloud.repository.UserRepository;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

/**
 * A regra de cota que a V52 introduziu.
 *
 * O DEFEITO QUE ELA CORRIGE, medido em produção: um mercado free enviou ~3.600
 * notas de acervo na instalação. As 1.000 primeiras entraram, o limite mensal
 * estourou, e o resto foi recusado. O sistema passou a analisar FEVEREIRO em
 * julho — porque o recorte que coube era o começo do acervo, não a operação.
 *
 * A regra nova separa acervo de operação pela data de emissão contra o marco do
 * primeiro envio. Estes testes fixam os dois lados dessa fronteira.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PlanServiceQuotaTest {

    @Mock private MarketRepository marketRepository;
    @Mock private MarketUsageCounterRepository usageRepository;
    @Mock private PDVRepository pdvRepository;
    @Mock private UserRepository userRepository;
    @Mock private PlanCatalogService planCatalogService;

    private PlanService planService;
    private final UUID marketId = UUID.randomUUID();

    /** O agente foi instalado há 30 dias. */
    private final LocalDateTime marco = LocalDateTime.now().minusDays(30);

    @BeforeEach
    void setUp() {
        planService = new PlanService(marketRepository, usageRepository,
            pdvRepository, userRepository, planCatalogService);

        // O catálogo é editável pelo painel; a entidade já nasce com os
        // defaults do plano FREE (1.000 notas), que é o cenário destes testes.
        when(planCatalogService.entryFor(any()))
            .thenReturn(new com.pdv2cloud.model.entity.PlanCatalogEntry());
    }

    /**
     * O caso que motivou tudo: acervo de dois anos atrás entra inteiro, mesmo
     * com a cota já esgotada.
     */
    @Test
    void acervoAnteriorAoPrimeiroEnvioEntraMesmoComCotaEsgotada() {
        givenMarket(PlanType.FREE, marco);
        givenUsage(1_000); // cota semanal cheia

        LocalDateTime notaAntiga = marco.minusMonths(8);
        PlanService.QuotaDecision decision = planService.canIngest(marketId, notaAntiga);

        assertTrue(decision.allowed(), "acervo tem de entrar mesmo com cota cheia");
        assertTrue(decision.historical(), "e tem de ser marcado como histórico");
    }

    /** Nota de operação com a cota cheia é recusada — é o que o limite faz. */
    @Test
    void notaDeOperacaoComCotaCheiaEDeRecusada() {
        givenMarket(PlanType.FREE, marco);
        givenUsage(1_000);

        PlanService.QuotaDecision decision =
            planService.canIngest(marketId, LocalDateTime.now());

        assertFalse(decision.allowed());
        assertFalse(decision.historical());
        assertTrue(decision.message().contains("semanal"),
            "a mensagem precisa dizer que a cota é semanal e quando renova");
    }

    /** Nota de operação com cota disponível entra e consome. */
    @Test
    void notaDeOperacaoComCotaDisponivelEntraConsumindo() {
        givenMarket(PlanType.FREE, marco);
        givenUsage(500);

        PlanService.QuotaDecision decision =
            planService.canIngest(marketId, LocalDateTime.now());

        assertTrue(decision.allowed());
        assertFalse(decision.historical(), "operação NÃO pode ser marcada como histórico");
    }

    /**
     * A fronteira exata: nota emitida no instante do marco é operação.
     *
     * Importa fixar o lado: se o marco fosse inclusivo, a primeira nota da
     * operação escaparia da cota — e o agente que instala e vende no mesmo
     * minuto teria uma brecha.
     */
    @Test
    void notaExatamenteNoMarcoContaComoOperacao() {
        givenMarket(PlanType.FREE, marco);
        givenUsage(1_000);

        PlanService.QuotaDecision decision = planService.canIngest(marketId, marco);

        assertFalse(decision.allowed(), "no marco já é operação, então a cota vale");
    }

    /** Um segundo antes do marco ainda é acervo. */
    @Test
    void notaUmSegundoAntesDoMarcoEAcervo() {
        givenMarket(PlanType.FREE, marco);
        givenUsage(1_000);

        PlanService.QuotaDecision decision =
            planService.canIngest(marketId, marco.minusSeconds(1));

        assertTrue(decision.allowed());
        assertTrue(decision.historical());
    }

    /**
     * Mercado sem marco é a carga inicial em andamento: tudo entra.
     *
     * É este caso que permite ao acervo inteiro entrar na primeira instalação —
     * o marco só é gravado depois da primeira nota aceita.
     */
    @Test
    void mercadoSemMarcoAceitaTudoComoAcervo() {
        givenMarket(PlanType.FREE, null);
        givenUsage(1_000);

        PlanService.QuotaDecision decision =
            planService.canIngest(marketId, LocalDateTime.now().minusDays(400));

        assertTrue(decision.allowed());
        assertTrue(decision.historical());
    }

    /**
     * Sem data de emissão, trata como operação.
     *
     * Errar para o lado conservador: uma nota sem data que passasse como
     * histórico seria a brecha para burlar a cota inteira.
     */
    @Test
    void semDataDeEmissaoTrataComoOperacao() {
        givenMarket(PlanType.FREE, marco);
        givenUsage(1_000);

        assertFalse(planService.canIngest(marketId, null).allowed());
    }

    /** O ciclo é semanal e começa na segunda-feira. */
    @Test
    void cicloComecaNaSegundaFeira() {
        LocalDate cycle = planService.currentCycleStart();

        assertEquals(DayOfWeek.MONDAY, cycle.getDayOfWeek());
        assertFalse(cycle.isAfter(LocalDate.now()), "o ciclo não pode começar no futuro");
        assertTrue(cycle.isAfter(LocalDate.now().minusDays(7)),
            "e tem de ser a segunda desta semana, não de outra");
    }

    /** Plano ilimitado nem consulta contador. */
    @Test
    void planoIlimitadoAceitaSempre() {
        Market market = givenMarket(PlanType.FREE, marco);
        market.setInvoiceLimitOverride(0); // 0 = sem teto

        assertTrue(planService.canIngest(marketId, LocalDateTime.now()).allowed());
    }

    private Market givenMarket(PlanType plan, LocalDateTime firstIngestAt) {
        Market market = new Market();
        market.setId(marketId);
        market.setName("Teste");
        market.setPlanType(plan);
        market.setFirstIngestAt(firstIngestAt);

        when(marketRepository.findById(marketId)).thenReturn(Optional.of(market));
        when(marketRepository.findNetwork(any())).thenReturn(List.of(market));
        return market;
    }

    private void givenUsage(int used) {
        MarketUsageCounter counter = new MarketUsageCounter();
        counter.setInvoicesIngested(used);
        counter.setHistoricalIngested(0);
        counter.setInvoicesRejected(0);
        when(usageRepository.findByMarketIdAndCycleStart(any(), any()))
            .thenReturn(Optional.of(counter));
    }
}
