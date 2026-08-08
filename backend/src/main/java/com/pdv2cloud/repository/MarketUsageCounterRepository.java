package com.pdv2cloud.repository;

import com.pdv2cloud.model.entity.MarketUsageCounter;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface MarketUsageCounterRepository extends JpaRepository<MarketUsageCounter, UUID> {

    Optional<MarketUsageCounter> findByMarketIdAndCycleStart(UUID marketId, LocalDate cycleStart);

    List<MarketUsageCounter> findByMarketIdOrderByCycleStartDesc(UUID marketId);

    /**
     * Incremento atômico do consumo.
     *
     * Feito em UPDATE direto, e não lendo-somando-gravando na entidade, porque
     * vários agentes do mesmo mercado enviam notas em paralelo: o caminho por
     * entidade perderia contagens em corrida.
     */
    @Modifying
    @Query(value = """
        insert into market_usage_counters
            (id, market_id, cycle_start, invoices_ingested, items_ingested,
             first_ingest_at, last_ingest_at, updated_at)
        values
            (gen_random_uuid(), :marketId, :cycleStart, 1, :items, now(), now(), now())
        on conflict (market_id, cycle_start) do update set
            invoices_ingested = market_usage_counters.invoices_ingested + 1,
            items_ingested    = market_usage_counters.items_ingested + :items,
            last_ingest_at    = now(),
            updated_at        = now()
        """, nativeQuery = true)
    void incrementIngested(
        @Param("marketId") UUID marketId,
        @Param("cycleStart") LocalDate cycleStart,
        @Param("items") int items
    );

    @Modifying
    @Query(value = """
        insert into market_usage_counters
            (id, market_id, cycle_start, invoices_rejected, limit_reached_at, updated_at)
        values
            (gen_random_uuid(), :marketId, :cycleStart, 1, now(), now())
        on conflict (market_id, cycle_start) do update set
            invoices_rejected = market_usage_counters.invoices_rejected + 1,
            limit_reached_at  = coalesce(market_usage_counters.limit_reached_at, now()),
            updated_at        = now()
        """, nativeQuery = true)
    void incrementRejected(
        @Param("marketId") UUID marketId,
        @Param("cycleStart") LocalDate cycleStart
    );

    /** Consumo do ciclo corrente de todos os mercados — visão do super admin. */
    @Query("select c from MarketUsageCounter c join fetch c.market "
        + "where c.cycleStart = :cycleStart order by c.invoicesIngested desc")
    List<MarketUsageCounter> findAllForCycle(@Param("cycleStart") LocalDate cycleStart);
}
