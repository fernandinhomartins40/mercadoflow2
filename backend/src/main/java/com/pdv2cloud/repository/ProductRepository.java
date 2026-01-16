package com.pdv2cloud.repository;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import com.pdv2cloud.model.entity.Product;

public interface ProductRepository extends JpaRepository<Product, UUID> {
    Optional<Product> findByEan(String ean);
}
