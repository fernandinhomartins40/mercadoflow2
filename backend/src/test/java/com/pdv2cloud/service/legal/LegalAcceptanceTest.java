package com.pdv2cloud.service.legal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.pdv2cloud.model.dto.MeResponse;
import com.pdv2cloud.model.dto.RegisterRequest;
import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.model.entity.User;
import com.pdv2cloud.model.entity.UserRole;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.repository.UserRepository;
import com.pdv2cloud.service.AuthService;
import com.pdv2cloud.service.ProductEventService;
import com.pdv2cloud.service.SubscriptionEventService;
import com.pdv2cloud.service.UserProfileService;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

/** S1 (parecer LGPD): aceite registrado dos Termos, da Privacidade e do DPA. */
class LegalAcceptanceTest {

    private final NamedParameterJdbcTemplate jdbc = mock(NamedParameterJdbcTemplate.class);
    private final LegalAcceptanceService legal = new LegalAcceptanceService(jdbc);

    private void accepted(List<Map<String, Object>> rows) {
        when(jdbc.queryForList(anyString(), any(SqlParameterSource.class))).thenReturn(rows);
    }

    private RegisterRequest request(Boolean accept) {
        RegisterRequest r = new RegisterRequest();
        r.setEmail("dono@mercado.com");
        r.setPassword("Senha!123");
        r.setName("Dono");
        r.setMarketName("Mercado Bom");
        r.setAcceptLegal(accept);
        return r;
    }

    @Test
    void cadastroSemAceiteERecusadoSemCriarNada() {
        AuthService auth = new AuthService();
        UserRepository users = mock(UserRepository.class);
        MarketRepository markets = mock(MarketRepository.class);
        ReflectionTestUtils.setField(auth, "userRepository", users);
        ReflectionTestUtils.setField(auth, "marketRepository", markets);
        ReflectionTestUtils.setField(auth, "legalAcceptance", legal);

        assertThrows(IllegalArgumentException.class, () -> auth.register(request(null), "1.2.3.4", "UA"));
        assertThrows(IllegalArgumentException.class, () -> auth.register(request(false), "1.2.3.4", "UA"));
        verifyNoInteractions(users, markets, jdbc);
    }

    @Test
    void cadastroComAceiteGravaAsTresLinhasDoDonoComAVersaoVigente() {
        AuthService auth = new AuthService();
        UserRepository users = mock(UserRepository.class);
        MarketRepository markets = mock(MarketRepository.class);
        PasswordEncoder encoder = mock(PasswordEncoder.class);
        UUID marketId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        when(users.findForAuthenticationByEmail("dono@mercado.com")).thenReturn(Optional.empty());
        when(markets.save(any(Market.class))).thenAnswer(i -> {
            Market m = i.getArgument(0);
            m.setId(marketId);
            return m;
        });
        when(users.save(any(User.class))).thenAnswer(i -> {
            User u = i.getArgument(0);
            u.setId(userId);
            return u;
        });
        when(encoder.encode(anyString())).thenReturn("hash");
        ReflectionTestUtils.setField(auth, "userRepository", users);
        ReflectionTestUtils.setField(auth, "marketRepository", markets);
        ReflectionTestUtils.setField(auth, "passwordEncoder", encoder);
        ReflectionTestUtils.setField(auth, "subscriptionEventService", mock(SubscriptionEventService.class));
        ReflectionTestUtils.setField(auth, "productEventService", mock(ProductEventService.class));
        ReflectionTestUtils.setField(auth, "legalAcceptance", legal);
        accepted(List.of());
        when(jdbc.update(anyString(), any(SqlParameterSource.class))).thenReturn(1);

        auth.register(request(true), "200.1.2.3", "Mozilla/5.0");

        ArgumentCaptor<SqlParameterSource> params = ArgumentCaptor.forClass(SqlParameterSource.class);
        verify(jdbc, times(3)).update(anyString(), params.capture());
        assertThat(params.getAllValues()).extracting(p -> p.getValue("d"))
            .containsExactly(LegalAcceptanceService.TERMS, LegalAcceptanceService.PRIVACY, LegalAcceptanceService.DPA);
        for (SqlParameterSource p : params.getAllValues()) {
            assertThat(p.getValue("v")).isEqualTo(LegalAcceptanceService.VERSION);
            assertThat(p.getValue("u")).isEqualTo(userId);
            assertThat(p.getValue("m")).isEqualTo(marketId);
            assertThat(p.getValue("ip")).isEqualTo("200.1.2.3");
            assertThat(p.getValue("ua")).isEqualTo("Mozilla/5.0");
        }
    }

    @Test
    void membroDaEquipeNaoAceitaODpa() {
        accepted(List.of());
        when(jdbc.update(anyString(), any(SqlParameterSource.class))).thenReturn(1);

        int rows = legal.record(UUID.randomUUID(), UUID.randomUUID(), UserRole.MARKET_MANAGER, "1.1.1.1", "UA");

        assertThat(rows).isEqualTo(2);
        ArgumentCaptor<SqlParameterSource> params = ArgumentCaptor.forClass(SqlParameterSource.class);
        verify(jdbc, times(2)).update(anyString(), params.capture());
        assertThat(params.getAllValues()).extracting(p -> p.getValue("d"))
            .containsExactly(LegalAcceptanceService.TERMS, LegalAcceptanceService.PRIVACY);
    }

    @Test
    void versaoAntigaPedeNovoAceiteEAVigenteLibera() {
        UUID userId = UUID.randomUUID();
        accepted(List.of(
            Map.of("document", "TERMS", "version", "2025-01-01"),
            Map.of("document", "PRIVACY", "version", "2025-01-01"),
            Map.of("document", "DPA", "version", "2025-01-01")));
        assertThat(legal.required(userId, UserRole.MARKET_OWNER)).isTrue();
        assertThat(legal.missing(userId, UserRole.MARKET_OWNER)).containsExactly("TERMS", "PRIVACY", "DPA");

        accepted(List.of(
            Map.of("document", "TERMS", "version", LegalAcceptanceService.VERSION),
            Map.of("document", "PRIVACY", "version", LegalAcceptanceService.VERSION),
            Map.of("document", "DPA", "version", LegalAcceptanceService.VERSION)));
        assertThat(legal.required(userId, UserRole.MARKET_OWNER)).isFalse();
    }

    @Test
    void meDoUsuarioComVersaoAntigaTrazLegalAcceptanceRequired() {
        UserProfileService profiles = new UserProfileService();
        UserRepository users = mock(UserRepository.class);
        User u = new User();
        u.setId(UUID.randomUUID());
        u.setEmail("dono@mercado.com");
        u.setName("Dono");
        u.setRole(UserRole.MARKET_OWNER);
        when(users.findForAuthenticationByEmail("dono@mercado.com")).thenReturn(Optional.of(u));
        ReflectionTestUtils.setField(profiles, "userRepository", users);
        ReflectionTestUtils.setField(profiles, "legalAcceptance", legal);
        accepted(List.of(Map.of("document", "TERMS", "version", "2025-01-01")));

        MeResponse me = profiles.getProfile("dono@mercado.com");

        assertThat(me.isLegalAcceptanceRequired()).isTrue();
    }

    @Test
    void superadminNaoPrecisaAceitar() {
        assertThat(legal.required(UUID.randomUUID(), UserRole.SUPER_ADMIN)).isFalse();
        verifyNoInteractions(jdbc);
    }
}
