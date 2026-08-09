package com.pdv2cloud.service;

import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.model.entity.MarketBillingStatus;
import com.pdv2cloud.model.entity.PlanType;
import com.pdv2cloud.repository.MarketRepository;
import com.stripe.Stripe;
import com.stripe.exception.StripeException;
import com.stripe.model.Customer;
import com.stripe.model.Subscription;
import com.stripe.model.billingportal.Session;
import com.stripe.param.CustomerCreateParams;
import com.stripe.param.billingportal.SessionCreateParams;
import com.stripe.param.checkout.SessionCreateParams.LineItem;
import com.stripe.param.checkout.SessionCreateParams.Mode;
import jakarta.annotation.PostConstruct;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Cobrança de assinaturas via Stripe.
 *
 * Divisão de responsabilidade: o Stripe é a fonte de verdade sobre pagamento —
 * quem pagou, quanto, até quando — enquanto {@link PlanType} continua definindo
 * o que cada plano permite. O Stripe diz QUAL plano; o código diz O QUE ele dá.
 * Sem essa separação, a regra de negócio ficaria espalhada entre o painel do
 * Stripe e o backend, e mudar um limite exigiria mexer nos dois.
 *
 * O fluxo é todo hospedado pelo Stripe (Checkout e Billing Portal), de modo que
 * nenhum dado de cartão passa por esta aplicação.
 *
 * Fica inteiramente desligado quando não há chave configurada: a aplicação sobe
 * igual e o upgrade volta a ser manual pelo painel do super admin.
 */
@Service
@Slf4j
public class StripeService {

    @Value("${app.stripe.enabled:false}")
    private boolean enabled;

    @Value("${app.stripe.secret-key:}")
    private String secretKey;

    @Value("${app.stripe.price-essencial:}")
    private String priceEssencial;

    @Value("${app.stripe.price-profissional:}")
    private String priceProfissional;

    @Value("${app.public-base-url:https://mercadoflow.com}")
    private String publicBaseUrl;

    private final MarketRepository marketRepository;
    private final SubscriptionEventService subscriptionEventService;

    public StripeService(
        MarketRepository marketRepository,
        SubscriptionEventService subscriptionEventService
    ) {
        this.marketRepository = marketRepository;
        this.subscriptionEventService = subscriptionEventService;
    }

    @PostConstruct
    void init() {
        if (isConfigured()) {
            Stripe.apiKey = secretKey;
            log.info("Stripe habilitado para cobrança de assinaturas");
        } else {
            log.info("Stripe desabilitado (STRIPE_SECRET_KEY ausente): upgrade permanece manual");
        }
    }

    public boolean isConfigured() {
        return enabled && secretKey != null && !secretKey.isBlank();
    }

    /** Preço configurado para o plano, ou vazio se o plano não é vendável online. */
    public Optional<String> priceIdFor(PlanType plan) {
        String priceId = switch (plan) {
            case ESSENCIAL -> priceEssencial;
            case PROFISSIONAL -> priceProfissional;
            // FREE não se compra; REDE é negociado caso a caso.
            default -> null;
        };
        return priceId == null || priceId.isBlank() ? Optional.empty() : Optional.of(priceId);
    }

    // ── Checkout ─────────────────────────────────────────────────────────────

