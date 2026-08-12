package com.pdv2cloud.repository;

import com.pdv2cloud.model.entity.InvoiceRejection;
import java.time.LocalDateTime;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface InvoiceRejectionRepository extends JpaRepository<InvoiceRejection, UUID> {

    /**
     * Registra a recusa, ou soma mais uma tentativa se a nota já é conhecida.
     *
     * Upsert nativo e não read-modify-write: a ingestão é concorrente (vários
     * PDVs enviando ao mesmo tempo) e duas tentativas simultâneas da mesma nota
     * violariam a unique.
     */
    @Modifying
    @Query(value = """
        insert into invoice_rejections
            (id, market_id, chave_nfe, data_emissao, reason, attempts,
             first_attempt_at, last_attempt_at)
        values
            (gen_random_uuid(), :marketId, :chaveNfe, :dataEmissao, :reason, 1, now(), now())
        on conflict (market_id, chave_nfe) do update set
            attempts        = invoice_rejections.attempts + 1,
            last_attempt_at = now(),
            -- Se voltou a ser recusada, deixou de estar resolvida.
            resolved_at     = null
        """, nativeQuery = true)
    void recordAttempt(
        @Param("marketId") UUID marketId,
        @Param("chaveNfe") String chaveNfe,
        @Param("dataEmissao") LocalDateTime dataEmissao,
        @Param("reason") String reason
    );

    /** A nota entrou: marca como resolvida em vez de apagar, para haver rastro. */
    @Modifying
    @Query("update InvoiceRejection r set r.resolvedAt = :now "
        + "where r.market.id = :marketId and r.chaveNfe = :chaveNfe and r.resolvedAt is null")
    int markResolved(
        @Param("marketId") UUID marketId,
        @Param("chaveNfe") String chaveNfe,
        @Param("now") LocalDateTime now
    );

    /** Quantas notas distintas ficaram de fora e ainda não voltaram. */
    @Query("select count(r) from InvoiceRejection r "
        + "where r.market.id = :marketId and r.resolvedAt is null")
    long countPending(@Param("marketId") UUID marketId);

    /** A mais antiga que ficou de fora — mostra o alcance do que falta. */
    @Query("select min(r.dataEmissao) from InvoiceRejection r "
        + "where r.market.id = :marketId and r.resolvedAt is null")
    LocalDateTime oldestPending(@Param("marketId") UUID marketId);
}
