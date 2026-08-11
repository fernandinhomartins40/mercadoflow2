package com.pdv2cloud.repository;

import com.pdv2cloud.model.entity.AiProviderCredential;
import com.pdv2cloud.service.ai.AiProvider;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AiProviderCredentialRepository
    extends JpaRepository<AiProviderCredential, UUID> {

    /**
     * A cadeia de fallback do mercado, na ordem em que deve ser tentada.
     *
     * O desempate por provider mantém a ordem estável quando o usuário deixa
     * todas as prioridades no padrão — sem isso, a cadeia poderia mudar entre
     * duas execuções e tornar o diagnóstico confuso.
     */
    @Query("select c from AiProviderCredential c "
        + "where c.market.id = :marketId and c.enabled = true "
        + "order by c.priority asc, c.provider asc")
    List<AiProviderCredential> findChain(@Param("marketId") UUID marketId);

    @Query("select c from AiProviderCredential c where c.market.id = :marketId "
        + "order by c.priority asc, c.provider asc")
    List<AiProviderCredential> findAllByMarket(@Param("marketId") UUID marketId);

    Optional<AiProviderCredential> findByMarketIdAndProvider(UUID marketId, AiProvider provider);

    Optional<AiProviderCredential> findByIdAndMarketId(UUID id, UUID marketId);

    boolean existsByMarketIdAndEnabledTrue(UUID marketId);
}
