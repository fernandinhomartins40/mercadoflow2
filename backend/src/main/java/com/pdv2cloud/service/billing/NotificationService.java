package com.pdv2cloud.service.billing;

import com.pdv2cloud.service.notify.EmailService;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Central de avisos ao lojista: faixa no app, e-mail para os donos e WhatsApp
 * (para quem aceitou, fora do horário de silêncio).
 *
 * Cada tipo de aviso tem um modelo editável no superadmin
 * (notification_templates): texto com variáveis ({nome}, {plano}, {data},
 * {dias}, {valor}, {loja}) e por onde sai. Sem modelo, vale o texto padrão de
 * quem chamou.
 *
 * Cada aviso tem uma chave (ex.: "trial-ending-3:2026-10-08"): o mesmo aviso
 * não é criado nem enviado duas vezes, por mais que o job diário rode.
 */
@Service
public class NotificationService {

    private static final Logger log = LoggerFactory.getLogger(NotificationService.class);

    public enum Severity { INFO, WARNING, DANGER }

    public record Notice(UUID id, String kind, String severity, String title, String body, String actionLabel, String actionUrl,
                         LocalDateTime createdAt, LocalDateTime readAt) {}

    public record Template(String kind, String label, String title, String body, String defaultTitle, String defaultBody,
                           boolean sendApp, boolean sendEmail, boolean sendWhatsapp, int sortOrder, LocalDateTime updatedAt,
                           String updatedBy) {}

    /** Envio pelo WhatsApp (o canal do Copiloto); ausente quando o módulo não está carregado. */
    public interface WhatsAppSender {
        boolean sendNotice(UUID marketId, String text, String kind);
    }

    private final NamedParameterJdbcTemplate jdbc;
    private final EmailService email;
    private WhatsAppSender whatsapp;

    public NotificationService(NamedParameterJdbcTemplate jdbc, EmailService email) {
        this.jdbc = jdbc;
        this.email = email;
    }

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    void setWhatsapp(@org.springframework.context.annotation.Lazy WhatsAppSender whatsapp) {
        this.whatsapp = whatsapp;
    }

    /** Aviso sem variáveis (texto pronto). */
    public boolean notify(UUID marketId, String kind, String dedupKey, Severity severity, String title, String body,
                          String actionLabel, String actionUrl, boolean sendEmail) {
        return notify(marketId, kind, dedupKey, severity, title, body, actionLabel, actionUrl, sendEmail, Map.of());
    }

    /**
     * Cria o aviso (se ainda não existe) e envia pelos canais do modelo.
     * Devolve se era novo.
     */
    public boolean notify(UUID marketId, String kind, String dedupKey, Severity severity, String title, String body,
                          String actionLabel, String actionUrl, boolean sendEmail, Map<String, String> vars) {
        Template t = template(kind);
        String finalTitle = cut(render(t != null ? t.title() : title, vars, marketId), 160);
        String finalBody = cut(render(t != null ? t.body() : body, vars, marketId), 600);
        boolean app = t == null || t.sendApp();
        boolean mail = t != null ? t.sendEmail() : sendEmail;
        boolean wa = t != null && t.sendWhatsapp();
        // A linha existe mesmo quando o aviso não aparece no app: é ela que impede repetir.
        List<UUID> created = jdbc.queryForList("insert into app_notifications (market_id, kind, severity, title, body, action_label, "
                + "action_url, dedup_key, hidden) values (:m, :k, :s, :t, :b, :al, :au, :d, :h) "
                + "on conflict (market_id, dedup_key) do nothing returning id",
            new MapSqlParameterSource().addValue("m", marketId).addValue("k", kind).addValue("s", severity.name())
                .addValue("t", finalTitle).addValue("b", finalBody).addValue("al", actionLabel).addValue("au", actionUrl)
                .addValue("d", dedupKey).addValue("h", !app),
            UUID.class);
        if (created.isEmpty()) {
            return false;
        }
        if (mail) {
            boolean any = false;
            for (String to : owners(marketId)) {
                any |= email.send(to, finalTitle, finalTitle, List.of(finalBody), actionLabel, actionUrl == null ? null : email.link(actionUrl)).ok();
            }
            if (any) {
                jdbc.update("update app_notifications set emailed_at = now() where id = :id", Map.of("id", created.get(0)));
            }
        }
        if (wa && whatsapp != null) {
            try {
                if (whatsapp.sendNotice(marketId, finalTitle + ". " + finalBody, kind)) {
                    jdbc.update("update app_notifications set whatsapp_at = now() where id = :id", Map.of("id", created.get(0)));
                }
            } catch (RuntimeException e) {
                log.warn("Aviso {} não saiu pelo WhatsApp para {}: {}", kind, marketId, e.getMessage());
            }
        }
        return true;
    }

    /** Avisos recentes do mercado (os da matriz valem para as filiais). */
    public List<Notice> recent(UUID marketId, int limit) {
        return jdbc.query("select * from app_notifications where market_id in (:m, coalesce((select parent_market_id from markets where id = :m), :m)) "
                + "and not hidden order by created_at desc limit :l",
            new MapSqlParameterSource().addValue("m", marketId).addValue("l", limit), (rs, i) -> new Notice((UUID) rs.getObject("id"),
                rs.getString("kind"), rs.getString("severity"), rs.getString("title"), rs.getString("body"), rs.getString("action_label"),
                rs.getString("action_url"), ts(rs.getTimestamp("created_at")), ts(rs.getTimestamp("read_at"))));
    }

