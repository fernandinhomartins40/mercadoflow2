package com.pdv2cloud.service.billing;

import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.model.entity.MarketBillingStatus;
import com.pdv2cloud.model.entity.User;
import java.time.LocalDateTime;
import org.springframework.stereotype.Component;

/**
 * A única resposta para "este usuário pode entrar, e com que restrição?".
 *
 * Antes cada caminho decidia com os seus campos (login, painel, relatórios) e
 * as regras divergiam; e o login recusava sem dizer o porquê, como se a senha
 * estivesse errada. Aqui a decisão vem junto com a explicação que a tela mostra.
 */
@Component
public class AccessPolicy {

    /**
     * @param state     código estável (ACTIVE, TRIAL, PAST_DUE, RESTRICTED, PENDING, SUSPENDED, CANCELLED, EXPIRED, USER_DISABLED, MARKET_DISABLED)
     * @param canLogin  pode entrar
     * @param readOnly  entra, mas só consulta (conta restrita por falta de pagamento)
     * @param message   o que dizer ao lojista, com o que fazer
     */
    public record Access(String state, boolean canLogin, boolean readOnly, String message) {}

    public Access of(User user) {
        if (!Boolean.TRUE.equals(user.getIsActive())) {
            return new Access("USER_DISABLED", false, false,
                "Seu usuário foi desativado. Peça ao responsável pela conta da loja para reativar o seu acesso.");
        }
        return user.getMarket() == null ? new Access("ACTIVE", true, false, null) : of(user.getMarket());
    }

    public Access of(Market market) {
        return evaluate(market.getIsActive(), market.getBillingStatus(), market.getAccessExpiresAt());
    }

    /**
     * Pode gastar recurso pago (IA, WhatsApp, agentes, MCP)? Só quem entra e
     * não está só para consulta. Jobs e chaves de integração não passam pelo
     * login, então perguntam aqui: conta cancelada, suspensa, vencida ou
     * pendente não consome nada.
     */
    public static boolean allowsPaidUse(Market market) {
        return market != null && allowsPaidUse(market.getIsActive(), market.getBillingStatus(), market.getAccessExpiresAt());
    }

    public static boolean allowsPaidUse(Boolean isActive, MarketBillingStatus status, LocalDateTime accessExpiresAt) {
        Access a = evaluate(isActive, status, accessExpiresAt);
        return a.canLogin() && !a.readOnly();
    }

    /** A regra em si, sobre os campos do mercado (serve a quem lê do banco sem a entidade). */
    public static Access evaluate(Boolean isActive, MarketBillingStatus status, LocalDateTime accessExpiresAt) {
        if (!Boolean.TRUE.equals(isActive)) {
            return new Access("MARKET_DISABLED", false, false,
                "O acesso desta loja está bloqueado. Fale com o suporte do MercadoFlow para entender o motivo.");
        }
        if (status == MarketBillingStatus.PENDING) {
            return new Access("PENDING", false, false,
                "O cadastro desta loja ainda está em análise. Você recebe um aviso assim que for liberado.");
        }
        if (status == MarketBillingStatus.SUSPENDED) {
            return new Access("SUSPENDED", false, false,
                "O acesso desta loja foi suspenso. Fale com o suporte do MercadoFlow.");
        }
        if (status == MarketBillingStatus.CANCELLED) {
            return new Access("CANCELLED", false, false,
                "Esta conta foi encerrada. Para voltar a usar, fale com o suporte do MercadoFlow.");
        }
        if (accessExpiresAt != null && !accessExpiresAt.isAfter(LocalDateTime.now())) {
            return new Access("EXPIRED", false, false,
                "O período de acesso desta loja terminou. Fale com o suporte do MercadoFlow para renovar.");
        }
        if (status == MarketBillingStatus.RESTRICTED) {
            return new Access("RESTRICTED", true, true,
                "Sua assinatura está com pagamento em aberto. A conta está só para consulta até o pagamento ser confirmado.");
        }
        if (status == MarketBillingStatus.PAST_DUE) {
            return new Access("PAST_DUE", true, false,
                "O último pagamento da assinatura não foi confirmado. Regularize para evitar a restrição da conta.");
        }
        if (status == MarketBillingStatus.TRIAL) {
            return new Access("TRIAL", true, false, null);
        }
        return new Access("ACTIVE", true, false, null);
    }
}
