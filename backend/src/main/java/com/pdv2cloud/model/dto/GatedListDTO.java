package com.pdv2cloud.model.dto;

import com.pdv2cloud.model.entity.PlanType;
import com.pdv2cloud.service.PlanService;
import java.util.List;

/**
 * Lista de inteligência já recortada pelo plano do mercado.
 *
 * O plano gratuito enxerga o produto inteiro, mas só os primeiros itens de cada
 * lista. Devolver {@code totalAvailable} e {@code hiddenCount} junto com os
 * dados é deliberado: a UI mostra exatamente quantos itens existem além do
 * recorte, que é o gatilho de upgrade mais honesto e mais eficaz — o usuário vê
 * o valor que está perdendo em vez de encontrar uma parede.
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
