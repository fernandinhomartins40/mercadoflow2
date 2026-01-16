package com.pdv2cloud.repository;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import com.pdv2cloud.model.entity.PDV;

public interface PDVRepository extends JpaRepository<PDV, UUID> {
}
