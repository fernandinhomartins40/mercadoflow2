package com.pdv2cloud.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * Prova o Row-Level Security num PostgreSQL de verdade, com as migrations reais.
 *
 * Fluxo igual ao de produção: o Flyway roda com a role dona do schema (não sujeita
 * ao RLS) e a aplicação conecta com uma role SEM BYPASSRLS, criada como em
 * scripts/db/setup-tenant-roles.sh. As variáveis de sessão são as mesmas que o
 * TenantAwareDataSource define a cada checkout de conexão.
 *
 * Sem Docker a classe inteira é pulada (disabledWithoutDocker). Na máquina de
 * desenvolvimento ela não roda; quem executa de fato é o CI (ubuntu, mvn test).
 * JDBC puro de propósito: não sobe o contexto Spring.
 */
@Testcontainers(disabledWithoutDocker = true)
class RowLevelSecurityIntegrationTest {

    @Container
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:16-alpine");

    private static final String APP_ROLE = "pdv2cloud_app";
    private static final String APP_PASSWORD = "senha_de_teste_rls";

    // Mesmo SQL do TenantAwareDataSource.
    private static final String SET_TENANT_SQL =
        "SELECT set_config('app.current_market', ?, false), set_config('app.is_admin', ?, false)";

    private static final UUID MERCADO_A = UUID.randomUUID();
    private static final UUID MERCADO_B = UUID.randomUUID();
    private static final UUID INVOICE_A = UUID.randomUUID();
    private static final UUID INVOICE_B = UUID.randomUUID();
    private static final UUID ALERT_A = UUID.randomUUID();
    private static final UUID ALERT_B = UUID.randomUUID();

    @BeforeAll
    static void prepararBanco() throws SQLException {
        Flyway.configure()
            .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
            .locations("classpath:db/migration")
            .load()
            .migrate();

        try (Connection dono = conectarComoDono(); Statement st = dono.createStatement()) {
            // Role de aplicação como em scripts/db/setup-tenant-roles.sh (depois das migrations,
            // então o grant em "all tables" já cobre todas).
            st.execute("create role " + APP_ROLE + " login password '" + APP_PASSWORD + "'"
                + " nosuperuser nocreatedb nocreaterole nobypassrls");
            st.execute("grant usage on schema public to " + APP_ROLE);
            st.execute("grant select, insert, update, delete on all tables in schema public to " + APP_ROLE);
            st.execute("grant usage, select on all sequences in schema public to " + APP_ROLE);

            // Massa de teste gravada pela dona do schema (não passa pelo RLS).
            st.execute("insert into markets (id, name, is_active, created_at) values"
                + " ('" + MERCADO_A + "', 'Mercado A', true, now()),"
                + " ('" + MERCADO_B + "', 'Mercado B', true, now())");
            st.execute("insert into invoices (id, chave_nfe, market_id, valor_total, processed_at) values"
                + " ('" + INVOICE_A + "', 'CHAVE-A-" + INVOICE_A + "', '" + MERCADO_A + "', 10, now()),"
                + " ('" + INVOICE_B + "', 'CHAVE-B-" + INVOICE_B + "', '" + MERCADO_B + "', 20, now())");
            st.execute("insert into alerts (id, market_id, type, title, created_at) values"
                + " ('" + ALERT_A + "', '" + MERCADO_A + "', 'TESTE', 'Alerta A', now()),"
                + " ('" + ALERT_B + "', '" + MERCADO_B + "', 'TESTE', 'Alerta B', now())");
            st.execute("insert into billing_payments (provider, payment_id, market_id, kind, value_cents) values"
                + " ('TESTE', 'pay_a', '" + MERCADO_A + "', 'SUBSCRIPTION', 100),"
                + " ('TESTE', 'pay_b', '" + MERCADO_B + "', 'SUBSCRIPTION', 200),"
                + " ('TESTE', 'pay_sem_dono', null, 'SUBSCRIPTION', 300)");
        }
    }

    @Test
    void roleDeAplicacaoNaoIgnoraORls() throws SQLException {
        try (Connection dono = conectarComoDono();
             PreparedStatement ps = dono.prepareStatement(
                 "select rolsuper, rolbypassrls from pg_roles where rolname = ?")) {
            ps.setString(1, APP_ROLE);
            try (ResultSet rs = ps.executeQuery()) {
                assertTrue(rs.next());
                assertFalse(rs.getBoolean("rolsuper"));
                assertFalse(rs.getBoolean("rolbypassrls"));
            }
        }
        for (String tabela : new String[] {"invoices", "alerts", "billing_payments"}) {
            assertTrue(rlsHabilitado(tabela), "RLS desligado em " + tabela);
        }
    }

