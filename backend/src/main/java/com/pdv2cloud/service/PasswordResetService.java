package com.pdv2cloud.service;

import com.pdv2cloud.model.entity.User;
import com.pdv2cloud.repository.UserRepository;
import com.pdv2cloud.service.notify.EmailService;
import com.pdv2cloud.tenancy.TenantContext;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

/**
 * "Esqueci minha senha": link por e-mail, de uso único, válido por 30 minutos.
 *
 * A resposta do pedido é sempre a mesma, exista ou não a conta: assim a tela
 * não serve para descobrir quais e-mails são clientes. O banco guarda só o hash
 * do link; um vazamento da tabela não abre conta nenhuma.
 */
@Service
public class PasswordResetService {

    private static final Logger log = LoggerFactory.getLogger(PasswordResetService.class);
    static final int VALID_MINUTES = 30;
    /** Mesma regra do cadastro: maiúscula, minúscula, número e caractere especial, 8+. */
    static final String PASSWORD_RULE = "^(?=.*[A-Z])(?=.*[a-z])(?=.*\\d)(?=.*[^A-Za-z0-9]).{8,}$";

    private final NamedParameterJdbcTemplate jdbc;
    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final EmailService email;
    private final SecureRandom random = new SecureRandom();

    public PasswordResetService(NamedParameterJdbcTemplate jdbc, UserRepository users, PasswordEncoder encoder, EmailService email) {
        this.jdbc = jdbc;
        this.users = users;
        this.encoder = encoder;
        this.email = email;
    }

    /** Pede o link. Não revela se a conta existe; envia só para usuário ativo (super admin fica de fora). */
    public void request(String rawEmail, String ip) {
        String address = rawEmail == null ? "" : rawEmail.trim().toLowerCase();
        if (address.isEmpty() || address.length() > 200) {
            return;
        }
        TenantContext.runAsSystem(() -> {
            Optional<User> user = users.findForAuthenticationByEmail(address);
            if (user.isEmpty() || !Boolean.TRUE.equals(user.get().getIsActive())
                || user.get().getRole() == com.pdv2cloud.model.entity.UserRole.SUPER_ADMIN) {
                return;
            }
            Integer recent = jdbc.queryForObject("select count(*) from password_reset_tokens where user_id = :u "
                + "and created_at > now() - interval '15 minutes'", Map.of("u", user.get().getId()), Integer.class);
            if (recent != null && recent >= 3) {
                return;
            }
            byte[] bytes = new byte[32];
            random.nextBytes(bytes);
            String token = HexFormat.of().formatHex(bytes);
            jdbc.update("insert into password_reset_tokens (user_id, token_hash, expires_at, request_ip) "
                    + "values (:u, :h, now() + make_interval(mins => :m), :ip)",
                new MapSqlParameterSource().addValue("u", user.get().getId()).addValue("h", hash(token))
                    .addValue("m", VALID_MINUTES).addValue("ip", ip));
            EmailService.Sent sent = email.send(user.get().getEmail(), "Redefina sua senha do MercadoFlow",
                "Redefinir senha",
                List.of(greeting(user.get().getName()) + " Recebemos um pedido para redefinir a sua senha.",
                    "O link vale por " + VALID_MINUTES + " minutos e só pode ser usado uma vez. Se não foi você, ignore este e-mail: a senha atual continua valendo."),
                "Criar nova senha", email.link("/redefinir-senha?token=" + token));
            if (!sent.ok()) {
                log.warn("Link de nova senha não enviado para o usuário {}: {}", user.get().getId(), sent.error());
            }
        });
    }

    public record Result(boolean ok, String message) {}

    /** Troca a senha com o link. */
    public Result reset(String token, String newPassword) {
        if (token == null || !token.matches("[0-9a-f]{64}")) {
            return new Result(false, "Link inválido. Peça um novo em \"Esqueci minha senha\".");
        }
        if (newPassword == null || !newPassword.matches(PASSWORD_RULE)) {
            return new Result(false, "A senha precisa de 8 caracteres ou mais, com letra maiúscula, minúscula, número e caractere especial.");
        }
        return TenantContext.runAsSystem(() -> {
            List<Map<String, Object>> rows = jdbc.queryForList("select id, user_id, expires_at < now() as expired, used_at is not null as used "
                + "from password_reset_tokens where token_hash = :h", Map.of("h", hash(token)));
            if (rows.isEmpty()) {
                return new Result(false, "Link inválido. Peça um novo em \"Esqueci minha senha\".");
            }
            Map<String, Object> row = rows.get(0);
            if (Boolean.TRUE.equals(row.get("used"))) {
                return new Result(false, "Este link já foi usado. Peça um novo se precisar.");
            }
            if (Boolean.TRUE.equals(row.get("expired"))) {
                return new Result(false, "Este link venceu. Peça um novo em \"Esqueci minha senha\".");
            }
            UUID userId = (UUID) row.get("user_id");
            int claimed = jdbc.update("update password_reset_tokens set used_at = now() where id = :id and used_at is null",
                Map.of("id", row.get("id")));
            if (claimed == 0) {
                return new Result(false, "Este link já foi usado. Peça um novo se precisar.");
            }
            User user = users.findById(userId).orElse(null);
            if (user == null) {
                return new Result(false, "Conta não encontrada.");
            }
            user.setPassword(encoder.encode(newPassword));
            users.save(user);
            // Qualquer outro link pendente deixa de valer.
            jdbc.update("update password_reset_tokens set used_at = now() where user_id = :u and used_at is null", Map.of("u", userId));
            return new Result(true, "Senha alterada. Entre com a nova senha.");
        });
    }

    static String hash(String token) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static String greeting(String name) {
        return name == null || name.isBlank() ? "Olá." : "Olá, " + name.trim().split("\\s+")[0] + ".";
    }
}
