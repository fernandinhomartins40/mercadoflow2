package com.pdv2cloud.service.account;

import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.service.StripeAdminService;
import com.pdv2cloud.service.billing.AsaasService;
import com.pdv2cloud.service.billing.SubscriptionService;
import com.pdv2cloud.service.billing.SubscriptionService.Status;
import com.pdv2cloud.service.notify.EmailService;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * "Excluir minha conta" (LGPD-03). O pedido bloqueia o acesso na hora e marca a
 * anonimização para daqui a 30 dias; até lá dá para desistir. Quem anonimiza é
 * o {@link AccountAnonymizer}, chamado pelo job noturno.
 *
 * Regras de papel:
 *  - membro da equipe: exclui só o próprio usuário;
 *  - dono com outras pessoas ativas na equipe: recusado (transfira a titularidade antes);
 *  - dono sozinho: a exclusão vale para a conta da loja (rede inteira) e a
 *    assinatura é cancelada no fim do período pago, sem estorno.
 *
 * Quem chama roda em TenantContext.runAsSystem: o pedido mexe em users,
 * subscriptions e ownership_transfers, que têm RLS.
 */
@Service
public class AccountDeletionService {

    private static final Logger log = LoggerFactory.getLogger(AccountDeletionService.class);
    public static final int GRACE_DAYS = 30;
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("dd/MM/yyyy");
    private static final Set<Status> BILLED = Set.of(Status.ACTIVE, Status.PAST_DUE, Status.RESTRICTED, Status.PAUSED);

    private final NamedParameterJdbcTemplate jdbc;
    private final PasswordEncoder passwords;
    private final EmailService email;
    private final SubscriptionService subscriptions;
    private final AsaasService asaas;
    private final StripeAdminService stripeAdmin;
    private final MarketRepository markets;

    public AccountDeletionService(NamedParameterJdbcTemplate jdbc, PasswordEncoder passwords, EmailService email,
                                  SubscriptionService subscriptions, AsaasService asaas, StripeAdminService stripeAdmin,
                                  MarketRepository markets) {
        this.jdbc = jdbc;
        this.passwords = passwords;
        this.email = email;
        this.subscriptions = subscriptions;
        this.asaas = asaas;
        this.stripeAdmin = stripeAdmin;
        this.markets = markets;
    }

    // ── Leitura ──────────────────────────────────────────────────────────

    /** Estado do pedido desta pessoa: pendente (com a data) ou nenhum. */
    public Map<String, Object> status(UUID userId) {
        Map<String, Object> out = new LinkedHashMap<>();
        Optional<Map<String, Object>> p = pending(userId);
        out.put("pending", p.isPresent());
        out.put("graceDays", GRACE_DAYS);
        p.ifPresent(r -> {
            out.put("scope", r.get("scope"));
            out.put("requestedAt", r.get("requested_at"));
            out.put("scheduledFor", r.get("scheduled_for"));
        });
        return out;
    }

    /** Data em que a anonimização acontece, se houver pedido pendente (usado pelo login). */
    public Optional<LocalDateTime> pendingUntil(UUID userId) {
        return pending(userId).map(r -> ((Timestamp) r.get("scheduled_for")).toLocalDateTime());
    }

