package com.pdv2cloud.service.ai.platform;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;

/**
 * REC-10: o teto mensal de IA é conferido no próprio UPDATE do débito, junto
 * com o saldo. Duas chamadas simultâneas não passam mais do teto: a segunda
 * não casa o WHERE e o débito volta false, o mesmo fluxo do saldo esgotado.
 */
class AiWalletDebitCapTest {

    private final NamedParameterJdbcTemplate jdbc = mock(NamedParameterJdbcTemplate.class);
    private final AiWalletService wallets = new AiWalletService(jdbc);
    private final UUID market = UUID.randomUUID();

    @Test
    void oUpdateDoDebitoConfereSaldoETetoNaMesmaInstrucao() {
        String sql = AiWalletService.DEBIT_SQL;
        String where = sql.substring(sql.indexOf(" where "));
        assertTrue(where.contains("included_balance + balance >= :c"), "saldo no WHERE");
        assertTrue(where.contains("month_used::bigint + :c <= coalesce(monthly_cap"), "teto do mês no WHERE");
        assertTrue(where.contains("default_monthly_cap_credits"), "teto padrão da plataforma quando o mercado não tem um");
        assertTrue(where.contains("+ included_granted"), "créditos do plano entram por cima do teto, como no wallet()");
    }

    @Test
    void tetoEstouradoNaoDebitaNemRegistraUso() {
        when(jdbc.update(eq(AiWalletService.DEBIT_SQL), anyMap())).thenReturn(0);

        assertFalse(wallets.debit(market, 5, "CHAT", "ref"));

        verify(jdbc, never()).update(argThat((String s) -> s.startsWith("insert into ai_ledger")), (SqlParameterSource) org.mockito.ArgumentMatchers.any());
    }

    @Test
    void dentroDoTetoDebitaERegistra() {
        when(jdbc.update(eq(AiWalletService.DEBIT_SQL), anyMap())).thenReturn(1);

        assertTrue(wallets.debit(market, 5, "CHAT", "ref"));

        verify(jdbc).update(argThat((String s) -> s.startsWith("insert into ai_ledger")), (SqlParameterSource) org.mockito.ArgumentMatchers.any());
    }

    @Test
    void semCreditosNaoTocaNoBanco() {
        assertTrue(wallets.debit(market, 0, "CHAT", "ref"));
        verify(jdbc, never()).update(anyString(), anyMap());
    }
}
