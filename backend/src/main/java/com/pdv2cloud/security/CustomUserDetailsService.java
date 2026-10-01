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
import org.springframework.transaction.annotation.Transactional;

@Service
public class CustomUserDetailsService implements UserDetailsService {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private com.pdv2cloud.service.billing.AccessPolicy accessPolicy;

    @Override
    @Transactional(readOnly = true)
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        User user = userRepository.findForAuthenticationByEmail(username)
            .orElseThrow(() -> new UsernameNotFoundException("User not found"));

        return new AppUserDetails(
            user.getEmail(),
            user.getPassword(),
            isUserEnabled(user),
            Collections.singletonList(new SimpleGrantedAuthority("ROLE_" + user.getRole().name())),
            user.getMarket() != null ? user.getMarket().getId() : null,
            user.getRole()
        );
    }

    /** Mesma regra para o login e para o app: {@link com.pdv2cloud.service.billing.AccessPolicy}. */
    private boolean isUserEnabled(User user) {
        if (!Boolean.TRUE.equals(user.getIsActive())) {
            return false;
        }
        if (user.getRole() == UserRole.SUPER_ADMIN) {
            return true;
        }
        return accessPolicy.of(user).canLogin();
    }
}
