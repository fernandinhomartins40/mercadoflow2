package com.pdv2cloud.service.team;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.pdv2cloud.service.ai.AiCredentialCipher;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;

/** SEG-02: o limite de 5 tentativas do código de 2 etapas precisa sobreviver ao erro. */
class TwoFactorAttemptsTest {

    @Test
    void codigoErradoNaoDesfazOContadorDeTentativas() throws Exception {
        Transactional tx = TwoFactorService.class.getMethod("complete", String.class, String.class)
            .getAnnotation(Transactional.class);
        assertTrue(tx != null && Arrays.asList(tx.noRollbackFor()).contains(IllegalArgumentException.class),
            "complete() precisa de noRollbackFor = IllegalArgumentException");
    }

    @Test
    void codigoErradoSomaUmaTentativa() {
        NamedParameterJdbcTemplate jdbc = mock(NamedParameterJdbcTemplate.class);
        TwoFactorService service = new TwoFactorService(jdbc, mock(AiCredentialCipher.class), mock(PasswordEncoder.class));
        UUID id = UUID.randomUUID();
        when(jdbc.queryForList(contains("from mfa_challenges"), anyMap()))
            .thenReturn(List.of(Map.of("id", id, "user_id", UUID.randomUUID(), "keep", false, "attempts", 0)));

        assertThrows(IllegalArgumentException.class, () -> service.complete("abc", "123456"));
        verify(jdbc).update(contains("attempts = attempts + 1"), eq(Map.of("id", id)));
    }

    @Test
    void quintaTentativaQueimaODesafio() {
        NamedParameterJdbcTemplate jdbc = mock(NamedParameterJdbcTemplate.class);
        TwoFactorService service = new TwoFactorService(jdbc, mock(AiCredentialCipher.class), mock(PasswordEncoder.class));
        UUID id = UUID.randomUUID();
        when(jdbc.queryForList(contains("from mfa_challenges"), anyMap()))
            .thenReturn(List.of(Map.of("id", id, "user_id", UUID.randomUUID(), "keep", false, "attempts", 5)));

        assertThrows(IllegalArgumentException.class, () -> service.complete("abc", "123456"));
        verify(jdbc).update(contains("set used_at = now()"), eq(Map.of("id", id)));
    }
}