    public void markRead(UUID marketId, UUID id) {
        jdbc.update("update app_notifications set read_at = coalesce(read_at, now()) where id = :id "
            + "and market_id in (:m, coalesce((select parent_market_id from markets where id = :m), :m))",
            Map.of("id", id, "m", marketId));
    }

    // ── Modelos (superadmin) ─────────────────────────────────────────────

    public List<Template> templates() {
        return jdbc.query("select * from notification_templates order by sort_order, kind", Map.of(), (rs, i) -> mapTemplate(rs));
    }

    public Template template(String kind) {
        List<Template> t = jdbc.query("select * from notification_templates where kind = :k", Map.of("k", kind), (rs, i) -> mapTemplate(rs));
        return t.isEmpty() ? null : t.get(0);
    }

    public List<Template> saveTemplate(String kind, Map<String, Object> body, String actor) {
        Template cur = template(kind);
        if (cur == null) {
            throw new IllegalArgumentException("Aviso desconhecido");
        }
        boolean reset = Boolean.TRUE.equals(body.get("reset"));
        String title = reset ? cur.defaultTitle() : text(body.get("title"), cur.title(), 160, "título");
        String text = reset ? cur.defaultBody() : text(body.get("body"), cur.body(), 600, "texto");
        jdbc.update("update notification_templates set title = :t, body = :b, send_app = :a, send_email = :e, send_whatsapp = :w, "
                + "updated_at = now(), updated_by = :u where kind = :k",
            new MapSqlParameterSource().addValue("k", kind).addValue("t", title).addValue("b", text)
                .addValue("a", bool(body.get("sendApp"), cur.sendApp())).addValue("e", bool(body.get("sendEmail"), cur.sendEmail()))
                .addValue("w", bool(body.get("sendWhatsapp"), cur.sendWhatsapp())).addValue("u", actor));
        return templates();
    }

    /** Como o aviso fica com valores de exemplo. */
    public Map<String, String> preview(String kind) {
        Template t = template(kind);
        if (t == null) {
            throw new IllegalArgumentException("Aviso desconhecido");
        }
        Map<String, String> sample = Map.of("nome", "Ana", "plano", "Essencial", "data", "15/10", "dias", "3", "valor", "R$ 197,00",
            "loja", "Mercado Exemplo");
        return Map.of("title", render(t.title(), sample, null), "body", render(t.body(), sample, null));
    }

    // ── Apoio ────────────────────────────────────────────────────────────

    /** Troca {variável} pelo valor; {loja} e {nome} vêm do mercado quando não forem passados. */
    String render(String text, Map<String, String> vars, UUID marketId) {
        if (text == null) {
            return "";
        }
        String out = text;
        if (marketId != null && (out.contains("{loja}") || out.contains("{nome}"))) {
            List<Map<String, Object>> m = jdbc.queryForList("select m.name, (select u.name from users u where u.market_id = m.id "
                + "and u.role = 'MARKET_OWNER' order by u.created_at limit 1) as owner from markets m where m.id = :m", Map.of("m", marketId));
            if (!m.isEmpty()) {
                if (!vars.containsKey("loja") && m.get(0).get("name") != null) {
                    out = out.replace("{loja}", String.valueOf(m.get(0).get("name")));
                }
                if (!vars.containsKey("nome") && m.get(0).get("owner") != null) {
                    out = out.replace("{nome}", String.valueOf(m.get(0).get("owner")).trim().split("\\s+")[0]);
                }
            }
        }
        for (Map.Entry<String, String> e : vars.entrySet()) {
            out = out.replace("{" + e.getKey() + "}", e.getValue() == null ? "" : e.getValue());
        }
        return out.replaceAll("\\{[a-z]+\\}", "").replaceAll(" {2,}", " ").trim();
    }

    /** E-mails dos donos ativos da rede. */
    List<String> owners(UUID marketId) {
        return jdbc.queryForList("select distinct u.email from users u join markets m on m.id = u.market_id "
            + "where (m.id = :m or m.parent_market_id = :m) and u.role = 'MARKET_OWNER' and u.is_active", Map.of("m", marketId), String.class);
    }

    private static Template mapTemplate(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new Template(rs.getString("kind"), rs.getString("label"), rs.getString("title"), rs.getString("body"),
            rs.getString("default_title"), rs.getString("default_body"), rs.getBoolean("send_app"), rs.getBoolean("send_email"),
            rs.getBoolean("send_whatsapp"), rs.getInt("sort_order"), ts(rs.getTimestamp("updated_at")), rs.getString("updated_by"));
    }

    private static String text(Object v, String fallback, int max, String what) {
        if (v == null) {
            return fallback;
        }
        String s = String.valueOf(v).trim();
        if (s.isEmpty() || s.length() > max) {
            throw new IllegalArgumentException("O " + what + " precisa ter de 1 a " + max + " caracteres.");
        }
        return s;
    }

    private static boolean bool(Object v, boolean fallback) {
        return v instanceof Boolean b ? b : fallback;
    }

    private static String cut(String s, int max) {
        return s.length() > max ? s.substring(0, max - 1) + "…" : s;
    }

    private static LocalDateTime ts(Timestamp t) {
        return t == null ? null : t.toLocalDateTime();
    }
}
