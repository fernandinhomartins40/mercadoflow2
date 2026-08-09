package com.pdv2cloud.service;

import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.model.entity.MarketBillingStatus;
import com.pdv2cloud.model.entity.PlanType;
import com.pdv2cloud.model.entity.SubscriptionEvent;
import com.pdv2cloud.model.entity.SubscriptionEvent.EventType;
import com.pdv2cloud.model.entity.User;
import com.pdv2cloud.repository.SubscriptionEventRepository;
import java.util.List;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Trilha de assinatura: registra tudo que muda no plano ou na cobrança.
 *
 * Escreve em transação própria para que o registro sobreviva a um rollback da
 * operação que o originou — perder a trilha justamente quando algo falhou é o
 * pior momento para ficar sem ela.
 */
@Service
@Slf4j
public class SubscriptionEventService {

    private final SubscriptionEventRepository eventRepository;

    public SubscriptionEventService(SubscriptionEventRepository eventRepository) {
        this.eventRepository = eventRepository;
    }

    /**
     * Registra o cadastro na trilha.
     *
     * Diferente dos demais, participa da transação em curso (REQUIRED) em vez de
     * abrir uma nova. O mercado acabou de ser criado e ainda não foi commitado;
     * numa transação separada ele não seria visível, e a FK de market_id
     * falharia — foi exatamente o que quebrou o cadastro em produção.
     *
     * A consequência é aceitável: se o registro falhar depois deste ponto, o
     * evento some junto com o mercado — que é o comportamento correto, porque
     * não faz sentido guardar o cadastro de uma conta que não existe.
     */
    @Transactional(propagation = Propagation.REQUIRED)
    public void recordSignup(Market market, User owner) {
        SubscriptionEvent event = base(market, EventType.SIGNUP);
        event.setToPlan(market.getPlanType());
        event.setToStatus(market.getBillingStatus());
        event.setReason("Cadastro publico no plano gratuito");
        if (owner != null) {
            event.setActorUserId(owner.getId());
            event.setActorEmail(owner.getEmail());
        }
        saveOrThrow(event);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordPlanChange(
        Market market,
        PlanType fromPlan,
        PlanType toPlan,
        String reason,
        User actor
    ) {
        SubscriptionEvent event = base(market, EventType.PLAN_CHANGED);
        event.setFromPlan(fromPlan);
        event.setToPlan(toPlan);
        event.setReason(reason);
        applyActor(event, actor);
        save(event);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordStatusChange(
        Market market,
        MarketBillingStatus fromStatus,
        MarketBillingStatus toStatus,
        String reason,
        User actor
    ) {
        EventType type = switch (toStatus) {
            case CANCELLED -> EventType.CANCELLED;
            case ACTIVE -> fromStatus == MarketBillingStatus.SUSPENDED
                || fromStatus == MarketBillingStatus.CANCELLED
                ? EventType.REACTIVATED
                : EventType.STATUS_CHANGED;
            case TRIAL -> EventType.TRIAL_STARTED;
            default -> EventType.STATUS_CHANGED;
        };

        SubscriptionEvent event = base(market, type);
        event.setFromStatus(fromStatus);
        event.setToStatus(toStatus);
        event.setReason(reason);
        applyActor(event, actor);
        save(event);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordLimitOverride(Market market, String reason, User actor) {
        SubscriptionEvent event = base(market, EventType.LIMIT_OVERRIDE);
        event.setToPlan(market.getPlanType());
        event.setReason(reason);
        applyActor(event, actor);
        save(event);
    }

    /**
     * Mercado bateu o teto do ciclo. Gerado pelo sistema (sem ator), e a métrica
     * mais direta de pressão de conversão.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordLimitReached(Market market, int limit, int used) {
        SubscriptionEvent event = base(market, EventType.LIMIT_REACHED);
        event.setToPlan(market.getPlanType());
        event.setReason(String.format(
            "Limite mensal atingido: %d notas de %d disponiveis no plano %s",
            used, limit, market.getPlanType() != null ? market.getPlanType().getDisplayName() : "atual"
        ));
        save(event);
    }

    @Transactional(readOnly = true)
    public List<SubscriptionEvent> historyFor(UUID marketId) {
        return eventRepository.findTop50ByMarketIdOrderByCreatedAtDesc(marketId);
    }

    private SubscriptionEvent base(Market market, EventType type) {
        SubscriptionEvent event = new SubscriptionEvent();
        event.setMarket(market);
        event.setEventType(type);
        return event;
    }

    private void applyActor(SubscriptionEvent event, User actor) {
        if (actor != null) {
            event.setActorUserId(actor.getId());
            event.setActorEmail(actor.getEmail());
        }
    }

    /**
     * Grava o evento sem derrubar a operação que o originou.
     *
     * O try/catch só protege de fato nos métodos REQUIRES_NEW, onde a falha
     * fica contida na transação própria. Em recordSignup, que participa da
     * transação do cadastro, engolir a exceção não evitaria o rollback — o
     * Hibernate já teria marcado a transação como inconsistente. Por isso lá o
     * evento é gravado por saveOrThrow, que falha alto em vez de deixar o
     * cadastro morrer com uma mensagem sem relação com a causa.
     */
    private void save(SubscriptionEvent event) {
        try {
            eventRepository.save(event);
        } catch (Exception exc) {
            log.warn("Falha ao registrar evento de assinatura: {}", exc.getMessage());
        }
    }

    private void saveOrThrow(SubscriptionEvent event) {
        eventRepository.save(event);
    }
}
