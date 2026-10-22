package com.pdv2cloud.service.confere;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.pdv2cloud.service.CatalogImageStorageService;
import com.pdv2cloud.service.CatalogImageUrlResolver;
import com.pdv2cloud.service.ai.AiCredentialCipher;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

/**
 * REC-04: a leitura paga (Meu Danfe) reserva o crédito antes da chamada. Dois
 * pedidos com saldo 1: o segundo nem chama o provedor; falha devolve a leitura.
 */
class ConfereReadChargeTest {

    private final UUID market = UUID.randomUUID();
    private NamedParameterJdbcTemplate jdbc;
    private MeuDanfeClient meuDanfe;
    private ConfereService confere;

    @BeforeEach
    void setUp() {
        jdbc = mock(NamedParameterJdbcTemplate.class);
        meuDanfe = mock(MeuDanfeClient.class);
        AiCredentialCipher cipher = mock(AiCredentialCipher.class);
        when(cipher.isConfigured()).thenReturn(true);
        when(cipher.decrypt("enc")).thenReturn("chave");
        confere = new ConfereService(jdbc, cipher, meuDanfe, mock(SefazClient.class), mock(CatalogImageStorageService.class),
            mock(CatalogImageUrlResolver.class), mock(NfeItemStore.class));
        // Termos aceitos, sem certificado, nota ainda não guardada, saldo aparente de 1.
        when(jdbc.queryForObject(contains("terms_version"), anyMap(), eq(Integer.class))).thenReturn(1);
        when(jdbc.queryForList(contains("select balance"), anyMap(), eq(Integer.class))).thenReturn(List.of(1));
        when(jdbc.queryForObject(contains("meudanfe_api_key_enc"), anyMap(), eq(String.class))).thenReturn("enc");
    }

    @Test
    void semSaldoNaHoraDoDebitoNaoChamaProvedorPago() {
        // Outro pedido levou a última leitura: o UPDATE condicionado não acha linha.
        when(jdbc.update(contains("set balance = balance"), anyMap())).thenReturn(0);
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
            () -> confere.read(market, ConfereCoreTest.KEY, "teste"));
        assertTrue(e.getMessage().contains("leituras acabaram"));
        verify(meuDanfe, never()).fetch(anyString(), anyString());
    }

    @Test
    void falhaDoProvedorDevolveALeitura() {
        when(jdbc.update(contains("set balance = balance"), anyMap())).thenReturn(1);
        when(meuDanfe.fetch("chave", ConfereCoreTest.KEY))
            .thenReturn(new MeuDanfeClient.Result(MeuDanfeClient.Outcome.NOT_FOUND, null, "Nota não encontrada"));
        assertThrows(IllegalArgumentException.class, () -> confere.read(market, ConfereCoreTest.KEY, "teste"));
        verify(jdbc).update(contains("set balance = balance"), argThat((Map<String, ?> m) -> Integer.valueOf(-1).equals(m.get("d"))));
        verify(jdbc).update(contains("set balance = balance"), argThat((Map<String, ?> m) -> Integer.valueOf(1).equals(m.get("d"))));
        // Extrato: a leitura (-1) e a devolução (+1).
        verify(jdbc, org.mockito.Mockito.times(2)).update(contains("confere_ledger"), any(org.springframework.jdbc.core.namedparam.SqlParameterSource.class));
    }
}
