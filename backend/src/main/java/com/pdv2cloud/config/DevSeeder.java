package com.pdv2cloud.config;

import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.model.entity.PlanType;
import com.pdv2cloud.model.entity.User;
import com.pdv2cloud.model.entity.UserRole;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.security.crypto.password.PasswordEncoder;

@Configuration
public class DevSeeder {

    @Bean
    @Profile("dev")
    public CommandLineRunner seed(UserRepository userRepository,
                                  MarketRepository marketRepository,
                                  PasswordEncoder passwordEncoder) {
        return args -> {
            Market market = marketRepository.findAll().stream()
                .findFirst()
                .orElseGet(() -> {
                    Market created = new Market();
                    created.setName("Mercado Demo");
                    created.setCnpj("00000000000000");
                    created.setPlanType(PlanType.ESSENCIAL);
                    created.setIsActive(true);
                    return marketRepository.save(created);
                });

            if (userRepository.findByEmail("admin@demo.com").isEmpty()) {
                User admin = new User();
                admin.setEmail("admin@demo.com");
                admin.setName("Admin Demo");
                admin.setPassword(passwordEncoder.encode("admin123"));
                admin.setRole(UserRole.ADMIN);
                admin.setMarket(market);
                admin.setIsActive(true);
                userRepository.save(admin);
            }

            if (userRepository.findByEmail("superadmin@demo.com").isEmpty()) {
                User superAdmin = new User();
                superAdmin.setEmail("superadmin@demo.com");
                superAdmin.setName("Super Admin Demo");
                superAdmin.setPassword(passwordEncoder.encode("superadmin123"));
                superAdmin.setRole(UserRole.SUPER_ADMIN);
                superAdmin.setMarket(null);
                superAdmin.setIsActive(true);
                userRepository.save(superAdmin);
            }
        };
    }
}
