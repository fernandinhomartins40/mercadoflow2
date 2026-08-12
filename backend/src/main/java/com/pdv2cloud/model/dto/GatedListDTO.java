package com.pdv2cloud.model.dto;

import com.pdv2cloud.model.entity.PlanType;
import com.pdv2cloud.service.PlanService;
import java.util.List;

/**
 * Envelope de lista de inteligência.
 *
 * O formato nasceu para o recorte por plano (5 itens no gratuito). Desde
 * 12/08/2026 as listas vão COMPLETAS em qualquer plano — o limite passou a ser
 * alcance, não quantidade — e o envelope permanece porque o contrato com o
 * frontend já está estabelecido e porque o recorte segue disponível para casos
 * pontuais. Ver {@link #complete}.
 */
public record GatedListDTO<T>(
    List<T> items,
    /** Quantos itens existiriam sem o recorte. */
    int totalAvailable,
    /** Quantos ficaram de fora. Zero quando o plano vê tudo. */
    int hiddenCount,
    boolean truncated,
    String planCode,
    String planName,
    /** Texto pronto para o aviso de upgrade; nulo quando nada foi ocultado. */
    String upgradeMessage
) {

    /**
     * Lista inteira, sem recorte.
     *
     * O caminho padrão desde a régua de 12/08/2026: cortar a lista impedia o
     * lojista de USAR o recurso — 5 produtos de 300 não planejam compra
     * nenhuma — e frustrava antes de qualquer valor percebido.
     */
    public static <T> GatedListDTO<T> complete(List<T> items) {
        List<T> safe = items == null ? List.of() : items;
        return new GatedListDTO<>(safe, safe.size(), 0, false, null, null, null);
    }

    /** @deprecated ver {@link #complete}; o recorte deixou de ser a régua. */
    @Deprecated
    public static <T> GatedListDTO<T> of(PlanService.InsightSlice<T> slice, PlanType plan) {
        String message = slice.truncated()
            ? String.format(
                "Mostrando os %d principais de %d. Faça upgrade para ver a lista completa "
                    + "e planejar a compra com todo o portfólio.",
                slice.items().size(), slice.totalAvailable())
            : null;

        return new GatedListDTO<>(
            slice.items(),
            slice.totalAvailable(),
            slice.hiddenCount(),
            slice.truncated(),
            plan.name(),
            plan.getDisplayName(),
            message
        );
    }
}
