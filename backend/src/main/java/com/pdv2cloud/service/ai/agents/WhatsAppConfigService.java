package com.pdv2cloud.service.ai.agents;

import com.pdv2cloud.service.ai.AiCredentialCipher;
import com.pdv2cloud.service.ai.platform.AiPlatformConfig;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Configuração do WhatsApp no superadmin: modelo de mensagem aprovado na Meta e
 * webhook (token de verificação e segredo do app, cifrado). O token de acesso e
 * o ID do número ficam no provedor WHATSAPP do painel de chaves.
 */
@Service
public class WhatsAppConfigService {

    private final NamedParameterJdbcTemplate jdbc;
    private final AiCredentialCipher cipher;
    private final AiPlatformConfig platform;

    public WhatsAppConfigService(NamedParameterJdbcTemplate jdbc, AiCredentialCipher cipher, AiPlatformConfig platform) {
        this.jdbc = jdbc;
        this.cipher = cipher;
        this.platform = platform;
    }

    public record Config(String templateName, String templateLang, boolean verifyTokenSet, boolean appSecretSet,
                         String appSecretHint, LocalDateTime updatedAt, String updatedBy) {}

    public Config get() {
        return jdbc.queryForObject("select * from ai_whatsapp_config where id = 1", Map.of(), (rs, i) -> new Config(
            rs.getString("template_name"), rs.getString("template_lang"), rs.getString("verify_token") != null,
            rs.getString("app_secret_enc") != null, rs.getString("app_secret_hint"),
            rs.getTimestamp("updated_at").toLocalDateTime(), rs.getString("updated_by")));
    }

    public String templateName() {
        return get().templateName();
    }

    public String templateLang() {
        return get().templateLang();
    }

    public String verifyToken() {
        List<String> r = jdbc.queryForList("select verify_token from ai_whatsapp_config where id = 1", Map.of(), String.class);
        return r.isEmpty() ? null : r.get(0);
    }

    public String appSecret() {
        List<String> r = jdbc.queryForList("select app_secret_enc from ai_whatsapp_config where id = 1", Map.of(), String.class);
        if (r.isEmpty() || r.get(0) == null || !cipher.isConfigured()) {
            return null;
        }
        try {
            return cipher.decrypt(r.get(0));
        } catch (RuntimeException e) {
            return null;
        }
    }

    @Transactional
    public Config save(Map<String, Object> body, String actor) {
        Config cur = get();
        String name = text(body.get("templateName"), cur.templateName());
        if (!name.matches("[a-z0-9_]{1,80}")) {
            throw new IllegalArgumentException("Nome do modelo: só letras minúsculas, números e _ (como na Meta).");
        }
        String lang = text(body.get("templateLang"), cur.templateLang());
        if (!lang.matches("[a-z]{2}(_[A-Z]{2})?")) {
            throw new IllegalArgumentException("Idioma do modelo no formato da Meta, ex.: pt_BR.");
        }
        MapSqlParameterSource p = new MapSqlParameterSource().addValue("n", name).addValue("l", lang).addValue("u", actor);
        StringBuilder sql = new StringBuilder("update ai_whatsapp_config set template_name = :n, template_lang = :l, updated_at = now(), updated_by = :u");
        String token = body.get("verifyToken") == null ? null : String.valueOf(body.get("verifyToken")).trim();
        if (token != null && !token.isEmpty()) {
            if (token.length() < 16 || token.length() > 80) {
                throw new IllegalArgumentException("Token de verificação: de 16 a 80 caracteres.");
            }
            sql.append(", verify_token = :t");
            p.addValue("t", token);
        }
        String secret = body.get("appSecret") == null ? null : String.valueOf(body.get("appSecret")).trim();
        if (secret != null && !secret.isEmpty()) {
            if (!cipher.isConfigured()) {
                throw new IllegalStateException("A chave mestra de criptografia não está configurada no servidor.");
            }
            sql.append(", app_secret_enc = :s, app_secret_hint = :h");
            p.addValue("s", cipher.encrypt(secret)).addValue("h", cipher.hint(secret));
        }
        jdbc.update(sql + " where id = 1", p);
        platform.audit(actor, "WHATSAPP_CONFIG", "modelo " + name + " (" + lang + ")"
            + (token != null && !token.isEmpty() ? ", token do webhook trocado" : "")
            + (secret != null && !secret.isEmpty() ? ", segredo do app trocado" : ""));
        return get();
    }

    private static String text(Object v, String fallback) {
        return v == null || String.valueOf(v).isBlank() ? fallback : String.valueOf(v).trim();
    }
}
