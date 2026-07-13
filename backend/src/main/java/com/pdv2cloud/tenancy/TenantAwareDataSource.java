package com.pdv2cloud.tenancy;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import javax.sql.DataSource;
import org.springframework.jdbc.datasource.DelegatingDataSource;

/**
 * Propaga o tenant do request para a sessão do PostgreSQL a cada checkout de conexão,
 * alimentando as policies de Row-Level Security (migration V29):
 *
 *   app.current_market — tenant do principal autenticado ('' quando ausente)
 *   app.is_admin       — 'true' para ADMIN/SUPER_ADMIN (escopo global por design)
 *
 * Conexões do pool são reconfiguradas em todo checkout, então valores de um request
 * anterior nunca vazam para o seguinte. Fora de um request (jobs, seeders), ambos os
 * valores ficam vazios: a role de jobs (dona do schema) não é afetada pela RLS, e a
 * role de aplicação passa a não enxergar nenhuma linha de tenant (fail-closed).
 */
public class TenantAwareDataSource extends DelegatingDataSource {

    private static final String SET_TENANT_SQL =
        "SELECT set_config('app.current_market', ?, false), set_config('app.is_admin', ?, false)";

    public TenantAwareDataSource(DataSource targetDataSource) {
        super(targetDataSource);
    }

    @Override
    public Connection getConnection() throws SQLException {
        return prepare(obtainTargetDataSource().getConnection());
    }

    @Override
    public Connection getConnection(String username, String password) throws SQLException {
        return prepare(obtainTargetDataSource().getConnection(username, password));
    }

    private Connection prepare(Connection connection) throws SQLException {
        TenantContext.TenantInfo info = TenantContext.get();
        String marketId = info != null && info.marketId() != null ? info.marketId().toString() : "";
        String isAdmin = info != null && info.bypassTenantIsolation() ? "true" : "";
        try (PreparedStatement statement = connection.prepareStatement(SET_TENANT_SQL)) {
            statement.setString(1, marketId);
            statement.setString(2, isAdmin);
            statement.execute();
        } catch (SQLException ex) {
            connection.close();
            throw ex;
        }
        return connection;
    }
}
