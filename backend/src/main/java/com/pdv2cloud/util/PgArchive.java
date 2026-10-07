package com.pdv2cloud.util;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.channels.FileChannel;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.sql.Connection;
import java.util.zip.GZIPOutputStream;
import javax.sql.DataSource;
import org.postgresql.PGConnection;
import org.springframework.jdbc.datasource.DataSourceUtils;

/**
 * Arquivo morto: COPY de uma consulta para .csv.gz, acrescentando (gzip em
 * blocos continua legível com zcat) e gravado em disco antes de devolver —
 * quem chama só apaga do banco depois disto.
 *
 * Usa a conexão da transação corrente, então enxerga tabelas temporárias dela.
 */
public final class PgArchive {

    private PgArchive() {
    }

    public static long copyToGzip(DataSource dataSource, String selectSql, Path file) {
        Connection con = DataSourceUtils.getConnection(dataSource);
        try {
            Files.createDirectories(file.getParent());
            boolean fresh = !Files.exists(file) || Files.size(file) == 0;
            PGConnection pg = con.unwrap(PGConnection.class);
            long copied;
            try (OutputStream raw = Files.newOutputStream(file, StandardOpenOption.CREATE, StandardOpenOption.APPEND);
                 GZIPOutputStream gz = new GZIPOutputStream(raw)) {
                copied = pg.getCopyAPI().copyOut("copy (" + selectSql + ") to stdout with (format csv" + (fresh ? ", header true" : "") + ")", gz);
                gz.finish();
                raw.flush();
            }
            try (FileChannel ch = FileChannel.open(file, StandardOpenOption.WRITE)) {
                ch.force(true);
            }
            return copied;
        } catch (IOException | java.sql.SQLException e) {
            throw new IllegalStateException("Não foi possível arquivar em " + file + ": " + e.getMessage(), e);
        } finally {
            DataSourceUtils.releaseConnection(con, dataSource);
        }
    }
}