    private Optional<Map<String, Object>> pending(UUID userId) {
        List<Map<String, Object>> rows = jdbc.queryForList("select id, scope, requested_at, scheduled_for from account_deletion_requests "
            + "where user_id = :u and status = 'PENDING'", Map.of("u", userId));
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    // ── Pedir ────────────────────────────────────────────────────────────

    @Transactional
    public Map<String, Object> request(UUID userId, String password) {
        List<Map<String, Object>> rows = jdbc.queryForList("select id, email, name, password, role, market_id, is_active from users "
            + "where id = :u for update", Map.of("u", userId));
        if (rows.isEmpty()) {
            throw new IllegalArgumentException("Conta não encontrada.");
        }
        Map<String, Object> user = rows.get(0);
        if (password == null || password.isBlank() || !passwords.matches(password, (String) user.get("password"))) {
            throw new IllegalArgumentException("Senha incorreta.");
        }
        if (pending(userId).isPresent()) {
            throw new IllegalStateException("Já existe um pedido de exclusão em andamento para esta conta.");
        }
        String mail = (String) user.get("email");
        UUID market = (UUID) user.get("market_id");
        boolean owner = "MARKET_OWNER".equals(user.get("role"));
        String scope = "USER";
        UUID root = market;
        String subscriptionNote = null;
        String storeName = null;
        if (owner && market != null) {
            root = subscriptions.rootOf(market);
            Integer others = jdbc.queryForObject("select count(*) from users u join markets m on m.id = u.market_id "
                + "where (m.id = :r or m.parent_market_id = :r) and u.id <> :u and u.is_active", Map.of("r", root, "u", userId), Integer.class);
            if (others != null && others > 0) {
                throw new IllegalStateException("Sua loja tem outras pessoas na equipe. Antes de excluir a sua conta, passe a "
                    + "titularidade para uma delas em Loja → Equipe. Se ninguém vai continuar, desative essas pessoas primeiro.");
            }
            scope = "STORE";
            storeName = jdbc.queryForObject("select name from markets where id = :r", Map.of("r", root), String.class);
            // Antes de gravar: se o Asaas/Stripe recusar, nada muda e a pessoa tenta de novo.
            subscriptionNote = cancelSubscription(root, mail);
        }
        LocalDateTime scheduled = LocalDateTime.now().plusDays(GRACE_DAYS);
        jdbc.update("insert into account_deletion_requests (user_id, market_id, scope, scheduled_for, subscription_note) "
                + "values (:u, :m, :s, :x, :n)",
            new MapSqlParameterSource().addValue("u", userId).addValue("m", root).addValue("s", scope)
                .addValue("x", Timestamp.valueOf(scheduled)).addValue("n", subscriptionNote));
        // Bloqueia na hora: is_active barra o login e credentials_changed_at derruba as sessões (SEG-05).
        jdbc.update("update users set is_active = false, credentials_changed_at = now(), updated_at = now() where id = :u",
            Map.of("u", userId));
        // Pedido de titularidade em aberto, de ou para esta pessoa, deixa de valer.
        jdbc.update("update ownership_transfers set status = 'CANCELED', decided_at = now() "
            + "where (from_user_id = :u or to_user_id = :u) and status = 'PENDING'", Map.of("u", userId));
        notifyRequested(mail, (String) user.get("name"), scheduled, storeName);
        return status(userId);
    }

    /**
     * Fluxo de cancelamento existente (fim do período pago, sem estorno). Devolve
     * o que aconteceu, para o registro do pedido.
     */
    String cancelSubscription(UUID root, String actor) {
        SubscriptionService.Subscription s = subscriptions.of(root);
        if (!BILLED.contains(s.status()) || s.cancelAtPeriodEnd()) {
            return "Sem assinatura paga ativa";
        }
        String provider = s.provider();
        try {
            if (AsaasService.PROVIDER.equals(provider)) {
                asaas.cancelSubscription(s.providerSubscriptionId());
            } else if ("STRIPE".equals(provider)) {
                Market market = markets.findById(root).orElseThrow();
                if (stripeAdmin.cancelSubscription(market, true, "EXCLUSAO_CONTA") != null) {
                    throw new IllegalStateException("stripe");
                }
            } else {
                // Contrato negociado: o comercial encerra por lá. Não impede a exclusão.
                log.warn("Exclusão de conta da rede {} com assinatura {}: avisar o comercial", root, provider);
                return "Assinatura negociada (" + provider + "): avisar o comercial";
            }
        } catch (RuntimeException e) {
            log.warn("Exclusão de conta: cancelamento da assinatura da rede {} falhou: {}", root, e.getMessage());
            throw new IllegalStateException("Não conseguimos cancelar a assinatura agora. Tente de novo em alguns minutos.");
        }
        subscriptions.cancel(root, true, "Exclusão de conta pedida pelo dono (" + actor + ")");
        subscriptions.recordExit(root, "OUTRO", "Pedido de exclusão da conta", "CANCELED", actor);
        return "Assinatura cancelada no fim do período pago (" + provider + ")";
    }

    // ── Desistir ─────────────────────────────────────────────────────────

    /** Desiste dentro do prazo: o acesso volta. A assinatura cancelada não volta sozinha. */
    @Transactional
    public Map<String, Object> cancel(UUID userId) {
        List<Map<String, Object>> rows = jdbc.queryForList("select id, scope, scheduled_for from account_deletion_requests "
            + "where user_id = :u and status = 'PENDING' for update", Map.of("u", userId));
        if (rows.isEmpty()) {
            throw new IllegalArgumentException("Não há pedido de exclusão em andamento.");
        }
        Map<String, Object> r = rows.get(0);
        if (((Timestamp) r.get("scheduled_for")).toLocalDateTime().isBefore(LocalDateTime.now())) {
            throw new IllegalStateException("O prazo para desistir terminou.");
        }
        jdbc.update("update account_deletion_requests set status = 'CANCELED', canceled_at = now() where id = :id",
            Map.of("id", r.get("id")));
        jdbc.update("update users set is_active = true, updated_at = now() where id = :u", Map.of("u", userId));
        Map<String, Object> out = status(userId);
        out.put("restored", true);
        if ("STORE".equals(r.get("scope"))) {
            out.put("userMessage", "Pronto, a sua conta continua. Se você tinha plano pago, a assinatura foi cancelada no pedido: "
                + "para continuar nele, assine de novo em Minha assinatura.");
        } else {
            out.put("userMessage", "Pronto, a sua conta continua. Entre de novo com o seu e-mail e senha.");
        }
        String mail = jdbc.queryForObject("select email from users where id = :u", Map.of("u", userId), String.class);
        send(mail, "Você desistiu de excluir a sua conta no MercadoFlow", "Exclusão cancelada",
            List.of("Recebemos a sua desistência. A sua conta continua e o acesso já foi liberado.",
                "Se não foi você, troque a sua senha agora."));
        return out;
    }

    /** Desistência pela tela de login: a sessão já caiu, então confere e-mail e senha. */
    public Map<String, Object> cancelWithPassword(String rawEmail, String password) {
        String mail = rawEmail == null ? "" : rawEmail.trim().toLowerCase();
        List<Map<String, Object>> rows = jdbc.queryForList("select id, password from users where lower(email) = :e",
            Map.of("e", mail));
        if (rows.isEmpty() || password == null || !passwords.matches(password, (String) rows.get(0).get("password"))) {
            throw new IllegalArgumentException("E-mail ou senha incorretos.");
        }
        return cancel((UUID) rows.get(0).get("id"));
    }

    // ── Apoio ────────────────────────────────────────────────────────────

    private void notifyRequested(String to, String name, LocalDateTime scheduled, String storeName) {
        String first = name == null || name.isBlank() ? "Olá!" : "Olá, " + name.trim().split("\\s+")[0] + "!";
        List<String> body = new java.util.ArrayList<>(List.of(
            first + " Recebemos o pedido para excluir a sua conta. O acesso já foi bloqueado.",
            "Em " + scheduled.format(DAY) + " os seus dados pessoais serão apagados. As notas fiscais ficam guardadas, "
                + "como a lei exige, sem os dados pessoais."));
        if (storeName != null) {
            body.add("A conta da loja " + storeName + " também será encerrada. Se havia plano pago, a assinatura foi cancelada "
                + "e não haverá novas cobranças.");
        }
        body.add("Mudou de ideia? Até essa data, entre no MercadoFlow ou no Bipaê com o seu e-mail e senha e toque em "
            + "\"Desistir da exclusão\". Se não foi você que pediu, faça isso agora e depois troque a senha.");
        send(to, "Pedido de exclusão da sua conta no MercadoFlow", "Pedido de exclusão recebido", body);
    }

    private void send(String to, String subject, String title, List<String> body) {
        try {
            EmailService.Sent sent = email.send(to, subject, title, body, "Abrir o MercadoFlow", email.link("/login"));
            if (!sent.ok()) {
                log.info("Exclusão de conta: e-mail não enviado ({})", sent.error());
            }
        } catch (RuntimeException e) {
            // E-mail é aviso: não desfaz o pedido nem a desistência.
            log.warn("Exclusão de conta: falha ao enviar e-mail: {}", e.getMessage());
        }
    }
}
