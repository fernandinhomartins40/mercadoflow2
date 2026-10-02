package com.pdv2cloud.service;

import org.springframework.context.annotation.Profile;

import com.pdv2cloud.model.dto.LoginRequest;
import com.pdv2cloud.model.dto.LoginResponse;
import com.pdv2cloud.model.dto.RegisterRequest;
import com.pdv2cloud.model.dto.RegisterResponse;
import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.tenancy.TenantContext;
import com.pdv2cloud.model.entity.MarketBillingStatus;
import com.pdv2cloud.model.entity.PlanType;
import com.pdv2cloud.model.entity.User;
import com.pdv2cloud.model.entity.UserRole;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.repository.UserRepository;
import com.pdv2cloud.security.JwtTokenProvider;
import com.pdv2cloud.util.CnpjUtils;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Profile("!jobs")
@Service
public class AuthService {

    /** Assinatura única: muda junto quando o plano ou o estado é alterado por aqui. */
    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private com.pdv2cloud.service.billing.SubscriptionService subscriptionSync;


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

    @Autowired
    private SubscriptionEventService subscriptionEventService;

    @Autowired
    private ProductEventService productEventService;

    @Autowired
    private com.pdv2cloud.service.billing.AccessPolicy accessPolicy;

    /**
     * O cadastro público cria o mercado e o primeiro usuário sem que exista
     * tenant na sessão — é ele que dá origem ao tenant.
     *
     * O escopo de sistema é aplicado pelo AuthController, antes de entrar aqui:
     * o TenantAwareDataSource fixa as variáveis de tenant no checkout da
     * conexão, e o @Transactional a obtém antes do corpo executar, então um
     * runAsSystem interno marcaria is_admin tarde demais.
     */
    @Transactional
    public RegisterResponse register(RegisterRequest request) {
        return doRegister(request);
    }

    private RegisterResponse doRegister(RegisterRequest request) {
        String normalizedEmail = request.getEmail().trim().toLowerCase();
        if (userRepository.findForAuthenticationByEmail(normalizedEmail).isPresent()) {
            throw new IllegalArgumentException("Email ja cadastrado");
        }
        String normalizedCnpj = request.getMarketCnpj() == null || request.getMarketCnpj().isBlank()
            ? null
            : request.getMarketCnpj().trim();

        // Anti-fatiamento de rede: filiais da mesma empresa compartilham os 8
        // primeiros dígitos do CNPJ. Sem esta checagem, uma rede abriria uma
        // conta gratuita por loja e nunca sentiria os limites do plano, que são
        // apurados por rede.
        String cnpjRoot = CnpjUtils.root(normalizedCnpj);
        if (cnpjRoot != null) {
            List<Market> sameCompany = marketRepository.findByCnpjRoot(cnpjRoot);
            if (!sameCompany.isEmpty()) {
                throw new IllegalArgumentException(
                    "Já existe uma conta do Mercado Flow para esta empresa (CNPJ "
                        + CnpjUtils.format(normalizedCnpj) + "). "
                        + "Peça ao administrador da conta para adicionar esta loja como filial, "
                        + "ou fale com o comercial para um plano de rede."
                );
            }
        }

        Market market = new Market();
        market.setName(request.getMarketName() != null && !request.getMarketName().isBlank() ? request.getMarketName().trim() : request.getName().trim());
        market.setCnpj(normalizedCnpj);
        market.setCnpjRoot(cnpjRoot);
        // Freemium: acesso imediato, sem cartão e sem aprovação manual.
        // O cadastro público criava o mercado como PENDING/inativo, estado em
        // que CustomUserDetailsService bloqueia o login — ninguém entrava sem o
        // super admin liberar à mão, o oposto do que o plano gratuito exige.
        // Os limites do plano FREE (ver PlanType) é que contêm o uso agora.
        market.setPlanType(PlanType.FREE);
        market.setBillingStatus(MarketBillingStatus.ACTIVE);
        market.setIsActive(true);
        market.setUserSeatLimit(PlanType.FREE.getUserSeatLimit());
        market.setBillingCycleStart(LocalDate.now().withDayOfMonth(1));
        market.setContactName(request.getName().trim());
        market.setContactEmail(normalizedEmail);
        if (request.getMarketPhone() != null && !request.getMarketPhone().isBlank()) {
            market.setContactPhone(request.getMarketPhone().trim());
        }
        // intendedPlan registra apenas a intencao: a conta nasce no gratuito e o
        // checkout e oferecido apos o primeiro acesso.
        market.setNotes(request.getIntendedPlan() != null && !request.getIntendedPlan().isBlank()
            ? "Cadastro publico no plano gratuito. Interesse declarado: " + request.getIntendedPlan()
            : "Cadastro publico no plano gratuito.");
        market = marketRepository.save(market);
        if (subscriptionSync != null) { subscriptionSync.syncFromMarket(market, "cadastro"); }

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

        subscriptionEventService.recordSignup(market, user);
        // O evento vai por JDBC e referencia markets por FK; o JPA ainda não
        // enviou o INSERT do mercado (só no flush do commit).
        marketRepository.flush();
        productEventService.record(market.getId(), ProductEventService.ACTIVATION_REGISTERED);

        return new RegisterResponse(
            user.getId(),
            market.getId(),
            MarketBillingStatus.ACTIVE.name(),
            String.format(
                "Conta criada no plano %s. Voce ja pode entrar e instalar o Agente Mercado Flow. "
                    + "Inclui %d notas fiscais por semana, sem cartao de credito.",
                PlanType.FREE.getDisplayName(),
                PlanType.FREE.getMonthlyInvoiceLimit()
            )
        );
    }

