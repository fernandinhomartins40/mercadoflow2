package com.pdv2cloud.repository;

import com.pdv2cloud.model.entity.AiInterpretation;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AiInterpretationRepository extends JpaRepository<AiInterpretation, UUID> {

    /** O cache: mesmo mercado, mesma tarefa, mesmos números = mesmo texto. */
    Optional<AiInterpretation> findByMarketIdAndTaskAndContextHash(
        UUID marketId, String task, String contextHash);

    @Query("select i from AiInterpretation i where i.market.id = :marketId "
        + "and i.subjectType = :subjectType and i.subjectId in :subjectIds")
    List<AiInterpretation> findBySubjects(
        @Param("marketId") UUID marketId,
        @Param("subjectType") String subjectType,
        @Param("subjectIds") List<UUID> subjectIds
    );

    /**
     * Limpeza de interpretações órfãs.
     *
     * Quando os números de uma oportunidade mudam, a interpretação antiga
     * deixa de ser alcançável pelo hash novo e ficaria no banco para sempre.
     */
    @Modifying
    @Query("delete from AiInterpretation i where i.market.id = :marketId "
        + "and i.createdAt < :before")
    int deleteOlderThan(@Param("marketId") UUID marketId, @Param("before") LocalDateTime before);

    /**
     * Apaga os textos do sistema guardados quando a IA falhou.
     *
     * Chamado quando o mercado cadastra ou reativa uma chave: a próxima rodada
     * precisa tentar a IA de novo para esses números, em vez de reaproveitar o
     * texto de quando não havia chave que funcionasse.
     */
    @Modifying
    @Query("delete from AiInterpretation i where i.market.id = :marketId "
        + "and i.deterministic = true")
    int deleteDeterministic(@Param("marketId") UUID marketId);
}
