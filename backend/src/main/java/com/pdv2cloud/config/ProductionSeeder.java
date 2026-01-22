package com.pdv2cloud.config;

import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.model.entity.PlanType;
import com.pdv2cloud.model.entity.User;
import com.pdv2cloud.model.entity.UserRole;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
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

    @Bean
    @Profile("production")
    public CommandLineRunner seedProduction(UserRepository userRepository,
                                            MarketRepository marketRepository,
                                            PasswordEncoder passwordEncoder) {
        return args -> {
            // Só cria se o banco estiver vazio
            if (userRepository.count() > 0) {
                logger.info("✅ Database already contains users. Skipping production seeding.");
                return;
            }

            logger.info("🌱 Initializing production database with default admin user...");

            // Cria mercado padrão
            Market market = new Market();
            market.setName("MercadoFlow Admin");
            market.setCnpj("00000000000000");
            market.setPlanType(PlanType.ADVANCED);
            marketRepository.save(market);
            logger.info("✅ Created default market: {}", market.getName());

            // Cria usuário admin
            User admin = new User();
            admin.setEmail(adminEmail);
            admin.setName(adminName);
            admin.setPassword(passwordEncoder.encode(adminPassword));
            admin.setRole(UserRole.ADMIN);
            admin.setMarket(market);
            userRepository.save(admin);

            logger.info("✅ Created admin user: {}", adminEmail);
            logger.info("⚠️  IMPORTANT: Change the admin password after first login!");
            logger.info("📧 Email: {}", adminEmail);
            logger.info("🔑 Password: {}", adminPassword);
        };
    }
}