    /**
     * Cria a sessão de pagamento e devolve a URL do Checkout do Stripe.
     *
     * O plano NÃO é alterado aqui: só sobe quando o webhook confirma o
     * pagamento. Confiar no redirect de sucesso deixaria a porta aberta para
     * alguém acessar a URL de retorno sem ter pago.
     */
    @Transactional
    public String createCheckoutSession(UUID marketId, PlanType plan) throws StripeException {
        requireConfigured();

        Market market = requireMarket(marketId);
        if (market.getParentMarket() != null) {
            throw new IllegalArgumentException(
                "Esta loja é filial: a assinatura é contratada pela matriz da rede.");
        }

        String priceId = priceIdFor(plan).orElseThrow(() -> new IllegalArgumentException(
            plan == PlanType.REDE
                ? "O plano Rede é sob medida. Fale com o comercial para receber a proposta."
                : "Este plano não está disponível para contratação online."
        ));

        String customerId = ensureCustomer(market);
        String base = publicBaseUrl.replaceAll("/+$", "");

        // payment_method_types deliberadamente NÃO é fixado: o Checkout oferece
        // o que estiver ativo em Settings → Payments da conta (hoje cartão e
        // boleto; Pix quando a capability for liberada). Fixar aqui exigiria
        // deploy a cada método novo e poderia ofertar um indisponível.
        com.stripe.param.checkout.SessionCreateParams params =
            com.stripe.param.checkout.SessionCreateParams.builder()
                .setMode(Mode.SUBSCRIPTION)
                .setCustomer(customerId)
                .addLineItem(LineItem.builder().setPrice(priceId).setQuantity(1L).build())
                .setSuccessUrl(base + "/app/planos?checkout=sucesso&session_id={CHECKOUT_SESSION_ID}")
                .setCancelUrl(base + "/app/planos?checkout=cancelado")
                // marketId no metadata: é como o webhook descobre a quem
                // pertence a assinatura sem depender de e-mail, que o cliente
                // pode trocar no próprio Checkout.
                .putMetadata("marketId", market.getId().toString())
                .putMetadata("planCode", plan.name())
                .setSubscriptionData(
                    com.stripe.param.checkout.SessionCreateParams.SubscriptionData.builder()
                        .putMetadata("marketId", market.getId().toString())
                        .putMetadata("planCode", plan.name())
                        .build()
                )
                .build();

        // Nota sobre boleto: o Stripe ignora payment_method_options[boleto] em
        // modo subscription (verificado na API — só retorna as opções de card),
        // então o prazo de vencimento vem da configuração da conta. Como o
        // boleto leva de 1 a 3 dias úteis para compensar, a assinatura pode
        // passar por past_due nesse intervalo; o sistema mantém o acesso nesse
        // estado justamente para não penalizar quem pagou e está aguardando
        // compensação (ver syncSubscription).

        com.stripe.model.checkout.Session session =
            com.stripe.model.checkout.Session.create(params);

        log.info("Checkout criado | market={} | plano={} | session={}",
            marketId, plan, session.getId());
        return session.getUrl();
    }

    /**
     * URL do Billing Portal, onde o cliente troca cartão, muda de plano ou
     * cancela sem precisar de tela própria nossa.
     */
    @Transactional
    public String createPortalSession(UUID marketId) throws StripeException {
        requireConfigured();

        Market market = requireMarket(marketId);
        String customerId = market.getStripeCustomerId();
        if (customerId == null || customerId.isBlank()) {
            throw new IllegalArgumentException(
                "Esta conta ainda não tem assinatura ativa. Escolha um plano para começar.");
        }

        Session session = Session.create(
            SessionCreateParams.builder()
                .setCustomer(customerId)
                .setReturnUrl(publicBaseUrl.replaceAll("/+$", "") + "/app/planos")
                .build()
        );
        return session.getUrl();
    }

    /** Cliente do Stripe do mercado, criado na primeira contratação. */
    private String ensureCustomer(Market market) throws StripeException {
        if (market.getStripeCustomerId() != null && !market.getStripeCustomerId().isBlank()) {
            return market.getStripeCustomerId();
        }

        CustomerCreateParams.Builder params = CustomerCreateParams.builder()
            .setName(market.getName())
            .putMetadata("marketId", market.getId().toString());

        if (market.getContactEmail() != null && !market.getContactEmail().isBlank()) {
            params.setEmail(market.getContactEmail());
        }
        if (market.getCnpj() != null && !market.getCnpj().isBlank()) {
            params.putMetadata("cnpj", market.getCnpj());
        }

        Customer customer = Customer.create(params.build());
        market.setStripeCustomerId(customer.getId());
        marketRepository.save(market);

        log.info("Cliente Stripe criado | market={} | customer={}", market.getId(), customer.getId());
        return customer.getId();
    }

    // ── Sincronização vinda do webhook ───────────────────────────────────────

