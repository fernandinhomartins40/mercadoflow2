package com.pdv2cloud.service.intelligence;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;

import com.pdv2cloud.service.intelligence.SalesWindowResolver.SalesCoverage;
import java.sql.Date;
import java.sql.ResultSet;
import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.stubbing.Answer;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;

/**
 * O que acontece quando os dados não são de hoje.
 *
 * Dois cenários reais que quebravam o sistema: a primeira instalação, em que o
 * agente sobe meses de XMLs de uma vez, e a loja cuja coleta parou. Nos dois, uma
 * janela contada a partir de "hoje" não alcança venda nenhuma.
 */
class SalesWindowResolverTest {

    private NamedParameterJdbcTemplate jdbcTemplate;
    private SalesWindowResolver resolver;

    private final UUID marketId = UUID.randomUUID();

    private LocalDate oldest;
    private LocalDate latest;
    private long total;

    @BeforeEach
    void setUp() {
        jdbcTemplate = mock(NamedParameterJdbcTemplate.class);
        resolver = new SalesWindowResolver(jdbcTemplate);

        Answer<Void> feed = invocation -> {
            RowCallbackHandler handler = invocation.getArgument(2);
            ResultSet rs = mock(ResultSet.class);
            org.mockito.Mockito.when(rs.getDate("oldest"))
                .thenReturn(oldest != null ? Date.valueOf(oldest) : null);
            org.mockito.Mockito.when(rs.getDate("latest"))
                .thenReturn(latest != null ? Date.valueOf(latest) : null);
            org.mockito.Mockito.when(rs.getLong("total")).thenReturn(total);
            handler.processRow(rs);
            return null;
        };
        org.mockito.Mockito.doAnswer(feed).when(jdbcTemplate)
            .query(any(String.class), any(SqlParameterSource.class), any(RowCallbackHandler.class));
    }

    @Test
    @DisplayName("coleta em dia: a âncora é hoje e nada muda")
    void freshDataAnchorsOnToday() {
        oldest = LocalDate.now().minusDays(180);
        latest = LocalDate.now();
        total = 5000;

        SalesCoverage coverage = resolver.resolve(marketId);

        assertEquals(LocalDate.now(), coverage.anchorDate());
        assertFalse(coverage.historical(), "dados de hoje nao sao historicos");
        assertNull(coverage.notice(), "sem aviso quando esta tudo em dia");
        assertTrue(coverage.hasData());
    }

    @Test
    @DisplayName("venda de ontem ainda conta como atual — fim de semana não dispara alarme")
    void yesterdayIsStillFresh() {
        oldest = LocalDate.now().minusDays(90);
        latest = LocalDate.now().minusDays(1);
        total = 100;

        assertFalse(resolver.resolve(marketId).historical());
    }

    @Test
    @DisplayName("primeira instalação: acervo antigo ancora na última venda, não em hoje")
    void backfillAnchorsOnLatestSale() {
        // O agente subiu um ano de XMLs que terminam ha 4 meses.
        oldest = LocalDate.now().minusDays(485);
        latest = LocalDate.now().minusDays(120);
        total = 12000;

        SalesCoverage coverage = resolver.resolve(marketId);

        assertEquals(latest, coverage.anchorDate(),
            "sem isso, uma janela de 90 dias a partir de hoje nao alcancaria venda nenhuma");
        assertTrue(coverage.historical());
        assertEquals(120, coverage.daysBehind());
        assertNotNull(coverage.notice(), "o usuario precisa saber que o periodo nao e o atual");
    }

    @Test
    @DisplayName("janela de 90 dias sobre acervo antigo cai dentro dos dados")
    void windowStartFallsInsideHistoricalData() {
        oldest = LocalDate.now().minusDays(400);
        latest = LocalDate.now().minusDays(120);
        total = 8000;

        SalesCoverage coverage = resolver.resolve(marketId);
        LocalDate start = resolver.windowStart(coverage, 90);

        assertEquals(latest.minusDays(90), start);
        assertTrue(start.isAfter(oldest), "a janela precisa cair dentro do periodo com dados");
        assertTrue(start.isBefore(latest));
    }

    @Test
    @DisplayName("coleta parada há muito tempo avisa para verificar o agente")
    void longSilenceWarnsAboutAgent() {
        oldest = LocalDate.now().minusDays(200);
        latest = LocalDate.now().minusDays(60);
        total = 3000;

        String notice = resolver.resolve(marketId).notice();

        assertNotNull(notice);
        assertTrue(notice.contains("agente"),
            "acima de 30 dias a causa provavel e coleta parada, e o aviso deve dizer isso");
    }

    @Test
    @DisplayName("acervo recém-importado descreve o período, sem culpar o agente")
    void recentBackfillDescribesPeriodWithoutAlarm() {
        oldest = LocalDate.now().minusDays(120);
        latest = LocalDate.now().minusDays(10);
        total = 2000;

        String notice = resolver.resolve(marketId).notice();

        assertNotNull(notice);
        assertFalse(notice.contains("agente"),
            "10 dias de defasagem nao justifica alarme de coleta parada");
        assertTrue(notice.contains("Analisando o período"));
    }

    @Test
    @DisplayName("loja sem nota nenhuma não devolve zeros disfarçados de análise")
    void noDataIsExplicit() {
        oldest = null;
        latest = null;
        total = 0;

        SalesCoverage coverage = resolver.resolve(marketId);

        assertFalse(coverage.hasData());
        assertNotNull(coverage.notice());
        assertTrue(coverage.notice().contains("Ainda não recebemos"),
            "zero venda precisa ser 'sem dados', nao 'vendeu nada'");
    }
}
