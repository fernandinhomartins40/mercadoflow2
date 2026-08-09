package com.pdv2cloud.repository;

import com.pdv2cloud.model.entity.CustomerTask;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CustomerTaskRepository extends JpaRepository<CustomerTask, UUID> {

    @Query("select t from CustomerTask t join fetch t.market "
        + "where t.market.id = :marketId order by t.status asc, t.dueDate asc nulls last")
    List<CustomerTask> findByMarket(@Param("marketId") UUID marketId);

    /** Fila de trabalho: abertas, mais urgentes primeiro. */
    @Query("select t from CustomerTask t join fetch t.market "
        + "where t.status = 'OPEN' order by t.dueDate asc nulls last, t.priority desc")
    List<CustomerTask> findOpen();

    @Query("select t from CustomerTask t join fetch t.market "
        + "where t.status = 'OPEN' and t.dueDate < :today order by t.dueDate asc")
    List<CustomerTask> findOverdue(@Param("today") LocalDate today);

    @Query("select count(t) from CustomerTask t where t.status = 'OPEN'")
    long countOpen();
}
