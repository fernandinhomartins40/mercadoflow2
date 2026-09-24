package com.pdv2cloud.service;

import com.pdv2cloud.model.entity.AgentApiKey;
import com.pdv2cloud.model.entity.AgentPairingSession;
import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.tenancy.TenantContext;
import com.pdv2cloud.model.entity.PDV;
import com.pdv2cloud.repository.AgentPairingSessionRepository;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.repository.PDVRepository;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Pareamento do Agente Mercado Flow por QR Code (device pairing).
 *
 * O desenho evita o problema da abordagem anterior, em que a API key era embutida
 * no proprio QR exibido na tela: aqui o QR carrega apenas um codigo efemero e
 * inutil isoladamente. A chave so e gerada quando um usuario autenticado aprova
 * o pareamento, e so e entregue ao agente que provar posse do segredo sorteado
 * no passo 1 — nunca aparece em tela nem em foto.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class AgentPairingService {

    /** Alfabeto sem caracteres ambiguos (0/O, 1/I/L) — o codigo pode ser digitado a mao. */
    private static final String CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    private static final int CODE_LENGTH = 8;
    private static final int MAX_CODE_ATTEMPTS = 10;

    private final AgentPairingSessionRepository pairingRepository;
    private final AgentApiKeyService agentApiKeyService;
    private final MarketRepository marketRepository;
    private final PDVRepository pdvRepository;

    private final SecureRandom random = new SecureRandom();

    /**
     * Auto-referência para chamadas que precisam passar pelo proxy do Spring.
     * Chamar um método @Transactional diretamente de dentro da classe ignora o
     * proxy, e a transação simplesmente não abre — falha silenciosa.
     * @Lazy evita o ciclo de dependência na criação do bean.
     */
    @Autowired
    @Lazy
    private AgentPairingService self;

    @Value("${app.public-base-url:https://mercadoflow.com}")
    private String publicBaseUrl;

    @Value("${app.pairing.ttl-minutes:15}")
    private int ttlMinutes;

    // ── Passo 1: o agente inicia o pareamento (rota publica, sem credencial) ──

    /**
     * Nesta etapa o agente ainda não tem chave e a sessão não pertence a
     * mercado nenhum — o vínculo só existe após o approve. O escopo de sistema
     * vem do controller; ver a nota em {@link #claim(String, String)} sobre por
     * que ele não pode ser aplicado aqui dentro.
     */
    @Transactional
    public StartedPairing start(String hostname) {
        return doStart(hostname);
    }

    private StartedPairing doStart(String hostname) {
        String userCode = generateUniqueUserCode();
        String agentSecret = generateAgentSecret();

        AgentPairingSession session = new AgentPairingSession();
        session.setUserCode(userCode);
        session.setAgentSecretHash(sha256Hex(agentSecret));
        session.setStatus(AgentPairingSession.Status.PENDING);
        session.setHostname(truncate(hostname, 255));
        session.setExpiresAt(LocalDateTime.now().plusMinutes(ttlMinutes));
        pairingRepository.save(session);

        String pairingUrl = buildPairingUrl(userCode);
        log.info("Pareamento iniciado: userCode={} hostname={}", userCode, hostname);

        return new StartedPairing(userCode, agentSecret, pairingUrl, session.getExpiresAt(), ttlMinutes * 60);
    }

    // ── Passo 2: o usuario abre o link, autentica e confirma ─────────────────

    /** Consulta pelo codigo para a pagina web mostrar o que sera pareado. */
    @Transactional(readOnly = true)
    public AgentPairingSession requirePendingByUserCode(String userCode) {
        AgentPairingSession session = pairingRepository.findByUserCode(normalizeCode(userCode))
            .orElseThrow(() -> new IllegalArgumentException("Código de pareamento não encontrado"));

        if (session.isExpired()) {
            throw new IllegalStateException("Código de pareamento expirado. Reinicie a configuração no agente.");
        }
        if (session.getStatus() != AgentPairingSession.Status.PENDING) {
            throw new IllegalStateException("Este código de pareamento já foi utilizado.");
        }
        return session;
    }

    /**
     * Aprova o pareamento: cria (ou reaproveita) o PDV com o nome escolhido pelo
     * usuario, emite a API key e deixa-a reservada para o resgate pelo agente.
     */
    @Transactional
    public ApprovedPairing approve(String userCode, UUID marketId, String pdvName, UUID approvedByUserId) {
        AgentPairingSession session = requirePendingByUserCode(userCode);

        Market market = marketRepository.findById(marketId)
            .orElseThrow(() -> new IllegalArgumentException("Mercado não encontrado"));

        String normalizedPdvName = pdvName == null ? "" : pdvName.trim();
        if (normalizedPdvName.isEmpty()) {
            throw new IllegalArgumentException("Informe o nome do PDV");
        }

        PDV pdv = pdvRepository.findByMarketId(marketId).stream()
            .filter(candidate -> normalizedPdvName.equalsIgnoreCase(candidate.getName()))
            .findFirst()
            .orElseGet(() -> {
                PDV created = new PDV();
                created.setMarket(market);
                created.setName(normalizedPdvName);
                return pdvRepository.save(created);
            });

        AgentApiKeyService.GeneratedKey generated =
            agentApiKeyService.createKey(marketId, normalizedPdvName, pdv);

        session.setMarket(market);
        session.setPdv(pdv);
        session.setPdvName(normalizedPdvName);
        session.setAgentApiKey(generated.entity());
        session.setIssuedApiKey(generated.rawKey());
        session.setApprovedByUserId(approvedByUserId);
        session.setApprovedAt(LocalDateTime.now());
        session.setStatus(AgentPairingSession.Status.APPROVED);
        pairingRepository.save(session);

        log.info("Pareamento aprovado: userCode={} marketId={} pdv={}", userCode, marketId, normalizedPdvName);
        return new ApprovedPairing(market.getName(), normalizedPdvName, pdv.getId());
    }

    // ── Passo 3: o agente resgata a chave provando posse do segredo ──────────

    /**
     * Entrega a API key ao agente uma unica vez. O texto puro e apagado da linha
     * no mesmo instante, de modo que um vazamento posterior do banco nao exponha
     * credencial alguma.
     */
    /**
     * O agente resgata a chave antes de possuir credencial, então não há tenant
     * na sessão — a autorização aqui é o segredo conferido abaixo, não o RLS.
     *
     * O escopo de sistema é aplicado pelo AgentPairingController, ANTES de
     * entrar neste método. O motivo é a ordem em que as coisas acontecem: o
     * TenantAwareDataSource fixa app.current_market/app.is_admin no checkout da
     * conexão, e @Transactional obtém a conexão antes do corpo executar. Um
     * runAsSystem aqui dentro marcaria is_admin numa conexão já configurada sem
     * tenant, tarde demais — era o que prendia o agente em "aguardando", com o
     * claim respondendo "Código de pareamento não encontrado" para uma sessão
     * que existe e está aprovada.
     */
    @Transactional
    public ClaimResult claim(String userCode, String agentSecret) {
        return doClaim(userCode, agentSecret);
    }

    private ClaimResult doClaim(String userCode, String agentSecret) {
        AgentPairingSession session = pairingRepository.findByUserCode(normalizeCode(userCode))
            .orElseThrow(() -> new IllegalArgumentException("Código de pareamento não encontrado"));

        // Verificacao em tempo constante: o segredo e a unica prova de que quem
        // consulta e mesmo o agente que iniciou o pareamento.
        if (!constantTimeEquals(session.getAgentSecretHash(), sha256Hex(agentSecret == null ? "" : agentSecret))) {
            log.warn("Tentativa de resgate com segredo invalido: userCode={}", userCode);
            throw new SecurityException("Segredo de pareamento inválido");
        }

        if (session.isExpired() && session.getStatus() != AgentPairingSession.Status.CONSUMED) {
            session.setStatus(AgentPairingSession.Status.EXPIRED);
            session.setIssuedApiKey(null);
            pairingRepository.save(session);
            return ClaimResult.expired();
        }

        return switch (session.getStatus()) {
            case PENDING -> ClaimResult.pending();
            case APPROVED -> {
                String rawKey = session.getIssuedApiKey();
                session.setIssuedApiKey(null);
                session.setStatus(AgentPairingSession.Status.CONSUMED);
                session.setConsumedAt(LocalDateTime.now());
                pairingRepository.save(session);

                log.info("Pareamento resgatado pelo agente: userCode={}", userCode);
                yield ClaimResult.approved(
                    rawKey,
                    session.getMarket().getId(),
                    session.getMarket().getName(),
                    session.getPdv() != null ? session.getPdv().getId() : null,
                    session.getPdvName()
                );
            }
            // Reentrega e proibida: a chave ja saiu e nao esta mais armazenada.
            case CONSUMED -> ClaimResult.consumed();
            case EXPIRED -> ClaimResult.expired();
            case CANCELLED -> ClaimResult.cancelled();
        };
    }

    /** Rota publica: o agente desiste antes de ter credencial. Escopo de sistema no controller. */
    @Transactional
    public void cancel(String userCode) {
        doCancel(userCode);
    }

    private void doCancel(String userCode) {
        pairingRepository.findByUserCode(normalizeCode(userCode)).ifPresent(session -> {
            if (session.getStatus() == AgentPairingSession.Status.PENDING
                || session.getStatus() == AgentPairingSession.Status.APPROVED) {
                session.setStatus(AgentPairingSession.Status.CANCELLED);
                session.setIssuedApiKey(null);
                pairingRepository.save(session);
            }
        });
    }

    /**
     * Fecha sessoes abandonadas de hora em hora para nao acumular chaves
     * reservadas.
     *
     * O runAsSystem envolve a chamada transacional, e nao o contrário: o
     * escopo precisa estar definido antes de a conexão ser obtida. Chama via
     * self para passar pelo proxy do Spring — auto-invocação direta ignoraria
     * o @Transactional.
     */
    public void expireStaleSessions() {
        TenantContext.runAsSystem(() -> self.expireStaleSessionsTransacional());
    }

    @Transactional
    public void expireStaleSessionsTransacional() {
        int expired = pairingRepository.expireStaleSessions(LocalDateTime.now());
        if (expired > 0) {
            log.info("Sessoes de pareamento expiradas: {}", expired);
        }
    }

    public String buildPairingUrl(String userCode) {
        String base = publicBaseUrl == null ? "" : publicBaseUrl.replaceAll("/+$", "");
        return base + "/parear-agente?codigo=" + userCode;
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    private String generateUniqueUserCode() {
        for (int attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
            StringBuilder sb = new StringBuilder(CODE_LENGTH);
            for (int i = 0; i < CODE_LENGTH; i++) {
                sb.append(CODE_ALPHABET.charAt(random.nextInt(CODE_ALPHABET.length())));
            }
            String candidate = sb.toString();
            if (!pairingRepository.existsByUserCode(candidate)) {
                return candidate;
            }
        }
        throw new IllegalStateException("Não foi possível gerar um código de pareamento único");
    }

    private String generateAgentSecret() {
        byte[] buffer = new byte[32];
        random.nextBytes(buffer);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(buffer);
    }

    private static String normalizeCode(String userCode) {
        return userCode == null ? "" : userCode.trim().toUpperCase();
    }

    private static String truncate(String value, int max) {
        if (value == null) {
            return null;
        }
        return value.length() <= max ? value : value.substring(0, max);
    }

    private static boolean constantTimeEquals(String a, String b) {
        if (a == null || b == null) {
            return false;
        }
        return MessageDigest.isEqual(a.getBytes(StandardCharsets.UTF_8), b.getBytes(StandardCharsets.UTF_8));
    }

    private static String sha256Hex(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(hash.length * 2);
            for (byte b : hash) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to hash pairing secret", ex);
        }
    }

    // ── Tipos de retorno ────────────────────────────────────────────────────

    public record StartedPairing(
        String userCode,
        String agentSecret,
        String pairingUrl,
        LocalDateTime expiresAt,
        long expiresInSeconds
    ) {}

    public record ApprovedPairing(String marketName, String pdvName, UUID pdvId) {}

    public record ClaimResult(
        String status,
        String apiKey,
        UUID marketId,
        String marketName,
        UUID pdvId,
        String pdvName
    ) {
        static ClaimResult pending() {
            return new ClaimResult("PENDING", null, null, null, null, null);
        }

        static ClaimResult approved(String apiKey, UUID marketId, String marketName, UUID pdvId, String pdvName) {
            return new ClaimResult("APPROVED", apiKey, marketId, marketName, pdvId, pdvName);
        }

        static ClaimResult consumed() {
            return new ClaimResult("CONSUMED", null, null, null, null, null);
        }

        static ClaimResult expired() {
            return new ClaimResult("EXPIRED", null, null, null, null, null);
        }

        static ClaimResult cancelled() {
            return new ClaimResult("CANCELLED", null, null, null, null, null);
        }

        public List<String> terminalStatuses() {
            return List.of("CONSUMED", "EXPIRED", "CANCELLED");
        }
    }
}
