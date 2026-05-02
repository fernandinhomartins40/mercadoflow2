package com.pdv2cloud.service;

import com.pdv2cloud.model.dto.LoginRequest;
import com.pdv2cloud.model.dto.LoginResponse;
import com.pdv2cloud.model.dto.RegisterRequest;
import com.pdv2cloud.model.dto.RegisterResponse;
import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.model.entity.MarketBillingStatus;
import com.pdv2cloud.model.entity.PlanType;
import com.pdv2cloud.model.entity.User;
import com.pdv2cloud.model.entity.UserRole;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.repository.UserRepository;
import com.pdv2cloud.security.JwtTokenProvider;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private MarketRepository marketRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private AuthenticationManager authenticationManager;

    @Autowired
    private JwtTokenProvider tokenProvider;

    @Transactional
    public RegisterResponse register(RegisterRequest request) {
        String normalizedEmail = request.getEmail().trim().toLowerCase();
        if (userRepository.findForAuthenticationByEmail(normalizedEmail).isPresent()) {
            throw new IllegalArgumentException("Email ja cadastrado");
        }
        Market market = new Market();
        market.setName(request.getMarketName() != null && !request.getMarketName().isBlank() ? request.getMarketName().trim() : request.getName().trim());
        market.setCnpj(request.getMarketCnpj() == null || request.getMarketCnpj().isBlank() ? null : request.getMarketCnpj().trim());
        market.setPlanType(PlanType.BASIC);
        market.setBillingStatus(MarketBillingStatus.PENDING);
        market.setIsActive(false);
        market.setUserSeatLimit(3);
        market.setContactName(request.getName().trim());
        market.setContactEmail(normalizedEmail);
        market.setNotes("Cadastro publico aguardando liberacao no painel Super Admin.");
        market = marketRepository.save(market);

        User user = new User();
        user.setEmail(normalizedEmail);
        user.setName(request.getName().trim());
        user.setPassword(passwordEncoder.encode(request.getPassword()));
        user.setRole(UserRole.MARKET_OWNER);
        user.setMarket(market);
        user.setIsActive(true);
        user = userRepository.save(user);
        market.setOwner(user);
        marketRepository.save(market);

        return new RegisterResponse(
            user.getId(),
            market.getId(),
            MarketBillingStatus.PENDING.name(),
            "Cadastro recebido. O acesso sera liberado apos aprovacao da assinatura."
        );
    }

    public LoginResponse login(LoginRequest request) {
        Authentication auth = authenticationManager.authenticate(
            new UsernamePasswordAuthenticationToken(request.getEmail(), request.getPassword()));
        long tokenTtl = Boolean.TRUE.equals(request.getKeepConnected())
            ? Duration.ofDays(30).toMillis()
            : Duration.ofDays(1).toMillis();
        String token = tokenProvider.generateToken(auth, tokenTtl);

        User user = userRepository.findForAuthenticationByEmail(request.getEmail()).orElseThrow();
        if (user.getRole() == UserRole.SUPER_ADMIN) {
            throw new IllegalArgumentException("Use o login do painel Super Admin");
        }
        touchLastLogin(user);
        UUID marketId = user.getMarket() != null ? user.getMarket().getId() : null;
        return new LoginResponse(token, user.getId(), user.getRole().name(), marketId);
    }

    public LoginResponse superAdminLogin(LoginRequest request) {
        Authentication auth = authenticationManager.authenticate(
            new UsernamePasswordAuthenticationToken(request.getEmail(), request.getPassword()));
        long tokenTtl = Boolean.TRUE.equals(request.getKeepConnected())
            ? Duration.ofDays(30).toMillis()
            : Duration.ofDays(1).toMillis();
        String token = tokenProvider.generateToken(auth, tokenTtl);

        User user = userRepository.findForAuthenticationByEmail(request.getEmail()).orElseThrow();
        if (user.getRole() != UserRole.SUPER_ADMIN) {
            throw new IllegalArgumentException("Credenciais sem permissao de Super Admin");
        }
        touchLastLogin(user);
        return new LoginResponse(token, user.getId(), user.getRole().name(), null);
    }

    private void touchLastLogin(User user) {
        user.setLastLoginAt(LocalDateTime.now());
        userRepository.save(user);
    }
}