    @Test
    void lojaNaoLeLinhasDeOutroMercado() throws SQLException {
        try (Connection loja = conectarComoApp(MERCADO_A.toString(), "")) {
            assertEquals(0, contar(loja, "select count(*) from invoices where market_id = '" + MERCADO_B + "'"));
            assertEquals(0, contar(loja, "select count(*) from alerts where market_id = '" + MERCADO_B + "'"));
            assertEquals(0, contar(loja, "select count(*) from billing_payments where market_id = '" + MERCADO_B + "'"));

            // Sem filtro, só aparecem as linhas do próprio mercado.
            assertEquals(1, contar(loja, "select count(*) from invoices"));
            assertEquals(1, contar(loja, "select count(*) from invoices where id = '" + INVOICE_A + "'"));
            assertEquals(1, contar(loja, "select count(*) from alerts"));
            assertEquals(1, contar(loja, "select count(*) from alerts where id = '" + ALERT_A + "'"));
        }
    }

    @Test
    void lojaNaoGravaEmLinhasDeOutroMercado() throws SQLException {
        try (Connection loja = conectarComoApp(MERCADO_A.toString(), "")) {
            loja.setAutoCommit(false);
            try {
                // UPDATE e DELETE em linha alheia não encontram nada.
                assertEquals(0, executar(loja, "update invoices set valor_total = 0 where id = '" + INVOICE_B + "'"));
                assertEquals(0, executar(loja, "delete from invoices where id = '" + INVOICE_B + "'"));
                assertEquals(0, executar(loja, "update alerts set title = 'x' where id = '" + ALERT_B + "'"));
                assertEquals(0, executar(loja, "delete from alerts where id = '" + ALERT_B + "'"));
                assertEquals(0, executar(loja, "update billing_payments set value_cents = 0 where payment_id = 'pay_b'"));
                assertEquals(0, executar(loja, "delete from billing_payments where payment_id = 'pay_b'"));
            } finally {
                loja.rollback();
            }

            // INSERT com o mercado alheio é recusado pelo WITH CHECK.
            assertRecusadoPeloRls(loja, "insert into invoices (id, chave_nfe, market_id) values ('"
                + UUID.randomUUID() + "', 'CHAVE-INVASAO-" + UUID.randomUUID() + "', '" + MERCADO_B + "')");
            assertRecusadoPeloRls(loja, "insert into alerts (id, market_id, title) values ('"
                + UUID.randomUUID() + "', '" + MERCADO_B + "', 'invasao')");
            assertRecusadoPeloRls(loja, "insert into billing_payments (provider, payment_id, market_id, kind, value_cents)"
                + " values ('TESTE', 'pay_invasao', '" + MERCADO_B + "', 'AI', 1)");

            // Nem dá para "empurrar" a própria linha para o outro mercado.
            assertRecusadoPeloRls(loja, "update invoices set market_id = '" + MERCADO_B + "' where id = '" + INVOICE_A + "'");
        }

        // A massa do mercado B segue intacta.
        try (Connection dono = conectarComoDono()) {
            assertEquals(1, contar(dono, "select count(*) from invoices where id = '" + INVOICE_B + "' and valor_total = 20"));
            assertEquals(1, contar(dono, "select count(*) from alerts where id = '" + ALERT_B + "' and title = 'Alerta B'"));
            assertEquals(1, contar(dono, "select count(*) from billing_payments where payment_id = 'pay_b' and value_cents = 200"));
            assertEquals(0, contar(dono, "select count(*) from billing_payments where payment_id = 'pay_invasao'"));
        }
    }

    @Test
    void lojaGravaNoProprioMercado() throws SQLException {
        try (Connection loja = conectarComoApp(MERCADO_A.toString(), "")) {
            loja.setAutoCommit(false);
            try {
                assertEquals(1, executar(loja, "insert into alerts (id, market_id, title) values ('"
                    + UUID.randomUUID() + "', '" + MERCADO_A + "', 'proprio')"));
                assertEquals(1, executar(loja, "update invoices set valor_total = 11 where id = '" + INVOICE_A + "'"));
            } finally {
                loja.rollback();
            }
        }
    }

