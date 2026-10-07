package com.pdv2cloud.service;

import com.pdv2cloud.tenancy.TenantContext;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import javax.sql.DataSource;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Retenção do preço estadual (06/10/2026): a tabela crescia sem limite
 * (1,35 milhão de linhas, 767 mil com mais de 90 dias).
 *
 * Nada se perde:
 *  - o detalhe que sai do banco vai antes para um .csv.gz por mês no arquivo
 *    morto (gzip em blocos: rodar de novo só acrescenta);
 *  - cada dia vira uma linha de resumo em state_price_daily (mínimo, mediana,
 *    máximo, média e quantidade) por fonte, produto e UF;
 *  - a última observação de cada loja e produto fica na tabela original, para
 *    a comparação estadual continuar mostrando todo produto já visto.
 * Tudo numa transação: se o arquivo ou o banco falharem, nada é apagado.
 */
@Service
@Slf4j
public class StatePriceRetentionService {

    public static final int KEEP_DAYS = 90;

    private final DataSource dataSource;
    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final Path archiveDir;

    public StatePriceRetentionService(DataSource dataSource, JdbcTemplate jdbc, TransactionTemplate tx,
                                      @Value("${app.archive-dir:/opt/pdv2cloud/archive}") String archiveDir) {
        this.dataSource = dataSource;
        this.jdbc = jdbc;
        this.tx = tx;
        this.archiveDir = Paths.get(archiveDir);
    }

    public record Result(int months, long archived, long summarized, long deleted) { }

    public Result run() {
        return TenantContext.runAsSystem(() -> {
            LocalDate cutoff = LocalDate.now().minusDays(KEEP_DAYS);
            List<LocalDate> months = jdbc.queryForList(
                "select distinct date_trunc('month', observed_at)::date from state_price_observations where observed_at < ? order by 1",
                LocalDate.class, cutoff);
            long archived = 0;
            long summarized = 0;
            long deleted = 0;
            for (LocalDate month : months) {
                long[] r = retainMonth(YearMonth.from(month), cutoff);
                archived += r[0];
                summarized += r[1];
                deleted += r[2];
            }
            log.info("Retenção do preço estadual: {} mês(es), {} linhas arquivadas, {} resumos, {} removidas",
                months.size(), archived, summarized, deleted);
            return new Result(months.size(), archived, summarized, deleted);
        });
    }

    private long[] retainMonth(YearMonth month, LocalDate cutoff) {
        LocalDate from = month.atDay(1);
        LocalDate to = month.plusMonths(1).atDay(1).isBefore(cutoff) ? month.plusMonths(1).atDay(1) : cutoff;
        Long[] out = tx.execute(status -> {
            jdbc.execute("set local statement_timeout = 0");
            // O que sai: do mês, antes do corte, e que não é a última observação da loja e produto.
            jdbc.update("create temp table retention_out on commit drop as "
                + "select o.id from state_price_observations o "
                + "where o.observed_at >= ? and o.observed_at < ? "
                + "and o.id <> (select l.id from state_price_observations l where l.source_id = o.source_id "
                + "  and l.provider_product_id = o.provider_product_id "
                + "  and coalesce(l.observed_store_id, '') = coalesce(o.observed_store_id, '') "
                + "  order by l.observed_at desc limit 1)",
                from, to);
            Long n = jdbc.queryForObject("select count(*) from retention_out", Long.class);
            if (n == null || n == 0) return new Long[] { 0L, 0L, 0L };

            long archived = archive(month);
            int summarized = jdbc.update(
                "insert into state_price_daily (source_id, product_id, observed_state, day, min_price, median_price, max_price, avg_price, observations) "
                    + "select o.source_id, o.product_id, upper(o.observed_state), o.observed_at::date, min(o.price), "
                    + "  percentile_cont(0.5) within group (order by o.price), max(o.price), avg(o.price), count(*) "
                    + "from state_price_observations o join retention_out r on r.id = o.id "
                    + "group by 1, 2, 3, 4 "
                    + "on conflict (source_id, product_id, observed_state, day) do update set "
                    + "  min_price = least(state_price_daily.min_price, excluded.min_price), "
                    + "  max_price = greatest(state_price_daily.max_price, excluded.max_price), "
                    + "  avg_price = (state_price_daily.avg_price * state_price_daily.observations + excluded.avg_price * excluded.observations) "
                    + "              / (state_price_daily.observations + excluded.observations), "
                    + "  observations = state_price_daily.observations + excluded.observations");
            int deleted = jdbc.update("delete from state_price_observations o using retention_out r where r.id = o.id");
            return new Long[] { archived, (long) summarized, (long) deleted };
        });
        return new long[] { out[0], out[1], out[2] };
    }

    /** COPY das linhas que vão sair para state_price_observations_AAAA-MM.csv.gz (acrescenta). */
    private long archive(YearMonth month) {
        return com.pdv2cloud.util.PgArchive.copyToGzip(dataSource,
            "select o.* from state_price_observations o join retention_out r on r.id = o.id order by o.observed_at",
            archiveDir.resolve("state_price_observations_" + month + ".csv.gz"));
    }
}
