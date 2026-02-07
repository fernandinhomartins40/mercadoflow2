package com.pdv2cloud.service;

import com.pdv2cloud.model.entity.User;
import com.pdv2cloud.model.entity.UserRole;
import com.pdv2cloud.repository.UserRepository;
import java.util.UUID;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;

@Service
public class MarketAccessService {

    private final UserRepository userRepository;

    public MarketAccessService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    public void assertCanAccessMarket(UUID marketId, Authentication authentication) {
        User user = requireUser(authentication);
        if (user.getRole() == UserRole.ADMIN) {
            return;
        }
        if (user.getMarket() == null || user.getMarket().getId() == null) {
            throw new AccessDeniedException("User is not linked to a market");
        }
        if (!user.getMarket().getId().equals(marketId)) {
            throw new AccessDeniedException("Forbidden");
        }
    }

    public UUID resolveUserMarketId(Authentication authentication) {
        User user = requireUser(authentication);
        if (user.getMarket() == null) {
            return null;
        }
        return user.getMarket().getId();
    }

    public boolean isAdmin(Authentication authentication) {
        User user = requireUser(authentication);
        return user.getRole() == UserRole.ADMIN;
    }

    private User requireUser(Authentication authentication) {
        if (authentication == null) {
            throw new AccessDeniedException("Authentication required");
        }
        return userRepository.findByEmail(authentication.getName())
            .orElseThrow(() -> new AccessDeniedException("User not found"));
    }
}

