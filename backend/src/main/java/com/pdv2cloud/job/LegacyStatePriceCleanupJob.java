package com.pdv2cloud.job;

import com.pdv2cloud.tenancy.TenantContext;
import com.pdv2cloud.util.PgArchive;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;
import java.util.Map;
import javax.sql.DataSource;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Limpeza única da coleta estadual antiga (aprovada pelo dono em 07/10/2026).
 *
 * Em seis meses ela trouxe só o Busca Preço do Amazonas, por palavra-chave e
 * sem código de barras: 1,35 milhão de observações de Manaus que nunca casaram
 * com um produto vendido, e 17.837 produtos falsos ("STATE-...") no catálogo
 * global. Nada é apagado sem antes ir para o arquivo morto (.csv.gz):
 *  1. observações e resumos diários da coleta antiga;
 *  2. produtos STATE- que nenhuma outra tabela referencia (as referências são
 *     lidas das chaves estrangeiras, então tabela nova também protege).
 * As fontes antigas ficam inativas. Roda uma vez (maintenance_runs).
 */
@Component
@Slf4j
@ConditionalOnProperty(name = "jobs.enabled", havingValue = "true")
public class LegacyStatePriceCleanupJob {

    static final String RUN = "legacy-state-price-cleanup";

    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final DataSource dataSource;
    private final Path archiveDir;

    public LegacyStatePriceCleanupJob(JdbcTemplate jdbc, TransactionTemplate tx, DataSource dataSource,
                                      @Value("${app.archive-dir:/opt/pdv2cloud/archive}") String archiveDir) {
        this.jdbc = jdbc;
        this.tx = tx;
        this.dataSource = dataSource;
        this.archiveDir = Paths.get(archiveDir);
    }

    @Scheduled(cron = "0 40 4 * * *", zone = "America/Sao_Paulo")
    public void run() {
        TenantContext.runAsSystem(() -> {
            Integer done = jdbc.queryForObject("select count(*) from maintenance_runs where name = ?", Integer.class, RUN);
            if (done != null && done > 0) return;
            try {
                String summary = tx.execute(status -> cleanup());
                log.info("Limpeza da coleta estadual antiga: {}", summary);
            } catch (Exception e) {
                log.error("Limpeza da coleta estadual antiga falhou; nada foi apagado", e);
            }
        });
    }

    private String cleanup() {
        jdbc.execute("set local statement_timeout = 0");
        String stamp = java.time.LocalDate.now().toString();

        long obs = PgArchive.copyToGzip(dataSource, "select * from state_price_observations order by observed_at",
            archiveDir.resolve("legado_state_price_observations_" + stamp + ".csv.gz"));
        long daily = PgArchive.copyToGzip(dataSource, "select * from state_price_daily order by day",
            archiveDir.resolve("legado_state_price_daily_" + stamp + ".csv.gz"));
        int delObs = jdbc.update("delete from state_price_observations");
        int delDaily = jdbc.update("delete from state_price_daily");

        // Produtos STATE- sem nenhuma referência, conferida em toda chave estrangeira para products.
        List<Map<String, Object>> fks = jdbc.queryForList(
            "select c.conrelid::regclass::text as tbl, a.attname as col from pg_constraint c "
                + "join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1] "
                + "where c.contype = 'f' and c.confrelid = 'products'::regclass");
        StringBuilder where = new StringBuilder("p.ean like 'STATE-%'");
        for (Map<String, Object> fk : fks) {
            where.append(" and not exists (select 1 from ").append(fk.get("tbl")).append(" x where x.")
                .append(fk.get("col")).append(" = p.id)");
        }
        jdbc.execute("create temp table legacy_products on commit drop as select p.id from products p where " + where);
        long prods = PgArchive.copyToGzip(dataSource,
            "select p.* from products p join legacy_products l on l.id = p.id",
            archiveDir.resolve("legado_produtos_state_" + stamp + ".csv.gz"));
        int delProds = jdbc.update("delete from products p using legacy_products l where l.id = p.id");

        int sources = jdbc.update("update state_price_sources set active = false");
        String summary = String.format("%d observações e %d resumos arquivados e removidos; %d produtos falsos arquivados e removidos "
            + "(de %d candidatos); %d fontes desativadas", delObs, delDaily, delProds, prods, sources);
        if (obs != delObs || daily != delDaily) {
            throw new IllegalStateException("Arquivo e banco não bateram: " + obs + "/" + delObs + " e " + daily + "/" + delDaily);
        }
        jdbc.update("insert into maintenance_runs (name, summary) values (?, ?)", RUN, summary);
        return summary;
    }
}
