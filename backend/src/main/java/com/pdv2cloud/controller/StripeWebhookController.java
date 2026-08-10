package com.pdv2cloud.controller;

import com.pdv2cloud.repository.StripeProcessedEventRepository;
import com.pdv2cloud.model.entity.StripeProcessedEvent;
import com.pdv2cloud.service.InvoiceReconciliationService;
import com.pdv2cloud.service.StripeService;
import com.pdv2cloud.tenancy.TenantContext;
import com.stripe.exception.SignatureVerificationException;
import com.stripe.model.Event;
import com.stripe.model.Invoice;
import com.stripe.model.Subscription;
import com.stripe.net.Webhook;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Recebe os eventos de cobrança do Stripe.
 *
 * É a rota que efetivamente concede acesso pago, então tem duas defesas
 * obrigatórias:
 *
 *  ASSINATURA — o corpo é validado com o webhook secret. Sem isso, qualquer um
 *    que descobrisse a URL poderia forjar um "pagamento aprovado" e liberar
 *    plano de graça. A verificação usa o corpo BRUTO: qualquer reserialização
 *    invalidaria a assinatura, e por isso o parâmetro é String, não um DTO.
 *
 *  IDEMPOTÊNCIA — o Stripe reenvia até receber 2xx e não garante entrega única.
 *    O id do evento é registrado; reenvios são reconhecidos e ignorados.
 *
 * Responde 200 mesmo em erro de processamento, exceto falha de assinatura: um
 * retorno de erro faz o Stripe reenviar em backoff por dias, e um evento que
 * falha por bug nosso continuaria falhando a cada tentativa.
 */
@RestController
@RequestMapping("/api/v1/stripe")
@Slf4j
public class StripeWebhookController {

    @Value("${app.stripe.webhook-secret:}")
    private String webhookSecret;

    private final StripeService stripeService;
    private final StripeProcessedEventRepository processedEventRepository;
    private final InvoiceReconciliationService invoiceReconciliationService;

    public StripeWebhookController(
        StripeService stripeService,
        StripeProcessedEventRepository processedEventRepository,
        InvoiceReconciliationService invoiceReconciliationService
    ) {
        this.stripeService = stripeService;
        this.processedEventRepository = processedEventRepository;
        this.invoiceReconciliationService = invoiceReconciliationService;
    }

    @PostMapping("/webhook")
    @Transactional
    public ResponseEntity<String> handle(
        @RequestBody String payload,
        @RequestHeader(value = "Stripe-Signature", required = false) String signature
    ) {
        if (webhookSecret == null || webhookSecret.isBlank()) {
            log.warn("Webhook do Stripe recebido sem STRIPE_WEBHOOK_SECRET configurado — ignorado");
            return ResponseEntity.ok("ignored");
        }

        Event event;
        try {
            event = Webhook.constructEvent(payload, signature, webhookSecret);
        } catch (SignatureVerificationException exc) {
            // 400 de propósito: assinatura inválida significa remetente não
            // confiável, e o Stripe legítimo nunca cai aqui.
            log.warn("Webhook com assinatura inválida rejeitado: {}", exc.getMessage());
            return ResponseEntity.badRequest().body("invalid signature");
        } catch (Exception exc) {
            log.warn("Webhook malformado rejeitado: {}", exc.getMessage());
            return ResponseEntity.badRequest().body("malformed");
        }

        if (TenantContext.runAsSystem(() -> processedEventRepository.existsById(event.getId()))) {
            log.debug("Evento {} já processado — reenvio ignorado", event.getId());
            return ResponseEntity.ok("duplicate");
        }

        try {
            // Webhook chega sem usuário e sem tenant: o mercado a atualizar é
            // descoberto pelo customer do Stripe. Sob RLS isso é fail-closed —
            // sem escopo de sistema, o processamento não enxergaria mercado
            // nenhum e o pagamento nunca seria baixado.
            TenantContext.runAsSystem(() -> process(event));
        } catch (Exception exc) {
            // 200 mesmo assim: reenviar não corrigiria um erro nosso, e manteria
            // o Stripe tentando por dias. O log é a trilha para investigar.
            log.error("Falha ao processar evento {} ({}): {}",
                event.getId(), event.getType(), exc.getMessage(), exc);
            return ResponseEntity.ok("error-logged");
        }

        // Também sob escopo de sistema: a tabela tem market_id e a gravação
        // acontece fora de qualquer request de usuário.
        TenantContext.runAsSystem(() -> {
            StripeProcessedEvent processed = new StripeProcessedEvent();
            processed.setEventId(event.getId());
            processed.setEventType(event.getType());
            processedEventRepository.save(processed);
        });

        return ResponseEntity.ok("ok");
    }

    private void process(Event event) {
        switch (event.getType()) {
            // Assinatura criada, alterada (upgrade/downgrade pelo portal) ou
            // cancelada. Os três caem no mesmo caminho porque o estado completo
            // vem no objeto, e sincronizar é idempotente.
            case "customer.subscription.created",
                 "customer.subscription.updated",
                 "customer.subscription.deleted" -> deserialize(event, Subscription.class)
                .ifPresent(stripeService::syncSubscription);

            // Ciclo de vida da fatura. Todos caem na mesma conciliação porque o
            // objeto do evento traz o estado completo e sincronizar é idempotente.
            //
            // No boleto, invoice.paid chega no dia útil SEGUINTE ao pagamento —
            // é o Stripe confirmando a compensação. É esse evento que faz a
            // baixa da fatura, dispensando leitura de retorno bancário.
            case "invoice.created",
                 "invoice.finalized",
                 "invoice.updated",
                 "invoice.voided",
                 "invoice.marked_uncollectible",
                 "invoice.paid",
                 "invoice.payment_succeeded" -> deserialize(event, Invoice.class)
                .ifPresent(invoiceReconciliationService::sync);

            case "invoice.payment_failed" -> deserialize(event, Invoice.class)
                .ifPresent(invoice -> {
                    invoiceReconciliationService.sync(invoice);
                    if (invoice.getCustomer() != null) {
                        stripeService.markPastDue(invoice.getCustomer());
                    }
                });

            case "checkout.session.completed" -> log.info(
                "Checkout concluído | evento={} (o plano sobe pelo evento de assinatura)",
                event.getId());

            default -> log.debug("Evento {} não tratado", event.getType());
        }
    }

    /**
     * Extrai o objeto do evento.
     *
     * O deserializer do Stripe falha quando a versão da API do evento difere da
     * do SDK — situação real quando o webhook foi criado numa versão antiga do
     * painel. Nesse caso caímos para a desserialização não segura, que ignora a
     * checagem de versão, em vez de descartar o evento silenciosamente.
     */
    private <T> java.util.Optional<T> deserialize(Event event, Class<T> type) {
        var deserializer = event.getDataObjectDeserializer();
        var object = deserializer.getObject();
        if (object.isPresent() && type.isInstance(object.get())) {
            return java.util.Optional.of(type.cast(object.get()));
        }
        try {
            Object unsafe = deserializer.deserializeUnsafe();
            if (type.isInstance(unsafe)) {
                log.debug("Evento {} desserializado em modo unsafe (versão de API divergente)",
                    event.getId());
                return java.util.Optional.of(type.cast(unsafe));
            }
        } catch (Exception exc) {
            log.warn("Não foi possível desserializar o evento {}: {}", event.getId(), exc.getMessage());
        }
        return java.util.Optional.empty();
    }
}
