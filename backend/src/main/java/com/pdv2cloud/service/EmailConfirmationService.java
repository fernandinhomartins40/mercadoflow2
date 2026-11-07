package com.pdv2cloud.service;

import com.pdv2cloud.service.notify.EmailService;
import com.pdv2cloud.tenancy.TenantContext;
import java.security.SecureRandom;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Confirmação do e-mail do cadastro. Não bloqueia o acesso: a conta grátis
 * entra na hora, e o link só registra que o endereço é mesmo da pessoa.
 */
@Service
public class EmailConfirmationService {

    private static final Logger log = LoggerFactory.getLogger(EmailConfirmationService.class);
    private static final int VALID_DAYS = 7;

    private final NamedParameterJdbcTemplate jdbc;
    private final EmailService email;
    private final SecureRandom random = new SecureRandom();

    public EmailConfirmationService(NamedParameterJdbcTemplate jdbc, EmailService email) {
        this.jdbc = jdbc;
        this.email = email;
    }

    public record Result(boolean ok, String message) {}

    /** Manda o link. Falha de e-mail nunca atrapalha o cadastro: só fica no log. */
    public void send(UUID userId) {
        try {
            TenantContext.runAsSystem(() -> {
                List<Map<String, Object>> rows = jdbc.queryForList("select email, name from users where id = :u", Map.of("u", userId));
                if (rows.isEmpty()) {
                    return;
                }
                byte[] bytes = new byte[32];
                random.nextBytes(bytes);
                String token = HexFormat.of().formatHex(bytes);
                jdbc.update("insert into email_confirmation_tokens (user_id, token_hash, expires_at) "
                        + "values (:u, :h, now() + make_interval(days => :d))",
                    new MapSqlParameterSource().addValue("u", userId).addValue("h", PasswordResetService.hash(token)).addValue("d", VALID_DAYS));
                String name = (String) rows.get(0).get("name");
                String hello = name == null || name.isBlank() ? "Olá." : "Olá, " + name.trim().split("\\s+")[0] + ".";
                EmailService.Sent sent = email.send((String) rows.get(0).get("email"), "Confirme seu e-mail no MercadoFlow",
                    "Confirme seu e-mail",
                    List.of(hello + " Falta só um passo: confirme que este endereço é seu. É por aqui que chegam os avisos da loja e a recuperação de senha."),
                    "Confirmar meu e-mail", email.link("/confirmar-email?token=" + token),
                    new EmailService.Look("Confirmação de e-mail", EmailService.Tone.SUCCESS,
                        "O link vale por " + VALID_DAYS + " dias e só pode ser usado uma vez. Se você não criou uma conta no MercadoFlow, ignore este e-mail."));
                if (!sent.ok()) {
                    log.warn("Confirmação de e-mail não enviada para o usuário {}: {}", userId, sent.error());
                }
            });
        } catch (RuntimeException e) {
            log.warn("Confirmação de e-mail falhou para o usuário {}: {}", userId, e.getMessage());
        }
    }

    /** Pedido pelo painel: no máximo 3 links a cada 15 minutos. */
    public Result resend(UUID userId) {
        return TenantContext.runAsSystem(() -> {
            Boolean confirmed = jdbc.queryForObject("select email_confirmed_at is not null from users where id = :u", Map.of("u", userId), Boolean.class);
            if (Boolean.TRUE.equals(confirmed)) {
                return new Result(true, "Seu e-mail já está confirmado.");
            }
            Integer recent = jdbc.queryForObject("select count(*) from email_confirmation_tokens where user_id = :u "
                + "and created_at > now() - interval '15 minutes'", Map.of("u", userId), Integer.class);
            if (recent != null && recent >= 3) {
                return new Result(false, "Já enviamos o link há pouco. Veja também a caixa de spam ou tente de novo em alguns minutos.");
            }
            send(userId);
            return new Result(true, "Enviamos o link. Veja a sua caixa de entrada e também o spam.");
        });
    }

    public Result confirm(String token) {
        if (token == null || !token.matches("[0-9a-f]{64}")) {
            return new Result(false, "Link inválido. Abra de novo o link do e-mail.");
        }
        return TenantContext.runAsSystem(() -> {
            List<Map<String, Object>> rows = jdbc.queryForList(
                "select id, user_id, expires_at < now() as expired, used_at is not null as used "
                    + "from email_confirmation_tokens where token_hash = :h", Map.of("h", PasswordResetService.hash(token)));
            if (rows.isEmpty()) {
                return new Result(false, "Link inválido. Abra de novo o link do e-mail.");
            }
            Map<String, Object> row = rows.get(0);
            // Leitor de e-mail que abre o link antes da pessoa não pode transformar o clique dela em erro.
            if (Boolean.TRUE.equals(row.get("used"))) {
                return new Result(true, "Seu e-mail já estava confirmado.");
            }
            if (Boolean.TRUE.equals(row.get("expired"))) {
                return new Result(false, "Este link venceu. Entre no MercadoFlow e peça outro no aviso do topo da tela. Sua conta continua funcionando normalmente.");
            }
            jdbc.update("update email_confirmation_tokens set used_at = now() where id = :id", Map.of("id", row.get("id")));
            jdbc.update("update users set email_confirmed_at = coalesce(email_confirmed_at, now()) where id = :u", Map.of("u", row.get("user_id")));
            return new Result(true, "E-mail confirmado. Obrigado!");
        });
    }
}
