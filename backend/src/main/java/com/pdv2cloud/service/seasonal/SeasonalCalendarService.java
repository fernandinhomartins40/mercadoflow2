package com.pdv2cloud.service.seasonal;

import com.pdv2cloud.util.BrazilianHolidays;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.List;
import org.springframework.stereotype.Service;

/**
 * Calendário comercial sazonal do Mercadoflow.
 *
 * Extraído do AdvancedAnalyticsService (que passava de 1.800 linhas) por ser um
 * bloco autocontido: só depende do calendário, nunca do banco.
 *
 * Mantém DUAS listas de janelas, deliberadamente:
 *
 *  - {@link #resolveDisplayWindows} — coleções para EXIBIR no cockpit. Janelas
 *    estreitas centradas no evento, com estado CURRENT/UPCOMING/RECENT, para
 *    responder "o que devo destacar agora?".
 *  - {@link #measurementWindows} — janelas para MEDIR desempenho histórico do
 *    produto. Mais largas, porque precisam capturar todo o volume da temporada
 *    (inclusive a antecipação de compra) e compará-lo com o baseline anual.
 *
 * Não são duplicatas: unificá-las degradaria uma das duas funções — ou o anúncio
 * do evento fica impreciso, ou a medição perde volume.
 *
 * Páscoa e Carnaval são datas MÓVEIS e por isso ancoradas em
 * {@link BrazilianHolidays}, não em (mês, dia) fixos: o Carnaval cai em fevereiro
 * na maioria dos anos, mas em março quando a Páscoa é tardia (2025: 04/03).
 */
@Service
public class SeasonalCalendarService {

    private static final DateTimeFormatter PT_BR = DateTimeFormatter.ofPattern("dd/MM/yyyy");

    /** Quantas coleções sazonais o cockpit exibe por vez. */
    private static final int MAX_DISPLAY_WINDOWS = 3;

    /** Âncora de uma janela cuja data muda a cada ano. */
    public enum MovableAnchor {
        EASTER,
        CARNIVAL
    }

    // ── Janelas de exibição (cockpit) ────────────────────────────────────────

    private static final List<SeasonalTemplate> DISPLAY_TEMPLATES = List.of(
        new SeasonalTemplate("volta-aulas", "Volta às aulas", "Itens que costumam acelerar com a retomada escolar.", 1, 10, 2, 20),
        new SeasonalTemplate("carnaval", "Carnaval", "Bebidas e itens de festa que sobem no período carnavalesco.", MovableAnchor.CARNIVAL, 10, 1),
        new SeasonalTemplate("pascoa", "Páscoa", "Itens que ganham força no período pascal.", MovableAnchor.EASTER, 21, 1),
        new SeasonalTemplate("festa-junina", "Festa Junina", "Produtos que sobem com o calendário junino.", 6, 1, 6, 30),
        new SeasonalTemplate("dia-criancas", "Dia das Crianças", "Itens que reagem melhor no calendário de outubro.", 9, 25, 10, 12),
        new SeasonalTemplate("natal", "Natal", "Itens que puxam a venda no pico de dezembro.", 12, 1, 12, 25),
        new SeasonalTemplate("ano-novo", "Ano Novo", "Produtos fortes na virada e no abastecimento imediato.", 12, 26, 1, 5)
    );

    // ── Janelas de medição (desempenho do produto) ───────────────────────────

    private static final List<MeasurementWindow> MEASUREMENT_WINDOWS = List.of(
        new MeasurementWindow("natal",        "Natal",           12,  1, 12, 31),
        // Janelas ancoradas na data móvel do ano, com a mesma largura das
        // versões fixas que substituíram (~60 e ~28 dias).
        new MeasurementWindow("pascoa",       "Páscoa",          MovableAnchor.EASTER,   45, 15),
        new MeasurementWindow("carnaval",     "Carnaval",        MovableAnchor.CARNIVAL, 21,  7),
        new MeasurementWindow("dia_maes",     "Dia das Mães",     5,  1,  5, 31),
        new MeasurementWindow("dia_pais",     "Dia dos Pais",     8,  1,  8, 31),
        new MeasurementWindow("dia_criancas", "Dia das Crianças",10,  1, 10, 31),
        new MeasurementWindow("black_friday", "Black Friday",    11, 20, 11, 30),
        new MeasurementWindow("ferias_jul",   "Férias Julho",     7,  1,  7, 31),
        new MeasurementWindow("ferias_jan",   "Férias Janeiro",   1,  1,  1, 31)
    );

