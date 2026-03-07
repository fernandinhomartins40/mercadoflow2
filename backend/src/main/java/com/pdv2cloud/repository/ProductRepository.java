package com.pdv2cloud.repository;

import com.pdv2cloud.model.entity.Product;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ProductRepository extends JpaRepository<Product, UUID> {
    Optional<Product> findByEan(String ean);
    List<Product> findAllByEanIn(Collection<String> eans);
}
