package com.pdv2cloud.security;

import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.model.entity.MarketBillingStatus;
import com.pdv2cloud.model.entity.User;
import com.pdv2cloud.model.entity.UserRole;
import com.pdv2cloud.repository.UserRepository;
import java.time.LocalDateTime;
import java.util.Collections;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

@Service
public class CustomUserDetailsService implements UserDetailsService {

    @Autowired
    private UserRepository userRepository;

    @Override
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        User user = userRepository.findByEmail(username)
            .orElseThrow(() -> new UsernameNotFoundException("User not found"));

        return new org.springframework.security.core.userdetails.User(
            user.getEmail(),
            user.getPassword(),
            isUserEnabled(user),
            true,
            true,
            true,
            Collections.singletonList(new SimpleGrantedAuthority("ROLE_" + user.getRole().name()))
        );
    }

    private boolean isUserEnabled(User user) {
        if (!Boolean.TRUE.equals(user.getIsActive())) {
            return false;
        }
        if (user.getRole() == UserRole.SUPER_ADMIN) {
            return true;
        }
        Market market = user.getMarket();
        if (market == null) {
            return true;
        }
        if (!Boolean.TRUE.equals(market.getIsActive())) {
            return false;
        }
        if (market.getBillingStatus() == MarketBillingStatus.SUSPENDED || market.getBillingStatus() == MarketBillingStatus.CANCELLED) {
            return false;
        }
        return market.getAccessExpiresAt() == null || market.getAccessExpiresAt().isAfter(LocalDateTime.now());
    }
}
