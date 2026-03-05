package com.pdv2cloud.config;

import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.model.entity.PlanType;
import com.pdv2cloud.model.entity.User;
import com.pdv2cloud.model.entity.UserRole;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.security.crypto.password.PasswordEncoder;

@Configuration
public class ProductionSeeder {

    private static final Logger logger = LoggerFactory.getLogger(ProductionSeeder.class);

    @Value("${app.admin.email:admin@mercadoflow.com}")
    private String adminEmail;

    @Value("${app.admin.password:MercadoFlow@2026}")
    private String adminPassword;

    @Value("${app.admin.name:Administrador}")
    private String adminName;

    @Value("${app.super-admin.email:superadmin@mercadoflow.com}")
    private String superAdminEmail;

    @Value("${app.super-admin.password:SuperAdmin@2026}")
    private String superAdminPassword;

    @Value("${app.super-admin.name:Super Administrador}")
    private String superAdminName;

    @Bean
    @Profile("production")
    public CommandLineRunner seedProduction(
        UserRepository userRepository,
        MarketRepository marketRepository,
        PasswordEncoder passwordEncoder
    ) {
        return args -> {
            Market defaultMarket = ensureDefaultMarket(marketRepository);
            ensureAdminUser(userRepository, passwordEncoder, defaultMarket);
            ensureSuperAdminUser(userRepository, passwordEncoder);
        };
    }

    private Market ensureDefaultMarket(MarketRepository marketRepository) {
        return marketRepository.findAll().stream()
            .findFirst()
            .orElseGet(() -> {
                Market market = new Market();
                market.setName("MercadoFlow Admin");
                market.setCnpj("00000000000000");
                market.setPlanType(PlanType.ADVANCED);
                market.setIsActive(true);
                Market saved = marketRepository.save(market);
                logger.info("Created default market: {}", saved.getName());
                return saved;
            });
    }

    private void ensureAdminUser(UserRepository userRepository, PasswordEncoder passwordEncoder, Market market) {
        if (userRepository.findByEmail(adminEmail).isPresent()) {
            return;
        }

        User admin = new User();
        admin.setEmail(adminEmail);
        admin.setName(adminName);
        admin.setPassword(passwordEncoder.encode(adminPassword));
        admin.setRole(UserRole.ADMIN);
        admin.setMarket(market);
        admin.setIsActive(true);
        userRepository.save(admin);
        logger.info("Created admin user: {}", adminEmail);
    }

    private void ensureSuperAdminUser(UserRepository userRepository, PasswordEncoder passwordEncoder) {
        if (userRepository.findByEmail(superAdminEmail).isPresent()) {
            return;
        }

        User superAdmin = new User();
        superAdmin.setEmail(superAdminEmail);
        superAdmin.setName(superAdminName);
        superAdmin.setPassword(passwordEncoder.encode(superAdminPassword));
        superAdmin.setRole(UserRole.SUPER_ADMIN);
        superAdmin.setIsActive(true);
        superAdmin.setMarket(null);
        userRepository.save(superAdmin);
        logger.info("Created super admin user: {}", superAdminEmail);
    }
}