    /** Janelas de medição de desempenho sazonal do produto. */
    public List<MeasurementWindow> measurementWindows() {
        return MEASUREMENT_WINDOWS;
    }

    /**
     * As coleções sazonais mais relevantes para a data de referência, ordenadas
     * por prioridade (em andamento primeiro) e proximidade.
     */
    public List<SeasonalWindow> resolveDisplayWindows(LocalDate referenceDate) {
        return DISPLAY_TEMPLATES.stream()
            .map(template -> resolveWindow(template, referenceDate))
            .sorted(Comparator.comparingInt(SeasonalWindow::priority)
                .thenComparingLong(SeasonalWindow::distanceDays))
            .limit(MAX_DISPLAY_WINDOWS)
            .toList();
    }

    /**
     * Resolve o estado de uma janela em relação à data de referência.
     *
     * Considera três ocorrências (ano anterior, atual e seguinte) porque janelas
     * que cruzam o ano — Ano Novo, por exemplo — precisam ser encontradas tanto
     * olhando para trás quanto para a frente.
     */
    private SeasonalWindow resolveWindow(SeasonalTemplate template, LocalDate referenceDate) {
        List<SeasonalOccurrence> occurrences = List.of(
            createOccurrence(template, referenceDate.getYear() - 1),
            createOccurrence(template, referenceDate.getYear()),
            createOccurrence(template, referenceDate.getYear() + 1)
        );

        SeasonalOccurrence active = occurrences.stream()
            .filter(o -> !referenceDate.isBefore(o.start()) && !referenceDate.isAfter(o.end()))
            .findFirst()
            .orElse(null);

        SeasonalOccurrence previous = occurrences.stream()
            .filter(o -> o.end().isBefore(referenceDate))
            .max(Comparator.comparing(SeasonalOccurrence::end))
            .orElse(null);

        SeasonalOccurrence next = occurrences.stream()
            .filter(o -> o.start().isAfter(referenceDate))
            .min(Comparator.comparing(SeasonalOccurrence::start))
            .orElse(null);

        SeasonalOccurrence displayOccurrence;
        String status;
        String proximityLabel;
        int priority;
        long distanceDays;

        if (active != null) {
            displayOccurrence = active;
            status = "CURRENT";
            distanceDays = Math.max(0L, ChronoUnit.DAYS.between(referenceDate, active.end()));
            proximityLabel = distanceDays <= 1 ? "Acontecendo agora" : "Em andamento";
            priority = 0;
        } else if (previous == null
                   || (next != null && ChronoUnit.DAYS.between(referenceDate, next.start())
                                       <= ChronoUnit.DAYS.between(previous.end(), referenceDate))) {
            displayOccurrence = next != null ? next : previous;
            distanceDays = displayOccurrence != null
                ? Math.max(0L, ChronoUnit.DAYS.between(referenceDate, displayOccurrence.start()))
                : Long.MAX_VALUE;
            status = "UPCOMING";
            proximityLabel = distanceDays == 0 ? "Começa hoje"
                : distanceDays == 1 ? "Começa amanhã"
                : "Começa em " + distanceDays + " dias";
            priority = 1;
        } else {
            displayOccurrence = previous;
            distanceDays = Math.max(0L, ChronoUnit.DAYS.between(previous.end(), referenceDate));
            status = "RECENT";
            proximityLabel = distanceDays == 1 ? "Terminou ontem" : "Terminou há " + distanceDays + " dias";
            priority = 2;
        }

        // A janela ANALISADA é sempre um ciclo já concluído: comparar contra uma
        // temporada em andamento daria números parciais.
        SeasonalOccurrence analysisOccurrence = ("RECENT".equals(status) || (active == null && next == null))
            ? displayOccurrence
            : previous != null ? previous : displayOccurrence;

        return new SeasonalWindow(
            template.key(),
            template.title(),
            template.subtitle(),
            analysisOccurrence.start(),
            analysisOccurrence.end(),
            formatPeriodLabel(analysisOccurrence.start(), analysisOccurrence.end()),
            proximityLabel,
            status,
            priority,
            distanceDays
        );
    }

