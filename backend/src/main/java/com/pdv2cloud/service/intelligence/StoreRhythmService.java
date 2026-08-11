package com.pdv2cloud.service.intelligence;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Ritmo de movimento de cada loja, e a cadência de análise que dele decorre.
 *
 * POR QUE ISTO EXISTE: o agente entrega a nota em segundos, mas a inteligência
 * rodava uma vez por dia. O supermercadista atende fornecedor pela manhã
 * decidindo com números de 03:00 — antes de fechar o caixa da noite anterior.
 *
 * E um intervalo FIXO igual para todos seria a única coisa no sistema a ignorar
 * que cada loja é diferente. ABC, z-score e turnover band são todos relativos ao
 * próprio portfólio, justamente porque duas lojas da mesma rede têm produtos,
 * clientes e horários distintos. O ritmo da análise segue a mesma regra:
 *
 *   um mercado de bairro com pico às 18h e um atacadista com pico às 8h
 *   recebem cadências opostas no mesmo horário — e é isso que está certo.
 *
 * O pico é definido pelo índice sazonal horário DA PRÓPRIA LOJA (materializado
 * pelo ProductIntelligenceMaterializer), nunca por uma faixa de horário global.
 */
@Service
public class StoreRhythmService {

    /** Cadência nas horas de pico: o estoque muda rápido e o erro custa mais. */
    private static final int PEAK_INTERVAL_MINUTES = 10;

    /** Cadência normal: frescura suficiente sem gastar à toa. */
    private static final int NORMAL_INTERVAL_MINUTES = 30;

    /** Cadência em hora fraca: ainda atualiza, mas sem pressa. */
    private static final int OFFPEAK_INTERVAL_MINUTES = 60;

    /**
     * Loja sem nota nova: não há o que recalcular.
     *
     * O intervalo longo aqui não é para recalcular — é só quando voltar a
     * perguntar se apareceu movimento. Custo praticamente zero.
     */
    private static final int IDLE_INTERVAL_MINUTES = 60;

    /** Acima deste índice a hora conta como pico daquela loja. */
    private static final double PEAK_INDEX_THRESHOLD = 1.30;

    /** Abaixo deste índice a hora é fraca para aquela loja. */
    private static final double OFFPEAK_INDEX_THRESHOLD = 0.60;

    /**
     * Mínimo de horas com índice para confiar no perfil.
     *
     * Com 3 ou 4 horas mapeadas, "esta é a hora de pico" é chute. Sem perfil
     * confiável, a loja recebe a cadência normal — que é o comportamento
     * seguro, não um degrade.
     */
    private static final int MIN_HOURS_FOR_PROFILE = 8;

    private final NamedParameterJdbcTemplate jdbcTemplate;

