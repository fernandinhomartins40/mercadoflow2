package com.pdv2cloud.repository;

import com.pdv2cloud.model.entity.OfferTemplateVariant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OfferTemplateVariantRepository extends JpaRepository<OfferTemplateVariant, UUID> {
    List<OfferTemplateVariant> findByTemplate_IdOrderByCreatedAtAsc(UUID templateId);
    Optional<OfferTemplateVariant> findByIdAndTemplate_Market_Id(UUID id, UUID marketId);
    Optional<OfferTemplateVariant> findByTemplate_IdAndVariantKey(UUID templateId, String variantKey);
}
