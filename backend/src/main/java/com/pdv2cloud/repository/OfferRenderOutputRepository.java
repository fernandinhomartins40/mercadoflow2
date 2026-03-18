package com.pdv2cloud.repository;

import com.pdv2cloud.model.entity.OfferRenderOutput;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OfferRenderOutputRepository extends JpaRepository<OfferRenderOutput, UUID> {
    List<OfferRenderOutput> findByJob_IdOrderByCreatedAtDesc(UUID jobId);
    List<OfferRenderOutput> findTop50ByMarket_IdOrderByCreatedAtDesc(UUID marketId);
    void deleteByJob_Id(UUID jobId);
}
