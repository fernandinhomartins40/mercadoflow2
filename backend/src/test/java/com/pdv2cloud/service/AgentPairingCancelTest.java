package com.pdv2cloud.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.pdv2cloud.model.entity.AgentPairingSession;
import com.pdv2cloud.repository.AgentPairingSessionRepository;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.repository.PDVRepository;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** SEG-12: cancelar pareamento aprovado exige o segredo do agente. */
class AgentPairingCancelTest {

    private static final String SECRET = "segredo-do-agente";

    private AgentPairingSessionRepository repo;
    private AgentPairingService service;
    private AgentPairingSession session;

    @BeforeEach
    void setUp() throws Exception {
        repo = mock(AgentPairingSessionRepository.class);
        service = new AgentPairingService(repo, mock(AgentApiKeyService.class),
            mock(MarketRepository.class), mock(PDVRepository.class));
        session = new AgentPairingSession();
        session.setUserCode("ABCD2345");
        session.setAgentSecretHash(HexFormat.of().formatHex(
            MessageDigest.getInstance("SHA-256").digest(SECRET.getBytes(StandardCharsets.UTF_8))));
        when(repo.findByUserCode("ABCD2345")).thenReturn(Optional.of(session));
    }

    @Test
    void pendenteSemSegredoContinuaCancelavel() {
        session.setStatus(AgentPairingSession.Status.PENDING);
        service.cancel("abcd2345", null);
        assertThat(session.getStatus()).isEqualTo(AgentPairingSession.Status.CANCELLED);
    }

    @Test
    void aprovadoSemSegredoERecusadoEMantemAChave() {
        session.setStatus(AgentPairingSession.Status.APPROVED);
        session.setIssuedApiKey("chave");
        assertThatThrownBy(() -> service.cancel("ABCD2345", null)).isInstanceOf(SecurityException.class);
        assertThat(session.getStatus()).isEqualTo(AgentPairingSession.Status.APPROVED);
        assertThat(session.getIssuedApiKey()).isEqualTo("chave");
        verify(repo, never()).save(any());
    }

    @Test
    void aprovadoComSegredoCorretoECancelado() {
        session.setStatus(AgentPairingSession.Status.APPROVED);
        session.setIssuedApiKey("chave");
        service.cancel("ABCD2345", SECRET);
        assertThat(session.getStatus()).isEqualTo(AgentPairingSession.Status.CANCELLED);
        assertThat(session.getIssuedApiKey()).isNull();
    }

    @Test
    void segredoErradoERecusadoMesmoPendente() {
        session.setStatus(AgentPairingSession.Status.PENDING);
        assertThatThrownBy(() -> service.cancel("ABCD2345", "outro")).isInstanceOf(SecurityException.class);
        assertThat(session.getStatus()).isEqualTo(AgentPairingSession.Status.PENDING);
    }
}