    private SeasonalOccurrence createOccurrence(SeasonalTemplate template, int startYear) {
        if (template.movable()) {
            LocalDate anchor = anchorDate(template.anchor(), startYear);
            return new SeasonalOccurrence(
                anchor.minusDays(template.daysBefore()),
                anchor.plusDays(template.daysAfter())
            );
        }
        LocalDate start = LocalDate.of(startYear, template.startMonth(), template.startDay());
        int endYear = template.crossYear() ? startYear + 1 : startYear;
        LocalDate end = LocalDate.of(endYear, template.endMonth(), template.endDay());
        return new SeasonalOccurrence(start, end);
    }

    static LocalDate anchorDate(MovableAnchor anchor, int year) {
        return switch (anchor) {
            case EASTER -> BrazilianHolidays.easterSunday(year);
            case CARNIVAL -> BrazilianHolidays.carnivalTuesday(year);
        };
    }

    public String formatPeriodLabel(LocalDate start, LocalDate end) {
        return start.format(PT_BR) + " a " + end.format(PT_BR);
    }

    // ── Tipos ────────────────────────────────────────────────────────────────

    private record SeasonalOccurrence(LocalDate start, LocalDate end) {
    }

    private record SeasonalTemplate(
        String key,
        String title,
        String subtitle,
        int startMonth,
        int startDay,
        int endMonth,
        int endDay,
        MovableAnchor anchor,
        int daysBefore,
        int daysAfter
    ) {
        /** Janela de datas fixas (Natal, Festa Junina, Volta às aulas...). */
        SeasonalTemplate(String key, String title, String subtitle,
                         int startMonth, int startDay, int endMonth, int endDay) {
            this(key, title, subtitle, startMonth, startDay, endMonth, endDay, null, 0, 0);
        }

        /** Janela ancorada numa data móvel (Páscoa, Carnaval). */
        SeasonalTemplate(String key, String title, String subtitle,
                         MovableAnchor anchor, int daysBefore, int daysAfter) {
            this(key, title, subtitle, 0, 0, 0, 0, anchor, daysBefore, daysAfter);
        }

        boolean movable() {
            return anchor != null;
        }

        boolean crossYear() {
            return !movable()
                && (endMonth < startMonth || (endMonth == startMonth && endDay < startDay));
        }
    }

    /** Janela sazonal resolvida para uma data de referência. */
    public record SeasonalWindow(
        String key,
        String title,
        String subtitle,
        LocalDate analysisStart,
        LocalDate analysisEnd,
        String periodLabel,
        String proximityLabel,
        String status,
        int priority,
        long distanceDays
    ) {
    }

    /**
     * Janela usada para MEDIR desempenho sazonal do produto — mais larga que a
     * janela de exibição, para capturar todo o volume da temporada.
     */
    public record MeasurementWindow(
        String key,
        String title,
        int monthStart, int dayStart,
        int monthEnd, int dayEnd,
        MovableAnchor anchor,
        int daysBefore, int daysAfter
    ) {
        MeasurementWindow(String key, String title,
                          int monthStart, int dayStart, int monthEnd, int dayEnd) {
            this(key, title, monthStart, dayStart, monthEnd, dayEnd, null, 0, 0);
        }

        MeasurementWindow(String key, String title,
                          MovableAnchor anchor, int daysBefore, int daysAfter) {
            this(key, title, 0, 0, 0, 0, anchor, daysBefore, daysAfter);
        }

        public boolean movable() {
            return anchor != null;
        }

        public LocalDate start(int year) {
            return movable()
                ? anchorDate(anchor, year).minusDays(daysBefore)
                : LocalDate.of(year, monthStart, dayStart);
        }

        public LocalDate end(int year) {
            return movable()
                ? anchorDate(anchor, year).plusDays(daysAfter)
                : LocalDate.of(year, monthEnd, dayEnd);
        }
    }
}
