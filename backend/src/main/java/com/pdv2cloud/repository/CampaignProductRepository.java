package com.pdv2cloud.repository;

import com.pdv2cloud.model.entity.CampaignProduct;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CampaignProductRepository extends JpaRepository<CampaignProduct, UUID> {

    @Query("select cp from CampaignProduct cp "
        + "join fetch cp.product "
        + "where cp.campaign.id = :campaignId")
    List<CampaignProduct> findByCampaignId(@Param("campaignId") UUID campaignId);

    List<CampaignProduct> findByMarketId(UUID marketId);

    @Modifying
    @Query("delete from CampaignProduct cp where cp.campaign.id = :campaignId")
    void deleteByCampaignId(@Param("campaignId") UUID campaignId);
}