    public StoreRhythmService(NamedParameterJdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    /** Classificação do momento atual da loja. */
    public enum Rhythm {
        /** Hora de maior movimento desta loja. */
        PICO,
        /** Movimento dentro da média desta loja. */
        NORMAL,
        /** Hora fraca desta loja. */
        VALE,
        /** Sem venda nova desde a última rodada. */
        OCIOSA
    }

    /**
     * Decide o ritmo atual e o intervalo até o próximo ciclo.
     *
     * @param hasNewSales se apareceu nota nova desde a última rodada
     */
    @Transactional(readOnly = true)
    public RhythmDecision decide(UUID marketId, boolean hasNewSales) {
        if (!hasNewSales) {
            return new RhythmDecision(
                Rhythm.OCIOSA, IDLE_INTERVAL_MINUTES,
                "Sem venda nova desde a última verificação — nada a recalcular.");
        }

        HourProfile profile = hourProfile(marketId, LocalDateTime.now().getHour());

        if (!profile.reliable()) {
            return new RhythmDecision(
                Rhythm.NORMAL, NORMAL_INTERVAL_MINUTES,
                "Perfil de movimento ainda em formação; usando cadência padrão.");
        }

        double index = profile.currentIndex();
        if (index >= PEAK_INDEX_THRESHOLD) {
            return new RhythmDecision(
                Rhythm.PICO, PEAK_INTERVAL_MINUTES,
                String.format(
                    "Hora de pico desta loja (movimento %.0f%% acima da média): atualizando a cada %d min.",
                    (index - 1) * 100, PEAK_INTERVAL_MINUTES));
        }
        if (index <= OFFPEAK_INDEX_THRESHOLD) {
            return new RhythmDecision(
                Rhythm.VALE, OFFPEAK_INTERVAL_MINUTES,
                String.format(
                    "Hora de movimento fraco (%.0f%% da média): atualizando a cada %d min.",
                    index * 100, OFFPEAK_INTERVAL_MINUTES));
        }
        return new RhythmDecision(
            Rhythm.NORMAL, NORMAL_INTERVAL_MINUTES,
            String.format("Movimento na média da loja: atualizando a cada %d min.",
                NORMAL_INTERVAL_MINUTES));
    }

    /**
     * Índice de movimento da loja na hora informada.
     *
     * Soma o índice sazonal horário de todos os produtos e normaliza pela média
     * das horas mapeadas — o resultado é "esta hora vende quanto, relativo ao
     * que esta loja costuma vender".
     */
    @Transactional(readOnly = true)
    public HourProfile hourProfile(UUID marketId, int hourOfDay) {
        MapSqlParameterSource params = new MapSqlParameterSource("marketId", marketId)
            .addValue("hour", hourOfDay);

        String sql =
            "with per_hour as ( " +
            "  select period_index as hour_of_day, " +
            "         sum(seasonal_index * observations) / nullif(sum(observations), 0) as weighted_index " +
            "  from product_seasonality " +
            "  where market_id = :marketId and period_type = 'HOUR' " +
            "  group by period_index " +
            "), " +
            "stats as (select avg(weighted_index) as avg_index, count(*) as hours_mapped from per_hour) " +
            "select s.hours_mapped, " +
            "       case when s.avg_index > 0 " +
            "            then coalesce(h.weighted_index, 0) / s.avg_index else 1 end as current_index " +
            "from stats s left join per_hour h on h.hour_of_day = :hour";

        final double[] values = { 1.0 };
        final int[] hoursMapped = { 0 };
        jdbcTemplate.query(sql, params, rs -> {
            hoursMapped[0] = rs.getInt("hours_mapped");
            values[0] = rs.getDouble("current_index");
        });

        return new HourProfile(
            hourOfDay,
            BigDecimal.valueOf(values[0]).setScale(4, RoundingMode.HALF_UP).doubleValue(),
            hoursMapped[0],
            hoursMapped[0] >= MIN_HOURS_FOR_PROFILE
        );
    }

    /**
     * Perfil completo de movimento por hora — o insight que o lojista
     * provavelmente não tem sobre a própria loja.
     */
    @Transactional(readOnly = true)
    public List<HourlyMovement> dailyProfile(UUID marketId) {
        MapSqlParameterSource params = new MapSqlParameterSource("marketId", marketId);

        String sql =
            "with per_hour as ( " +
            "  select period_index as hour_of_day, " +
            "         sum(seasonal_index * observations) / nullif(sum(observations), 0) as weighted_index, " +
            "         sum(observations) as observations " +
            "  from product_seasonality " +
            "  where market_id = :marketId and period_type = 'HOUR' " +
            "  group by period_index " +
            "), " +
            "stats as (select avg(weighted_index) as avg_index from per_hour) " +
            "select h.hour_of_day, h.observations, " +
            "       case when s.avg_index > 0 then h.weighted_index / s.avg_index else 1 end as rel_index " +
            "from per_hour h cross join stats s " +
            "order by h.hour_of_day";

        List<HourlyMovement> out = new ArrayList<>();
        jdbcTemplate.query(sql, params, rs -> {
            double relIndex = rs.getDouble("rel_index");
            out.add(new HourlyMovement(
                rs.getInt("hour_of_day"),
                BigDecimal.valueOf(relIndex).setScale(2, RoundingMode.HALF_UP),
                rs.getLong("observations"),
                relIndex >= PEAK_INDEX_THRESHOLD ? Rhythm.PICO
                    : relIndex <= OFFPEAK_INDEX_THRESHOLD ? Rhythm.VALE
                    : Rhythm.NORMAL
            ));
        });
        return out;
    }

    /**
     * Resumo em linguagem de negócio: as horas de pico da loja.
     *
     * Serve à Central — saber que o movimento concentra das 17h às 20h muda
     * escala de equipe, hora de reposição de prateleira e janela de promoção.
     */
    @Transactional(readOnly = true)
    public String describePeakHours(UUID marketId) {
        List<HourlyMovement> profile = dailyProfile(marketId);
        if (profile.size() < MIN_HOURS_FOR_PROFILE) {
            return "Ainda não há histórico suficiente para identificar o horário de pico desta loja.";
        }

        List<Integer> peaks = profile.stream()
            .filter(h -> h.rhythm() == Rhythm.PICO)
            .map(HourlyMovement::hour)
            .toList();

        if (peaks.isEmpty()) {
            return "O movimento desta loja é distribuído ao longo do dia, sem hora de pico marcada.";
        }

        String horas = peaks.stream().map(h -> String.format("%02dh", h)).reduce((a, b) -> a + ", " + b).orElse("");
        return String.format(
            "O movimento desta loja concentra em %s. A análise atualiza a cada %d minutos nesses "
                + "horários e a cada %d minutos no resto do dia.",
            horas, PEAK_INTERVAL_MINUTES, NORMAL_INTERVAL_MINUTES);
    }

    // ── Tipos ────────────────────────────────────────────────────────────────

    public record RhythmDecision(Rhythm rhythm, int intervalMinutes, String reason) {}

    /**
     * @param reliable false quando há poucas horas mapeadas — nesse caso o
     *                 índice não deve governar decisão nenhuma
     */
    public record HourProfile(int hour, double currentIndex, int hoursMapped, boolean reliable) {}

    public record HourlyMovement(int hour, BigDecimal relativeIndex, long observations, Rhythm rhythm) {}
}
