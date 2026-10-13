package com.pdv2cloud.service.partner;

import com.pdv2cloud.model.dto.RegisterRequest;
import com.pdv2cloud.model.dto.RegisterResponse;
import com.pdv2cloud.service.AuthService;
import com.pdv2cloud.service.PasswordResetService;
import com.pdv2cloud.tenancy.TenantContext;
import com.pdv2cloud.util.CnpjUtils;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * "Criar minha conta no MercadoFlow" de dentro do Bipae: a conta nasce no
 * plano grátis, já vinculada ao Bipae com os escopos pedidos, e o dono recebe
 * por e-mail o link para criar a senha. O Bipae nunca vê nem define a senha.
 *
 * Se o e-mail ou a empresa (raiz do CNPJ) já têm conta, nada é criado: a
 * resposta traz o link de conexão, para o dono entrar e aprovar.
 */
@Service
@Profile("!jobs")
public class PartnerAccountService {

    public static final int WELCOME_DAYS = 7;

    private final NamedParameterJdbcTemplate jdbc;
    private final AuthService auth;
    private final PasswordResetService passwords;
    private final FirstPartyService firstParty;

    public PartnerAccountService(NamedParameterJdbcTemplate jdbc, AuthService auth, PasswordResetService passwords,
                                 FirstPartyService firstParty) {
        this.jdbc = jdbc;
        this.auth = auth;
        this.passwords = passwords;
        this.firstParty = firstParty;
    }

    public record Result(boolean created, Map<String, Object> body) { }

    public Result create(UUID partnerId, String partnerName, Map<String, Object> body) {
        String cnpj = PartnerIngestService.digits(body.get("cnpj"));
        if (cnpj == null || cnpj.length() != 14) throw new IllegalArgumentException("cnpj precisa ter 14 dígitos.");
        String storeName = PartnerIngestService.text(body.get("storeName"), 200);
        if (storeName == null) throw new IllegalArgumentException("storeName é obrigatório.");
        String ownerName = PartnerIngestService.text(body.get("ownerName"), 200);
        if (ownerName == null) throw new IllegalArgumentException("ownerName é obrigatório.");
        String email = PartnerIngestService.text(body.get("ownerEmail"), 200);
        if (email == null || !email.matches("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$")) throw new IllegalArgumentException("ownerEmail inválido.");
        email = email.toLowerCase();
        String acceptedAt = PartnerIngestService.text(body.get("termsAcceptedAt"), 40);
        if (acceptedAt == null) {
            throw new IllegalArgumentException("termsAcceptedAt é obrigatório: o dono precisa aceitar os termos do MercadoFlow no Bipae.");
        }
        String external = PartnerIngestService.text(body.get("externalStoreId"), 120);
        List<String> scopes = scopes(body.get("scopes"));
        Boolean customerActive = body.get("customerActive") instanceof Boolean b ? b : Boolean.TRUE;

        String finalEmail = email;
        Map<String, Object> taken = TenantContext.runAsSystem(() -> {
            List<Map<String, Object>> byEmail = jdbc.queryForList(
                "select market_id from users where lower(email) = :e", new MapSqlParameterSource("e", finalEmail));
            List<Map<String, Object>> byCnpj = jdbc.queryForList(
                "select id from markets where cnpj_root = :r", new MapSqlParameterSource("r", CnpjUtils.root(cnpj)));
            if (byEmail.isEmpty() && byCnpj.isEmpty()) return null;
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("reason", !byCnpj.isEmpty() ? "CNPJ_JA_TEM_CONTA" : "EMAIL_JA_TEM_CONTA");
            return m;
        });
        if (taken != null) {
            // Já é cliente: o caminho é o dono entrar e aprovar a conexão.
            Map<String, Object> connect = new LinkedHashMap<>(body);
            connect.put("scopes", scopes);
            Map<String, Object> link = firstParty.createConnect(partnerId, connect);
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("status", "JA_TEM_CONTA");
            out.put("reason", taken.get("reason"));
            out.put("message", "Esta loja já tem conta no MercadoFlow. Peça ao dono para entrar e aprovar a conexão.");
            out.put("connect", link);
            return new Result(false, out);
        }

        RegisterRequest req = new RegisterRequest();
        req.setEmail(email);
        req.setName(ownerName);
        req.setMarketName(storeName);
        req.setMarketCnpj(cnpj);
        req.setMarketPhone(PartnerIngestService.digits(body.get("phone")));
        // Senha aleatória que ninguém conhece: o dono cria a dele pelo e-mail de boas-vindas.
        req.setPassword("Mf!" + PartnerAuthService.randomToken(18) + "a9Z");
        RegisterResponse created = TenantContext.runAsSystem(() -> auth.register(req));
        UUID marketId = created.getMarketId();
        UUID userId = created.getUserId();
        TenantContext.runAsSystem(() -> jdbc.update(
            "update markets set created_by_partner_id = :p, " +
            "notes = coalesce(notes, '') || :n where id = :m",
            new MapSqlParameterSource("p", partnerId).addValue("m", marketId)
                .addValue("n", " Conta criada pelo " + partnerName + " a pedido do dono; termos aceitos no " + partnerName + " em " + acceptedAt + ".")));
        firstParty.link(partnerId, marketId, scopes, ownerName + " (pelo " + partnerName + ")", external, customerActive);
        boolean emailed = passwords.welcome(userId, partnerName, storeName, WELCOME_DAYS);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("status", "CRIADA");
        out.put("marketId", marketId);
        out.put("scopes", scopes);
        out.put("welcomeEmailSent", emailed);
        out.put("message", emailed
            ? "Conta criada. O dono recebeu por e-mail o link para criar a senha (vale " + WELCOME_DAYS + " dias)."
            : "Conta criada, mas o e-mail de boas-vindas não saiu. O dono pode usar \"Esqueci minha senha\" no MercadoFlow.");
        return new Result(true, out);
    }

    /** Os pedidos, ou todos que o parceiro da casa pode ter. */
    private static List<String> scopes(Object raw) {
        List<String> out = new ArrayList<>();
        if (raw instanceof List<?> l) {
            for (Object o : l) {
                String s = String.valueOf(o);
                if (!PartnerScopes.allowed(s, true)) throw new IllegalArgumentException("Escopo desconhecido: " + s);
                if (!out.contains(s)) out.add(s);
            }
        }
        return out.isEmpty() ? new ArrayList<>(PartnerScopes.ALL) : out;
    }
}
