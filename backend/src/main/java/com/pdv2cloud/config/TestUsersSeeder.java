package com.pdv2cloud.config;

import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.model.entity.MarketBillingStatus;
import com.pdv2cloud.model.entity.PlanType;
import com.pdv2cloud.model.entity.User;
import com.pdv2cloud.model.entity.UserRole;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.repository.UserRepository;
import com.pdv2cloud.tenancy.TenantContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.security.crypto.password.PasswordEncoder;

/**
 * Contas de teste (ADMIN e SUPER_ADMIN) usadas para validar a aplicação em produção.
 *
 * Roda a cada subida do backend, portanto a cada deploy. Diferente do
 * {@link ProductionSeeder}, que só cria quando falta, este também REALINHA
 * senha, papel e status das contas existentes: a senha vale o que estiver no
 * secret do deploy, e alguém que troque ou desative a conta pelo painel não
 * deixa as credenciais documentadas inválidas.
 *
 * Contas separadas das reais de propósito. O super admin real é o que os
 * coletores usam para autenticar; mexer na senha dele derrubaria a coleta.
 *
 * As senhas vêm só do ambiente (secrets TEST_ADMIN_PASSWORD e
 * TEST_SUPER_ADMIN_PASSWORD) porque o repositório é público. Senha vazia =
 * conta não é criada nem alterada.
 *
 * O ADMIN de teste fica num mercado próprio, identificado por um CNPJ fictício,
 * para não herdar nem poluir os dados de nenhum mercado real.
 */
@Configuration
public class TestUsersSeeder {

    private static final Logger logger = LoggerFactory.getLogger(TestUsersSeeder.class);

    /** CNPJ fictício que identifica o mercado de teste entre as subidas. */
    static final String TEST_MARKET_CNPJ = "99999999999999";

    @Value("${app.test-users.admin.email:admin.teste@mercadoflow.com}")
    private String adminEmail;

    @Value("${app.test-users.admin.password:}")
    private String adminPassword;

    @Value("${app.test-users.super-admin.email:superadmin.teste@mercadoflow.com}")
    private String superAdminEmail;

    @Value("${app.test-users.super-admin.password:}")
    private String superAdminPassword;

    @Bean
    @Profile("production")
    public CommandLineRunner seedTestUsers(
        UserRepository userRepository,
        MarketRepository marketRepository,
        PasswordEncoder passwordEncoder
    ) {
        // Sem tenant na sessão a RLS é fail-closed: a busca pelo mercado e pelos
        // usuários voltaria vazia e o seeder tentaria recriar o que já existe.
        return args -> TenantContext.runAsSystem(() -> {
            if (isBlank(adminPassword)) {
                logger.warn("TEST_ADMIN_PASSWORD not set; skipping test admin seed for {}", adminEmail);
            } else {
                Market market = ensureTestMarket(marketRepository);
                upsertUser(userRepository, passwordEncoder, adminEmail, adminPassword,
                    "Admin Teste", UserRole.ADMIN, market);
            }

            if (isBlank(superAdminPassword)) {
                logger.warn("TEST_SUPER_ADMIN_PASSWORD not set; skipping test super admin seed for {}", superAdminEmail);
            } else {
                upsertUser(userRepository, passwordEncoder, superAdminEmail, superAdminPassword,
                    "Super Admin Teste", UserRole.SUPER_ADMIN, null);
            }
        });
    }

    private Market ensureTestMarket(MarketRepository marketRepository) {
        return marketRepository.findByCnpj(TEST_MARKET_CNPJ).orElseGet(() -> {
            Market market = new Market();
            market.setName("Mercado Teste");
            market.setCnpj(TEST_MARKET_CNPJ);
            market.setPlanType(PlanType.REDE);
            market.setBillingStatus(MarketBillingStatus.ACTIVE);
            market.setIsUnlimited(true);
            market.setIsActive(true);
            Market saved = marketRepository.save(market);
            logger.info("Created test market: {}", saved.getName());
            return saved;
        });
    }

    private void upsertUser(
        UserRepository userRepository,
        PasswordEncoder passwordEncoder,
        String email,
        String rawPassword,
        String name,
        UserRole role,
        Market market
    ) {
        User user = userRepository.findByEmail(email).orElse(null);
        if (user == null) {
            user = new User();
            user.setEmail(email);
            user.setName(name);
            user.setPassword(passwordEncoder.encode(rawPassword));
            user.setRole(role);
            user.setMarket(market);
            user.setIsActive(true);
            userRepository.save(user);
            logger.info("Created test user: {} ({})", email, role);
            return;
        }

        // Só regrava quando algo divergiu: evita um UPDATE (e um novo hash
        // bcrypt no banco) a cada restart sem necessidade.
        boolean changed = false;
        if (!passwordEncoder.matches(rawPassword, user.getPassword())) {
            user.setPassword(passwordEncoder.encode(rawPassword));
            changed = true;
        }
        if (user.getRole() != role) {
            user.setRole(role);
            changed = true;
        }
        if (!Boolean.TRUE.equals(user.getIsActive())) {
            user.setIsActive(true);
            changed = true;
        }
        if (market != null && (user.getMarket() == null || !market.getId().equals(user.getMarket().getId()))) {
            user.setMarket(market);
            changed = true;
        }
        if (changed) {
            userRepository.save(user);
            logger.info("Realigned test user: {} ({})", email, role);
        }
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
