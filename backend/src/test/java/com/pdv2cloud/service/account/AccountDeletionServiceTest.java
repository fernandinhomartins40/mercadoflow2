package com.pdv2cloud.service.account;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.service.billing.AsaasService;
import com.pdv2cloud.service.billing.SubscriptionService;
import com.pdv2cloud.service.notify.EmailService;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;

/** LGPD-03: pedir exige a senha; dono com equipe é recusado; desistir reativa. */
class AccountDeletionServiceTest {

    private NamedParameterJdbcTemplate jdbc;
    private PasswordEncoder passwords;
    private SubscriptionService subscriptions;
    private AsaasService asaas;
    private AccountDeletionService service;
    private final UUID userId = UUID.randomUUID();
    private final UUID market = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        jdbc = mock(NamedParameterJdbcTemplate.class);
        passwords = mock(PasswordEncoder.class);
        subscriptions = mock(SubscriptionService.class);
        asaas = mock(AsaasService.class);
        service = new AccountDeletionService(jdbc, passwords, mock(EmailService.class), subscriptions, asaas,
            mock(MarketRepository.class));
        when(passwords.matches("Certa@123", "hash")).thenReturn(true);
    }

    private void user(String role) {
        Map<String, Object> u = new HashMap<>();
        u.put("id", userId);
        u.put("email", "pessoa@loja.com");
        u.put("name", "Maria Silva");
        u.put("password", "hash");
        u.put("role", role);
        u.put("market_id", market);
        u.put("is_active", true);
        when(jdbc.queryForList(contains("from users"), anyMap())).thenReturn(List.of(u));
    }

    @Test
    void pedirComSenhaErradaNaoBloqueiaNada() {
        user("MARKET_MANAGER");

        IllegalArgumentException e = assertThrows(IllegalArgumentException.class, () -> service.request(userId, "errada"));

        assertEquals("Senha incorreta.", e.getMessage());
        verify(jdbc, never()).update(contains("is_active = false"), anyMap());
        verify(jdbc, never()).update(contains("insert into account_deletion_requests"), any(MapSqlParameterSource.class));
    }

    @Test
    void pedirSemSenhaTambemERecusado() {
        user("MARKET_MANAGER");
        assertThrows(IllegalArgumentException.class, () -> service.request(userId, null));
        verify(jdbc, never()).update(contains("is_active = false"), anyMap());
    }

    @Test
    void membroComSenhaCertaBloqueiaSoOProprioUsuarioEmTrintaDias() {
        user("MARKET_MANAGER");

        service.request(userId, "Certa@123");

        verify(jdbc).update(contains("insert into account_deletion_requests"), any(MapSqlParameterSource.class));
        verify(jdbc).update(contains("set is_active = false, credentials_changed_at = now()"), eq(Map.of("u", userId)));
        // Membro: a assinatura da loja não é tocada.
        verify(subscriptions, never()).of(any());
        verify(asaas, never()).cancelSubscription(anyString());
    }

    @Test
    void donoComOutrasPessoasNaEquipeERecusado() {
        user("MARKET_OWNER");
        when(subscriptions.rootOf(market)).thenReturn(market);
        when(jdbc.queryForObject(contains("count(*) from users"), anyMap(), eq(Integer.class))).thenReturn(2);

        IllegalStateException e = assertThrows(IllegalStateException.class, () -> service.request(userId, "Certa@123"));

        assertEquals(true, e.getMessage().contains("titularidade"));
        verify(jdbc, never()).update(contains("is_active = false"), anyMap());
        verify(asaas, never()).cancelSubscription(anyString());
    }

    @Test
    void donoSozinhoCancelaAAssinaturaSemEstorno() {
        user("MARKET_OWNER");
        when(subscriptions.rootOf(market)).thenReturn(market);
        when(jdbc.queryForObject(contains("count(*) from users"), anyMap(), eq(Integer.class))).thenReturn(0);
        when(subscriptions.of(market)).thenReturn(new SubscriptionService.Subscription(market, "ESSENCIAL",
            SubscriptionService.Status.ACTIVE, AsaasService.PROVIDER, "cus_1", "sub_1", "PIX", LocalDateTime.now().plusDays(10),
            false, null, null, false, null, null, null, null, null, null));

        service.request(userId, "Certa@123");

        verify(asaas).cancelSubscription("sub_1");
        verify(subscriptions).cancel(eq(market), eq(true), anyString());
        verify(jdbc).update(contains("set is_active = false"), eq(Map.of("u", userId)));
    }

    @Test
    void desistirDentroDoPrazoReativa() {
        UUID req = UUID.randomUUID();
        when(jdbc.queryForList(contains("for update"), anyMap())).thenReturn(List.of(Map.of("id", req, "scope", "USER",
            "scheduled_for", Timestamp.valueOf(LocalDateTime.now().plusDays(10)))));

        Map<String, Object> out = service.cancel(userId);

        verify(jdbc).update(contains("status = 'CANCELED'"), eq(Map.of("id", req)));
        verify(jdbc).update(contains("set is_active = true"), eq(Map.of("u", userId)));
        assertEquals(true, out.get("restored"));
    }

    @Test
    void desistirDepoisDoPrazoNaoReativa() {
        when(jdbc.queryForList(contains("for update"), anyMap())).thenReturn(List.of(Map.of("id", UUID.randomUUID(), "scope", "USER",
            "scheduled_for", Timestamp.valueOf(LocalDateTime.now().minusHours(1)))));

        assertThrows(IllegalStateException.class, () -> service.cancel(userId));
        verify(jdbc, never()).update(contains("set is_active = true"), anyMap());
    }

    @Test
    void desistirPeloLoginExigeSenhaCerta() {
        when(jdbc.queryForList(contains("from users where lower(email)"), anyMap()))
            .thenReturn(List.of(Map.of("id", userId, "password", "hash")));

        assertThrows(IllegalArgumentException.class, () -> service.cancelWithPassword("pessoa@loja.com", "errada"));
        verify(jdbc, never()).update(contains("set is_active = true"), anyMap());
    }
}
