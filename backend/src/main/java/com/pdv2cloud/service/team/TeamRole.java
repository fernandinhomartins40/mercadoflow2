package com.pdv2cloud.service.team;

import com.pdv2cloud.model.entity.UserRole;

/**
 * Papel de equipe: o que cada pessoa faz na loja.
 *
 * O papel de sistema (MARKET_OWNER / MARKET_MANAGER) continua guardando as
 * rotas; este papel refina o que cada um pode fazer, área por área
 * ({@link TeamPermissions}).
 */
public enum TeamRole {
    DONO("Dono", "Tudo, incluindo assinatura e equipe"),
    GERENTE("Gerente", "Operação completa da loja: inteligência, Copiloto, compras e promoções"),
    COMPRADOR("Comprador", "Compras, pedidos, fornecedores e o Copiloto de compras"),
    CONFERENTE("Conferente", "Só o Confere: ler e conferir notas de entrada"),
    FINANCEIRO("Financeiro", "Assinatura, faturas e notas fiscais, extrato de créditos"),
    LEITURA("Leitura", "Ver painéis e relatórios, sem alterar nada");

    private final String label;
    private final String description;

    TeamRole(String label, String description) {
        this.label = label;
        this.description = description;
    }

    public String label() {
        return label;
    }

    public String description() {
        return description;
    }

    /** Papel de sistema correspondente (só o dono é MARKET_OWNER). */
    public UserRole systemRole() {
        return this == DONO ? UserRole.MARKET_OWNER : UserRole.MARKET_MANAGER;
    }

    /** Pode ligar a verificação em duas etapas (mexe com dinheiro). */
    public boolean canUseTwoFactor() {
        return this == DONO || this == FINANCEIRO;
    }

    /** Papel de equipe do usuário: o gravado ou, em contas antigas, o derivado do papel de sistema. */
    public static TeamRole of(String stored, UserRole system) {
        // O papel de sistema manda: o dono da conta é sempre Dono, e ninguém
        // fora dele vira Dono pelo papel gravado (superadmin pode ter mudado).
        if (system == UserRole.MARKET_OWNER) {
            return DONO;
        }
        if (system != UserRole.MARKET_MANAGER) {
            return null;
        }
        if (stored != null && !"DONO".equals(stored)) {
            try {
                return TeamRole.valueOf(stored);
            } catch (IllegalArgumentException ignored) {
                // cai no derivado
            }
        }
        if (system == UserRole.MARKET_OWNER) {
            return DONO;
        }
        return system == UserRole.MARKET_MANAGER ? GERENTE : null;
    }

    public static TeamRole parse(String value) {
        try {
            return TeamRole.valueOf(value == null ? "" : value.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Papel desconhecido");
        }
    }
}
