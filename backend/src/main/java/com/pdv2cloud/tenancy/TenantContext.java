package com.pdv2cloud.tenancy;

import java.util.UUID;

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
}