    @Test
    void adminLeTudo() throws SQLException {
        try (Connection admin = conectarComoApp("", "true");
             Connection dono = conectarComoDono()) {
            for (String tabela : new String[] {"invoices", "alerts", "billing_payments"}) {
                long total = contar(dono, "select count(*) from " + tabela);
                assertEquals(total, contar(admin, "select count(*) from " + tabela), "admin não vê tudo em " + tabela);
            }
            assertEquals(2, contar(admin, "select count(*) from invoices where id in ('" + INVOICE_A + "', '" + INVOICE_B + "')"));
            assertEquals(2, contar(admin, "select count(*) from alerts where id in ('" + ALERT_A + "', '" + ALERT_B + "')"));
            assertEquals(3, contar(admin, "select count(*) from billing_payments where provider = 'TESTE'"));
        }
    }

    @Test
    void linhaSemMercadoEmColunaAnulavelEVisivelParaALoja() throws SQLException {
        // Regra atual (V44/V99): market_id NULL não pertence a ninguém e fica visível.
        try (Connection loja = conectarComoApp(MERCADO_A.toString(), "")) {
            assertEquals(1, contar(loja, "select count(*) from billing_payments where payment_id = 'pay_sem_dono' and market_id is null"));
            assertEquals(2, contar(loja, "select count(*) from billing_payments where provider = 'TESTE'"));
        }
        try (Connection loja = conectarComoApp(MERCADO_B.toString(), "")) {
            assertEquals(1, contar(loja, "select count(*) from billing_payments where payment_id = 'pay_sem_dono'"));
            assertEquals(0, contar(loja, "select count(*) from billing_payments where payment_id = 'pay_a'"));
        }
    }

    @Test
    void sessaoSemMercadoNaoVeNadaDeTenant() throws SQLException {
        // Fail-closed: fora de request, a role de aplicação não enxerga linhas com dono.
        try (Connection semTenant = conectarComoApp("", "")) {
            assertEquals(0, contar(semTenant, "select count(*) from invoices"));
            assertEquals(0, contar(semTenant, "select count(*) from alerts"));
            assertEquals(0, contar(semTenant, "select count(*) from billing_payments where market_id is not null"));
        }
    }

    private static Connection conectarComoDono() throws SQLException {
        return DriverManager.getConnection(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
    }

    private static Connection conectarComoApp(String marketId, String isAdmin) throws SQLException {
        Connection connection = DriverManager.getConnection(POSTGRES.getJdbcUrl(), APP_ROLE, APP_PASSWORD);
        try (PreparedStatement ps = connection.prepareStatement(SET_TENANT_SQL)) {
            ps.setString(1, marketId);
            ps.setString(2, isAdmin);
            ps.execute();
        } catch (SQLException ex) {
            connection.close();
            throw ex;
        }
        return connection;
    }

    private static boolean rlsHabilitado(String tabela) throws SQLException {
        try (Connection dono = conectarComoDono();
             PreparedStatement ps = dono.prepareStatement(
                 "select relrowsecurity from pg_class where relname = ? and relkind = 'r'")) {
            ps.setString(1, tabela);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() && rs.getBoolean(1);
            }
        }
    }

    private static long contar(Connection connection, String sql) throws SQLException {
        try (Statement st = connection.createStatement(); ResultSet rs = st.executeQuery(sql)) {
            rs.next();
            return rs.getLong(1);
        }
    }

    private static int executar(Connection connection, String sql) throws SQLException {
        try (Statement st = connection.createStatement()) {
            return st.executeUpdate(sql);
        }
    }

    // 42501 = insufficient_privilege, o código do "new row violates row-level security policy".
    private static void assertRecusadoPeloRls(Connection connection, String sql) throws SQLException {
        boolean autoCommit = connection.getAutoCommit();
        connection.setAutoCommit(false);
        try {
            SQLException ex = assertThrows(SQLException.class, () -> executar(connection, sql));
            assertEquals("42501", ex.getSQLState(), "esperava recusa do RLS, veio: " + ex.getMessage());
        } finally {
            connection.rollback();
            connection.setAutoCommit(autoCommit);
        }
    }
}
