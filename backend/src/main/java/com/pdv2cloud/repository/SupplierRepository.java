package com.pdv2cloud.repository;

import com.pdv2cloud.model.entity.Supplier;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SupplierRepository extends JpaRepository<Supplier, UUID> {

    List<Supplier> findByMarketIdAndIsActiveTrueOrderByRazaoSocialAsc(UUID marketId);

    Optional<Supplier> findByMarketIdAndCnpj(UUID marketId, String cnpj);

    boolean existsByMarketIdAndCnpj(UUID marketId, String cnpj);
}
