package com.pdv2cloud.service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Fila da busca de foto sob demanda (scripts/catalog/product_image_lookup_service.py).
 * Entra na fila todo produto com código de barras de verdade e sem imagem no
 * catálogo — na prática, o que chegou por um mercado (Confere ou PDV) antes de
 * qualquer coletor trazê-lo.
 */
@Service
public class CatalogImageLookupService {

    /** Espera, em dias, antes de procurar de novo um produto não encontrado: 2, 4, 8, 16, 30, 30... */
    static final int MAX_RETRY_DAYS = 30;

    @Autowired
    private JdbcTemplate jdbc;

    @Transactional(readOnly = true)
    public List<Map<String, Object>> pending(int limit) {
        int safeLimit = Math.max(1, Math.min(limit, 500));
        // EAN iniciado em 2 é código interno da loja (pesáveis, etiqueta de balança):
        // não existe em outro mercado, então nem entra na fila.
        return jdbc.queryForList(
            """
            select p.ean as gtin, p.name as name
              from products p
              left join product_enrichments e on e.product_id = p.id
              left join product_image_lookups l on l.product_id = p.id
             where p.ean ~ '^[0-9]{8,14}$'
               and p.ean !~ '^0*2[0-9]{12}$'
               and coalesce(e.image_storage_key, '') = ''
               and (l.product_id is null or l.next_attempt_at <= now())
             order by p.last_seen_at desc nulls last, p.created_at desc
             limit ?
            """,
            safeLimit
        );
    }

    @Transactional
    public int markNotFound(List<String> gtins) {
        List<String> clean = new ArrayList<>();
        for (String gtin : gtins == null ? List.<String>of() : gtins) {
            if (gtin != null && gtin.matches("^[0-9]{8,14}$")) {
                clean.add(gtin);
            }
        }
        if (clean.isEmpty()) {
            return 0;
        }
        return jdbc.update(
            """
            insert into product_image_lookups (product_id, attempts, last_attempt_at, next_attempt_at)
            select p.id, 1, now(), now() + interval '2 days'
              from products p
             where p.ean = any (?)
            on conflict (product_id) do update
               set attempts = product_image_lookups.attempts + 1,
                   last_attempt_at = now(),
                   next_attempt_at = now() + make_interval(days => least(?, (2 ^ least(product_image_lookups.attempts + 1, 10))::int))
            """,
            ps -> {
                ps.setArray(1, ps.getConnection().createArrayOf("text", clean.toArray()));
                ps.setInt(2, MAX_RETRY_DAYS);
            }
        );
    }
}