    /**
     * Aplica ao mercado o estado de uma assinatura do Stripe.
     *
     * Chamado pelo webhook em criação, atualização e cancelamento. Idempotente
     * por construção: reaplicar o mesmo estado não muda nada, o que importa
     * porque o Stripe reenvia eventos.
     */
    @Transactional
    public void syncSubscription(Subscription subscription) {
        Market market = resolveMarket(subscription).orElse(null);
        if (market == null) {
            log.warn("Assinatura {} sem mercado correspondente — ignorada", subscription.getId());
            return;
        }

        PlanType previousPlan = market.getPlanType();
        MarketBillingStatus previousStatus = market.getBillingStatus();

        String status = subscription.getStatus();
        market.setStripeSubscriptionId(subscription.getId());
        market.setStripeStatus(status);
        market.setCancelAtPeriodEnd(Boolean.TRUE.equals(subscription.getCancelAtPeriodEnd()));

        PlanType targetPlan = planFromSubscription(subscription).orElse(previousPlan);

        // Mapeia o status do Stripe para o acesso na aplicação.
        //
        // past_due e unpaid mantêm o plano: o Stripe ainda está tentando cobrar,
        // e cortar o acesso na primeira falha de cartão puniria o cliente por um
        // problema que costuma se resolver sozinho em dias.
        switch (status) {
            case "active", "trialing" -> {
                market.setPlanType(targetPlan);
                market.setBillingStatus(MarketBillingStatus.ACTIVE);
                market.setIsActive(true);
            }
            case "past_due", "unpaid" -> {
                market.setBillingStatus(MarketBillingStatus.PAST_DUE);
                market.setIsActive(true);
            }
            case "canceled", "incomplete_expired" -> {
                // Volta ao gratuito em vez de bloquear: o cliente continua
                // usando com os limites do FREE, o que preserva o histórico e
                // deixa a porta aberta para ele voltar.
                market.setPlanType(PlanType.FREE);
                market.setBillingStatus(MarketBillingStatus.ACTIVE);
                market.setIsActive(true);
                market.setStripeSubscriptionId(null);
            }
            default -> log.info("Status Stripe não tratado: {} (assinatura {})", status, subscription.getId());
        }

        if (market.getPlanType() != previousPlan) {
            market.setPlanChangedAt(LocalDateTime.now());
        }
        marketRepository.save(market);

        if (market.getPlanType() != previousPlan) {
            subscriptionEventService.recordPlanChange(
                market, previousPlan, market.getPlanType(),
                "Assinatura Stripe " + status, null
            );
        } else if (market.getBillingStatus() != previousStatus) {
            subscriptionEventService.recordStatusChange(
                market, previousStatus, market.getBillingStatus(),
                "Assinatura Stripe " + status, null
            );
        }

        log.info("Assinatura sincronizada | market={} | status={} | plano={}",
            market.getId(), status, market.getPlanType());
    }

    /** Localiza o mercado pelo metadata da assinatura, ou pelo cliente Stripe. */
    private Optional<Market> resolveMarket(Subscription subscription) {
        Map<String, String> metadata = subscription.getMetadata();
        if (metadata != null && metadata.get("marketId") != null) {
            try {
                return marketRepository.findById(UUID.fromString(metadata.get("marketId")));
            } catch (IllegalArgumentException ignored) {
                // metadata inválido: cai para a busca por customer
            }
        }
        if (subscription.getCustomer() != null) {
            return marketRepository.findAll().stream()
                .filter(m -> subscription.getCustomer().equals(m.getStripeCustomerId()))
                .findFirst();
        }
        return Optional.empty();
    }

    /**
     * Plano correspondente à assinatura.
     *
     * Prefere o price ID, que é o que o cliente efetivamente contratou; o
     * metadata serve de reserva porque pode ficar defasado se o plano for
     * trocado pelo Billing Portal.
     */
    private Optional<PlanType> planFromSubscription(Subscription subscription) {
        try {
            if (subscription.getItems() != null && subscription.getItems().getData() != null) {
                for (var item : subscription.getItems().getData()) {
                    if (item.getPrice() == null) {
                        continue;
                    }
                    String priceId = item.getPrice().getId();
                    for (PlanType plan : PlanType.values()) {
                        if (priceIdFor(plan).filter(priceId::equals).isPresent()) {
                            return Optional.of(plan);
                        }
                    }
                }
            }
        } catch (Exception exc) {
            log.debug("Falha ao resolver plano pelo price: {}", exc.getMessage());
        }

        Map<String, String> metadata = subscription.getMetadata();
        if (metadata != null && metadata.get("planCode") != null) {
            return Optional.of(PlanType.fromString(metadata.get("planCode")));
        }
        return Optional.empty();
    }

    /** Marca inadimplência quando o Stripe não consegue cobrar a fatura. */
    @Transactional
    public void markPastDue(String customerId) {
        marketRepository.findAll().stream()
            .filter(m -> customerId.equals(m.getStripeCustomerId()))
            .findFirst()
            .ifPresent(market -> {
                MarketBillingStatus previous = market.getBillingStatus();
                market.setBillingStatus(MarketBillingStatus.PAST_DUE);
                marketRepository.save(market);
                subscriptionEventService.recordStatusChange(
                    market, previous, MarketBillingStatus.PAST_DUE,
                    "Falha no pagamento da fatura", null
                );
            });
    }

    static LocalDateTime toLocalDateTime(Long epochSeconds) {
        if (epochSeconds == null) {
            return null;
        }
        return LocalDateTime.ofInstant(Instant.ofEpochSecond(epochSeconds), ZoneId.systemDefault());
    }

    private void requireConfigured() {
        if (!isConfigured()) {
            throw new IllegalStateException(
                "Pagamento online ainda não está configurado. Fale com o comercial para contratar.");
        }
    }

    private Market requireMarket(UUID marketId) {
        return marketRepository.findById(marketId)
            .orElseThrow(() -> new IllegalArgumentException("Mercado não encontrado"));
    }
}
