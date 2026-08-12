package com.pdv2cloud.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import com.pdv2cloud.model.entity.PlanCatalogEntry;
import com.pdv2cloud.model.entity.PlanType;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.repository.MarketUsageCounterRepository;
import com.pdv2cloud.repository.PDVRepository;
import com.pdv2cloud.repository.UserRepository;
import java.math.BigDecimal;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

/**
 * A régua do plano gratuito adotada em 12/08/2026.
 *
 * MUDANÇA DE ESTRATÉGIA que estes testes protegem: o gratuito deixou de ser
 * limitado por QUANTIDADE (5 itens de cada lista, que impedia usar o recurso e
 * frustrava antes de entregar valor) e passou a ser limitado por ALCANCE —
 * janela de análise, horizonte de previsão e teto de orçamento.
 *
 * O princípio: o gratuito responde <b>o que está acontecendo na loja</b>,
 * inclusive o que comprar. O pago acrescenta o que exige <b>cálculo cruzado</b>
 * (efeito halo, combos), mais alcance no tempo e volume sem teto.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PlanGatingTest {

    @Mock private MarketRepository marketRepository;
    @Mock private MarketUsageCounterRepository usageRepository;
    @Mock private PDVRepository pdvRepository;
    @Mock private UserRepository userRepository;
    @Mock private PlanCatalogService planCatalogService;

    private PlanService planService;

    @BeforeEach
    void setUp() {
        planService = new PlanService(marketRepository, usageRepository,
            pdvRepository, userRepository, planCatalogService);
        when(planCatalogService.entryFor(any())).thenReturn(new PlanCatalogEntry());
    }

    // ── Teto de orçamento ────────────────────────────────────────────────────

    /**
     * O gratuito planeja compras até o teto — com a lista INTEIRA.
     *
     * Limitar o valor no lugar da lista é o que mantém o recurso utilizável:
     * quem compra pouco opera 100%, e quem compra muito esbarra no teto
     * justamente quando o plano está lhe rendendo dinheiro.
     */
    @Test
    void gratuitoTemTetoDeOrcamento() {
        assertEquals(PlanService.FREE_PURCHASE_BUDGET_CAP,
            planService.purchaseBudgetCap(limits(PlanType.FREE, false, 90)));
    }

    @Test
    void planoPagoNaoTemTetoDeOrcamento() {
        assertNull(planService.purchaseBudgetCap(limits(PlanType.ESSENCIAL, true, 365)));
    }

    // ── Horizonte de previsão ────────────────────────────────────────────────

    /** Uma semana repõe a prateleira; um mês negocia com o fornecedor. */
    @Test
    void gratuitoVeUmaSemanaDePrevisao() {
        assertEquals(7,
            planService.forecastHorizonDays(limits(PlanType.FREE, false, 90), 30));
    }

    /** Pedir menos que o teto não é ampliado para o teto. */
    @Test
    void pedidoMenorQueOTetoEPreservado() {
        assertEquals(3,
            planService.forecastHorizonDays(limits(PlanType.FREE, false, 90), 3));
    }

    @Test
    void planoPagoVeOHorizonteInteiro() {
        assertEquals(30,
            planService.forecastHorizonDays(limits(PlanType.ESSENCIAL, true, 365), 30));
    }

    // ── Tipos de oportunidade ────────────────────────────────────────────────

    /**
     * Ficam no pago apenas os tipos que exigem CÁLCULO que o lojista não faria:
     * efeito halo (que produto puxa a venda de outros) e combos.
     */
    @Test
    void gratuitoNaoVeOsTiposDeCalculoCruzado() {
        PlanService.EffectiveLimits free = limits(PlanType.FREE, false, 90);

        assertFalse(planService.canSeeOpportunityType(free, "PRODUTO_TRACIONADOR"));
        assertFalse(planService.canSeeOpportunityType(free, "OPORTUNIDADE_DE_COMBO"));
    }

    /**
     * "O que eu preciso comprar" NÃO pode ser pago — é a pergunta central do
     * produto e 68% de tudo que o motor detecta em produção (484 de 715).
     *
     * Este teste existe por causa de um erro real: a régua de 12/08/2026
     * bloqueou este tipo por engano, o que deixaria o gratuito só com o que
     * está errado na loja e cobraria pelo que fazer a respeito — entregar a má
     * notícia e vender a boa.
     */
    @Test
    void oQueComprarNuncaFicaBloqueado() {
        assertTrue(planService.canSeeOpportunityType(
            limits(PlanType.FREE, false, 90), "OPORTUNIDADE_DE_COMPRA"));
    }

    /**
     * Os que DESCREVEM o presente ficam livres: é o que prova que o sistema
     * entende a loja, e é o que o lojista poderia apurar sozinho com trabalho.
     */
    @Test
    void gratuitoVeOsTiposQueDescrevemOPresente() {
        PlanService.EffectiveLimits free = limits(PlanType.FREE, false, 90);

        assertTrue(planService.canSeeOpportunityType(free, "CAPITAL_PARADO"));
        assertTrue(planService.canSeeOpportunityType(free, "EXCESSO_DE_ESTOQUE"));
        assertTrue(planService.canSeeOpportunityType(free, "PRECO_ACIMA_DO_MERCADO"));
        assertTrue(planService.canSeeOpportunityType(free, "QUEDA_DE_VENDAS"));
        assertTrue(planService.canSeeOpportunityType(free, "OPORTUNIDADE_DE_PROMOCAO"));
        assertTrue(planService.canSeeOpportunityType(free, "ANOMALIA_DE_VENDAS"));
        assertTrue(planService.canSeeOpportunityType(free, "RISCO_DE_RUPTURA"));
    }

    @Test
    void planoPagoVeTodosOsTipos() {
        PlanService.EffectiveLimits pago = limits(PlanType.ESSENCIAL, true, 365);

        assertTrue(planService.canSeeOpportunityType(pago, "PRODUTO_TRACIONADOR"));
        assertTrue(planService.canSeeOpportunityType(pago, "OPORTUNIDADE_DE_COMBO"));
        assertTrue(planService.canSeeOpportunityType(pago, "OPORTUNIDADE_DE_COMPRA"));
    }

    /** Tipo desconhecido não pode ficar bloqueado por engano. */
    @Test
    void tipoNovoNasceLiberado() {
        assertTrue(planService.canSeeOpportunityType(
            limits(PlanType.FREE, false, 90), "TIPO_QUE_AINDA_NAO_EXISTE"));
    }

    // ── Janela de análise ────────────────────────────────────────────────────

    /**
     * A retenção do plano passa a valer de fato.
     *
     * O campo existia desde sempre no catálogo e era EXIBIDO na comparação de
     * planos, mas nenhuma consulta o aplicava — um limite anunciado que não
     * existia.
     */
    @Test
    void janelaERecortadaPelaRetencaoDoPlano() {
        assertEquals(90, planService.clampWindow(limits(PlanType.FREE, false, 90), 365));
    }

    @Test
    void janelaMenorQueARetencaoEPreservada() {
        assertEquals(30, planService.clampWindow(limits(PlanType.FREE, false, 90), 30));
    }

    @Test
    void retencaoIlimitadaNaoRecorta() {
        assertEquals(730,
            planService.clampWindow(limits(PlanType.REDE, true, PlanType.UNLIMITED), 730));
    }

    // ── Escada Essencial → Profissional (12/08/2026) ─────────────────────────
    //
    // Os dois planos eram funcionalmente IDÊNTICOS: o preço dobrava e nenhuma
    // função mudava, só cinco contadores. `PROFISSIONAL` aparecia em exatamente
    // dois lugares no código — o checkout do Stripe e um contador de relatório.

    /**
     * A inteligência de rede é o degrau mais honesto que a escada tem: já
     * exigia 2+ lojas na prática, e o Essencial permite 1. O bloqueio existia
     * de fato mas não estava NOMEADO, então não vendia plano nenhum.
     */
    @Test
    void redeExigeOPlanoAvancado() {
        assertFalse(planService.canUseNetworkIntelligence(limits(PlanType.ESSENCIAL, true, 365)));
        assertTrue(planService.canUseNetworkIntelligence(limits(PlanType.PROFISSIONAL, true, 730)));
        assertTrue(planService.canUseNetworkIntelligence(limits(PlanType.REDE, true, -1)));
    }

    /**
     * O histórico decisão a decisão só rende com meses acumulados — quem tem
     * isso é o cliente maduro. O Essencial continua vendo o RESUMO, que é o que
     * responde "o sistema está me ajudando?".
     */
    @Test
    void historicoCompletoDeDecisoesExigeOAvancado() {
        assertFalse(planService.canSeeFullOutcomes(limits(PlanType.ESSENCIAL, true, 365)));
        assertTrue(planService.canSeeFullOutcomes(limits(PlanType.PROFISSIONAL, true, 730)));
    }

    @Test
    void clientesERecompraExigemOAvancado() {
        assertFalse(planService.canUseCustomerIntelligence(limits(PlanType.ESSENCIAL, true, 365)));
        assertTrue(planService.canUseCustomerIntelligence(limits(PlanType.PROFISSIONAL, true, 730)));
    }

    /**
     * A previsão escala nos três degraus: uma semana repõe a prateleira, um mês
     * negocia com o fornecedor, um trimestre planeja a temporada. É a mesma
     * métrica servindo a decisões de porte diferente.
     */
    @Test
    void previsaoEscalaNosTresDegraus() {
        assertEquals(7, planService.forecastHorizonDays(limits(PlanType.FREE, false, 90), 365));
        assertEquals(30, planService.forecastHorizonDays(limits(PlanType.ESSENCIAL, true, 365), 365));
        assertEquals(90, planService.forecastHorizonDays(limits(PlanType.PROFISSIONAL, true, 730), 365));
    }

    /** O nível é ordinal: comparar por >= faz plano novo no meio não quebrar nada. */
    @Test
    void nivelEOrdinalEComparavel() {
        assertTrue(PlanType.PROFISSIONAL.getIntelligenceTier()
            .reaches(PlanType.ESSENCIAL.getIntelligenceTier()));
        assertFalse(PlanType.ESSENCIAL.getIntelligenceTier()
            .reaches(PlanType.PROFISSIONAL.getIntelligenceTier()));
        assertTrue(PlanType.FREE.getIntelligenceTier()
            .reaches(PlanType.FREE.getIntelligenceTier()));
    }

    /** REDE herda tudo do avançado: é o plano negociado, nunca o mais pobre. */
    @Test
    void redeAlcancaTudoQueOProfissionalAlcanca() {
        assertTrue(PlanType.REDE.getIntelligenceTier()
            .reaches(PlanType.PROFISSIONAL.getIntelligenceTier()));
    }

    private PlanService.EffectiveLimits limits(PlanType plan, boolean full, int historyDays) {
        return new PlanService.EffectiveLimits(
            plan, 1_000, 1, 1, 1, 2, historyDays, full, UUID.randomUUID());
    }
}
