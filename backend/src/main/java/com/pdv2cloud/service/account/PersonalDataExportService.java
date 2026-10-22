package com.pdv2cloud.service.account;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * "Baixar meus dados" (LGPD art. 18, II e V; parecer S6). Monta a cópia dos
 * dados pessoais DA PRÓPRIA pessoa: perfil, 2FA (só se está ligado), convites,
 * titularidade, aceites legais, pedidos de exclusão, consentimento do WhatsApp,
 * auditoria (com IP e navegador, que são dela) e, para o dono, o cadastro da loja.
 *
 * Nunca sai: senha, hashes, tokens, segredo TOTP, códigos de recuperação, chaves
 * de API, nem e-mail/nome de outras pessoas (convites e titularidade saem só com
 * papel, situação e datas). As colunas são escolhidas uma a uma e, por garantia,
 * o resultado ainda passa por {@link #scrub} que remove chave com nome sensível.
 *
 * Quem chama roda em TenantContext.runAsSystem (users, audit_logs etc. têm RLS).
 */
@Service
public class PersonalDataExportService {

    private static final Logger log = LoggerFactory.getLogger(PersonalDataExportService.class);
    public static final Duration MIN_INTERVAL = Duration.ofMinutes(10);
    static final int AUDIT_LIMIT = 5_000;
    static final int WHATSAPP_LIMIT = 2_000;
    /** Nome de chave que nunca pode aparecer no arquivo, venha de onde vier. */
    static final Pattern SENSITIVE = Pattern.compile(
        "(?i).*(password|senha|hash|token|secret|segredo|totp|recovery|api_?key|apikey|pfx|_enc$|salt).*");

    /** Recusa por frequência: no máximo uma exportação a cada 10 minutos por pessoa. */
    public static class TooSoonException extends RuntimeException {
        private final long retryAfterSeconds;

        public TooSoonException(long retryAfterSeconds) {
            super("Você já baixou os seus dados há pouco. Tente de novo em "
                + Math.max(1, (retryAfterSeconds + 59) / 60) + " minuto(s).");
            this.retryAfterSeconds = retryAfterSeconds;
        }

        public long retryAfterSeconds() {
            return retryAfterSeconds;
        }
    }

    private final NamedParameterJdbcTemplate jdbc;
    private final Clock clock;
    private final Map<UUID, Instant> lastExport = new ConcurrentHashMap<>();

    @Autowired
    public PersonalDataExportService(NamedParameterJdbcTemplate jdbc) {
        this(jdbc, Clock.systemUTC());
    }

    PersonalDataExportService(NamedParameterJdbcTemplate jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    /** Reserva a vez (ou recusa) e monta a cópia. Se a montagem falhar, a vez é devolvida. */
    public Map<String, Object> export(UUID userId) {
        Instant now = clock.instant();
        Instant[] previous = new Instant[1];
        boolean[] allowed = new boolean[1];
        lastExport.compute(userId, (k, last) -> {
            previous[0] = last;
            allowed[0] = last == null || !now.isBefore(last.plus(MIN_INTERVAL));
            return allowed[0] ? now : last;
        });
        if (!allowed[0]) {
            throw new TooSoonException(Duration.between(now, previous[0].plus(MIN_INTERVAL)).toSeconds());
        }
        try {
            return build(userId, now);
        } catch (RuntimeException e) {
            if (previous[0] == null) {
                lastExport.remove(userId, now);
            } else {
                lastExport.replace(userId, now, previous[0]);
            }
            throw e;
        }
    }

    Map<String, Object> build(UUID userId, Instant now) {
        Map<String, Object> u = jdbc.queryForMap("select id, name, email, role, team_role, market_id, is_active, totp_enabled, "
            + "created_at, updated_at, last_login_at from users where id = :u", Map.of("u", userId));
        String email = (String) u.get("email");
        UUID market = (UUID) u.get("market_id");
        boolean owner = "MARKET_OWNER".equals(u.get("role"));

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("about", "Cópia dos seus dados pessoais no MercadoFlow (LGPD, art. 18). Não inclui a sua senha nem "
            + "códigos de segurança. Dúvidas: privacidade@mercadoflow.com.");
        out.put("generatedAt", now.truncatedTo(ChronoUnit.SECONDS).toString());

        Map<String, Object> profile = new LinkedHashMap<>();
        profile.put("id", u.get("id"));
        profile.put("name", u.get("name"));
        profile.put("email", email);
        // A conta não guarda telefone próprio; o único telefone ligado a ela é o do WhatsApp do Copiloto (abaixo).
        profile.put("phone", null);
        profile.put("role", u.get("role"));
        profile.put("teamRole", u.get("team_role"));
        profile.put("active", u.get("is_active"));
        profile.put("createdAt", u.get("created_at"));
        profile.put("updatedAt", u.get("updated_at"));
        profile.put("lastLoginAt", u.get("last_login_at"));
        if (market != null) {
            profile.put("store", one("select id, name from markets where id = :m", Map.of("m", market)));
        }
        out.put("profile", profile);
        out.put("twoFactor", Map.of("enabled", Boolean.TRUE.equals(u.get("totp_enabled"))));

        // Convites: só papel, situação e datas (o e-mail da outra pessoa fica de fora).
        Map<String, Object> invites = new LinkedHashMap<>();
        invites.put("sent", list("select team_role, created_at, expires_at, accepted_at, revoked_at from team_invites "
            + "where lower(invited_by) = lower(:e) order by created_at desc", Map.of("e", email)));
        invites.put("received", list("select team_role, created_at, expires_at, accepted_at, revoked_at from team_invites "
            + "where lower(email) = lower(:e) order by created_at desc", Map.of("e", email)));
        out.put("teamInvites", invites);
        out.put("ownershipTransfers", list("select case when from_user_id = :u then 'ENVIADO' else 'RECEBIDO' end as direction, "
            + "status, created_at, expires_at, decided_at from ownership_transfers "
            + "where from_user_id = :u or to_user_id = :u order by created_at desc", Map.of("u", userId)));

        out.put("legalAcceptances", legalAcceptances(userId));
        out.put("accountDeletionRequests", list("select scope, status, requested_at, scheduled_for, canceled_at, completed_at "
            + "from account_deletion_requests where user_id = :u order by requested_at desc", Map.of("u", userId)));

        // Consentimento e mensagens do WhatsApp: o telefone é da loja e quem cadastra é o dono.
        Map<String, Object> consents = new LinkedHashMap<>();
        if (owner && market != null) {
            Map<String, Object> prefs = one("select whatsapp_phone, whatsapp_opt_in, whatsapp_opt_in_at from ai_copilot_prefs "
                + "where market_id = :m", Map.of("m", market));
            consents.put("whatsappCopilot", prefs);
            Object phone = prefs == null ? null : prefs.get("whatsapp_phone");
            out.put("whatsappMessages", phone == null ? List.of()
                : list("select direction, kind, status, created_at from ai_whatsapp_messages where market_id = :m and phone = :p "
                    + "order by created_at desc limit " + WHATSAPP_LIMIT, Map.of("m", market, "p", phone)));
        } else {
            out.put("whatsappMessages", List.of());
        }
        out.put("consents", consents);

        out.put("auditLog", list("select action, entity_type, success, ip_address, user_agent, created_at from audit_logs "
            + "where user_id = :u order by created_at desc limit " + AUDIT_LIMIT, Map.of("u", userId)));

        if (owner && market != null) {
            // Cadastro da loja (e filiais da rede); sem notas internas nem ids de cobrança.
            out.put("store", list("select id, name, cnpj, address, city, state, branch_label, contact_name, contact_email, "
                + "contact_phone, account_owner_email, plan_type, is_active, created_at from markets "
                + "where id = :m or parent_market_id = :m order by parent_market_id nulls first, name", Map.of("m", market)));
        }
        return scrub(out);
    }

    /** legal_acceptances é criada por outra migration (V106): se ainda não existir, sai lista vazia. */
    private List<Map<String, Object>> legalAcceptances(UUID userId) {
        try {
            Boolean ready = jdbc.queryForObject("select exists (select 1 from information_schema.columns "
                + "where table_schema = current_schema() and table_name = 'legal_acceptances' and column_name = 'user_id')",
                Map.of(), Boolean.class);
            if (!Boolean.TRUE.equals(ready)) {
                return List.of();
            }
            return list("select * from legal_acceptances where user_id = :u", Map.of("u", userId));
        } catch (RuntimeException e) {
            log.warn("Exportação de dados: aceites legais indisponíveis: {}", e.getMessage());
            return List.of();
        }
    }

    private List<Map<String, Object>> list(String sql, Map<String, ?> params) {
        return jdbc.queryForList(sql, params);
    }

    private Map<String, Object> one(String sql, Map<String, ?> params) {
        List<Map<String, Object>> rows = jdbc.queryForList(sql, params);
        return rows.isEmpty() ? null : rows.get(0);
    }

    /** Tira chave sensível em qualquer nível e troca datas por texto ISO (o arquivo é para gente ler). */
    @SuppressWarnings("unchecked")
    static <T> T scrub(T value) {
        if (value instanceof Map<?, ?> map) {
            Map<String, Object> clean = new LinkedHashMap<>();
            map.forEach((k, v) -> {
                String key = String.valueOf(k);
                if (!SENSITIVE.matcher(key).matches()) {
                    clean.put(key, scrub(v));
                }
            });
            return (T) clean;
        }
        if (value instanceof Collection<?> items) {
            List<Object> clean = new ArrayList<>();
            items.forEach(i -> clean.add(scrub(i)));
            return (T) clean;
        }
        if (value instanceof Timestamp ts) {
            return (T) ts.toLocalDateTime().truncatedTo(ChronoUnit.SECONDS).toString();
        }
        if (value instanceof LocalDateTime ldt) {
            return (T) ldt.truncatedTo(ChronoUnit.SECONDS).toString();
        }
        if (value instanceof java.sql.Date d) {
            return (T) d.toLocalDate().toString();
        }
        if (value instanceof UUID id) {
            return (T) id.toString();
        }
        return value;
    }
}
