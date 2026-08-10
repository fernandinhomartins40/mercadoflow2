package com.pdv2cloud.tenancy;

import java.util.UUID;
import java.util.function.Supplier;

/**
 * Contexto de tenant do request corrente.
 *
 * Populado pelo {@link com.pdv2cloud.security.TenantAccessFilter} a partir do principal
 * autenticado (usuário web ou agente) e consumido pelo {@link TenantAwareDataSource},
 * que propaga o tenant para o PostgreSQL (Row-Level Security) a cada conexão.
 */
public final class TenantContext {

    /**
     * @param marketId tenant do principal autenticado; null para usuários sem mercado
     * @param bypassTenantIsolation true para ADMIN/SUPER_ADMIN, cujo escopo é global por design
     */
    public record TenantInfo(UUID marketId, boolean bypassTenantIsolation) {
    }

    private static final ThreadLocal<TenantInfo> CURRENT = new ThreadLocal<>();

    private TenantContext() {
    }

    public static void set(TenantInfo info) {
        CURRENT.set(info);
    }

    public static TenantInfo get() {
        return CURRENT.get();
    }

    public static void clear() {
        CURRENT.remove();
    }

    /**
     * Executa trabalho de sistema com escopo global (webhooks do Stripe, jobs
     * agendados, migrações de dados).
     *
     * Sem isto, esse código roda sem tenant na sessão: hoje isso é inofensivo
     * porque a role da aplicação ignora RLS, mas assim que ela passa a
     * respeitá-lo o comportamento vira fail-closed — o webhook de pagamento não
     * encontraria o mercado a atualizar e a régua de cobrança não veria fatura
     * alguma, os dois falhando em silêncio.
     *
     * Deve envolver apenas trabalho que é legitimamente global. Requisição de
     * usuário nunca passa por aqui: o escopo dela vem do principal autenticado.
     *
     * O contexto anterior é restaurado no finally, e não simplesmente limpo,
     * para que a chamada seja segura dentro de um request já escopado.
     */
    public static <T> T runAsSystem(Supplier<T> work) {
        TenantInfo previous = CURRENT.get();
        CURRENT.set(new TenantInfo(null, true));
        try {
            return work.get();
        } finally {
            if (previous != null) {
                CURRENT.set(previous);
            } else {
                CURRENT.remove();
            }
        }
    }

    /**
     * Variante para trabalho que não devolve valor.
     *
     * O Supplier é tipado explicitamente de propósito: escrito como lambda
     * cru, {@code runAsSystem(() -> { work.run(); return null; })} volta a
     * casar com esta mesma sobrecarga (Runnable) em vez da de Supplier, e o
     * método chama a si próprio até estourar a pilha — foi um
     * StackOverflowError em produção, na primeira nota que o agente enviou.
     */
    public static void runAsSystem(Runnable work) {
        Supplier<Void> comoSupplier = () -> {
            work.run();
            return null;
        };
        runAsSystem(comoSupplier);
    }
}
