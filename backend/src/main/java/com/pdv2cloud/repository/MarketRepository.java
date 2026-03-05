package com.pdv2cloud.repository;

import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import com.pdv2cloud.model.entity.Market;

public interface MarketRepository extends JpaRepository<Market, UUID> {
    @Query("select m from Market m where m.isActive = true")
    List<Market> findAllActive();

    @Query("""
        select m
        from Market m
        where (:search = ''
            or lower(m.name) like :search
            or lower(coalesce(m.cnpj, '')) like :search)
        order by m.createdAt desc
        """)
    Page<Market> searchForSuperAdmin(@Param("search") String search, Pageable pageable);

    long countByIsActive(Boolean isActive);
}
