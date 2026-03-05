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
        order by u.createdAt desc
        """)
    Page<User> searchForSuperAdmin(@Param("search") String search, Pageable pageable);

    long countByIsActive(Boolean isActive);
    long countByRole(UserRole role);
    long countByMarket_Id(UUID marketId);
}