    public LoginResponse login(LoginRequest request) {
        Authentication auth;
        try {
            auth = authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(request.getEmail(), request.getPassword()));
        } catch (org.springframework.security.authentication.DisabledException disabled) {
            // O Spring recusa conta bloqueada ANTES de conferir a senha. Só
            // explicamos o motivo a quem acertou a senha; para os outros, a
            // resposta continua sendo "e-mail ou senha incorretos".
            User user = userRepository.findForAuthenticationByEmail(request.getEmail()).orElse(null);
            if (user != null && user.getPassword() != null && passwordEncoder.matches(request.getPassword(), user.getPassword())) {
                com.pdv2cloud.service.billing.AccessPolicy.Access access = accessPolicy.of(user);
                throw new com.pdv2cloud.exception.AccountAccessException(access.state(), access.message());
            }
            throw new org.springframework.security.authentication.BadCredentialsException("Bad credentials");
        }
        long tokenTtl = Boolean.TRUE.equals(request.getKeepConnected())
            ? Duration.ofDays(30).toMillis()
            : Duration.ofDays(1).toMillis();

        User user = userRepository.findForAuthenticationByEmail(request.getEmail()).orElseThrow();
        if (user.getRole() == UserRole.SUPER_ADMIN) {
            throw new IllegalArgumentException("Use o login do painel Super Admin");
        }
        UUID marketId = user.getMarket() != null ? user.getMarket().getId() : null;
        // Segunda etapa ligada: o token só sai depois do código do aplicativo.
        if (Boolean.TRUE.equals(user.getTotpEnabled()) && twoFactor != null) {
            String challenge = twoFactor.challenge(user.getId(), Boolean.TRUE.equals(request.getKeepConnected()));
            return new LoginResponse(null, user.getId(), user.getRole().name(), marketId, true, challenge);
        }
        String token = tokenProvider.generateToken(auth, tokenTtl);
        touchLastLogin(user);
        return new LoginResponse(token, user.getId(), user.getRole().name(), marketId);
    }

    /** Segunda etapa: confere o código e emite o token. Devolve também se é para manter conectado. */
    public java.util.Map.Entry<LoginResponse, Boolean> loginSecondStep(String challenge, String code) {
        if (twoFactor == null) {
            throw new IllegalStateException("Verificação em duas etapas indisponível");
        }
        com.pdv2cloud.service.team.TwoFactorService.Challenge c = twoFactor.complete(challenge, code);
        User user = userRepository.findById(c.userId()).orElseThrow();
        org.springframework.security.core.userdetails.UserDetails details = userDetailsService.loadUserByUsername(user.getEmail());
        if (!details.isEnabled()) {
            throw new IllegalArgumentException("Conta sem acesso no momento.");
        }
        Authentication auth = new UsernamePasswordAuthenticationToken(details, null, details.getAuthorities());
        long ttl = c.keep() ? Duration.ofDays(30).toMillis() : Duration.ofDays(1).toMillis();
        String token = tokenProvider.generateToken(auth, ttl);
        touchLastLogin(user);
        UUID marketId = user.getMarket() != null ? user.getMarket().getId() : null;
        return java.util.Map.entry(new LoginResponse(token, user.getId(), user.getRole().name(), marketId), c.keep());
    }

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private com.pdv2cloud.service.team.TwoFactorService twoFactor;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    @org.springframework.context.annotation.Lazy
    private com.pdv2cloud.service.billing.NotificationService welcome;

    /**
     * Boas-vindas do cadastro. Chamado depois do commit (pelo controller): o
     * aviso referencia o mercado, que só existe no banco depois dele.
     */
    public void sendWelcome(UUID marketId, String name) {
        if (welcome == null || marketId == null) {
            return;
        }
        try {
            String first = name == null || name.isBlank() ? "" : name.trim().split("\\s+")[0];
            welcome.notify(marketId, "WELCOME", "welcome", com.pdv2cloud.service.billing.NotificationService.Severity.INFO,
                "Bem-vindo ao MercadoFlow", "Sua conta está pronta, no plano Grátis.", "Instalar o agente", "/app/pdvs", true,
                java.util.Map.of("nome", first));
        } catch (RuntimeException e) {
            // boas-vindas não pode travar o cadastro
        }
    }

    @org.springframework.beans.factory.annotation.Autowired
    private com.pdv2cloud.security.CustomUserDetailsService userDetailsService;

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
