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
            if (userRepository.count() > 0) {
                return;
            }

            Market market = new Market();
            market.setName("Mercado Demo");
            market.setCnpj("00000000000000");
            market.setPlanType(PlanType.BASIC);
            marketRepository.save(market);

            User admin = new User();
            admin.setEmail("admin@demo.com");
            admin.setName("Admin Demo");
            admin.setPassword(passwordEncoder.encode("admin123"));
            admin.setRole(UserRole.ADMIN);
            admin.setMarket(market);
            userRepository.save(admin);
        };
    }
}
