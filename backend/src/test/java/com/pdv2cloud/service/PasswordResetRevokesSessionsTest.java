package com.pdv2cloud.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.pdv2cloud.model.entity.User;
import com.pdv2cloud.repository.UserRepository;
import com.pdv2cloud.service.notify.EmailService;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;

/** SEG-05: o reset de senha marca a troca de credenciais para derrubar os tokens antigos. */
class PasswordResetRevokesSessionsTest {

    @Test
    void resetDeSenhaGravaCredentialsChangedAt() {
        NamedParameterJdbcTemplate jdbc = mock(NamedParameterJdbcTemplate.class);
        UserRepository users = mock(UserRepository.class);
        PasswordEncoder encoder = mock(PasswordEncoder.class);
        PasswordResetService service = new PasswordResetService(jdbc, users, encoder, mock(EmailService.class));
        UUID userId = UUID.randomUUID();
        User user = new User();
        user.setId(userId);
        when(jdbc.queryForList(contains("from password_reset_tokens"), anyMap()))
            .thenReturn(List.of(Map.of("id", UUID.randomUUID(), "user_id", userId, "expired", false, "used", false)));
        when(jdbc.update(contains("where id = :id and used_at is null"), anyMap())).thenReturn(1);
        when(users.findById(userId)).thenReturn(Optional.of(user));
        when(encoder.encode(anyString())).thenReturn("hash");
        LocalDateTime before = LocalDateTime.now();

        PasswordResetService.Result r = service.reset("a".repeat(64), "Senha!Forte1");

        assertThat(r.ok()).isTrue();
        assertThat(user.getCredentialsChangedAt()).isNotNull().isAfterOrEqualTo(before);
        verify(users).save(user);
    }
}
