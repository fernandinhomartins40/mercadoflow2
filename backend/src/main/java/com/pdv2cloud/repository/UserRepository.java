package com.pdv2cloud.repository;

import com.pdv2cloud.model.entity.UserRole;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import com.pdv2cloud.model.entity.User;

public interface UserRepository extends JpaRepository<User, UUID> {
    Optional<User> findByEmail(String email);

    @Query("""
        select u
        from User u
        left join u.market m
        where (:search = ''
            or lower(u.email) like :search
            or lower(u.name) like :search
            or lower(coalesce(m.name, '')) like :search)
          and (:role is null or u.role = :role)
          and (:active is null or u.isActive = :active)
          and (:marketId is null or m.id = :marketId)
        order by u.createdAt desc
        """)
    Page<User> searchForSuperAdmin(
        @Param("search") String search,
        @Param("role") UserRole role,
        @Param("active") Boolean active,
        @Param("marketId") UUID marketId,
        Pageable pageable
    );

    long countByIsActive(Boolean isActive);
    long countByRole(UserRole role);
    long countByRoleAndIsActive(UserRole role, Boolean isActive);
    long countByMarket_Id(UUID marketId);
    long countByMarket_IdAndIsActive(UUID marketId, Boolean isActive);
    long countByMarketIsNullAndRoleNot(UserRole role);
}
