package com.pdv2cloud.util;

import java.time.LocalDate;

/**
 * Datas móveis do calendário comercial brasileiro.
 *
 * Páscoa, Carnaval e Corpus Christi mudam de dia (e às vezes de mês) a cada ano,
 * então não podem ser representadas como (mês, dia) fixos. O caso que mais dói no
 * varejo é o Carnaval: cai em fevereiro na maioria dos anos, mas em março quando
 * a Páscoa é tardia (2025: 04/03; 2024: 13/02). Uma janela fixa em fevereiro
 * simplesmente não enxerga o Carnaval de 2025.
 *
 * Todas as demais datas do calendário (Natal, Black Friday, Dia das Mães) são
 * fixas ou de regra simples e continuam declaradas diretamente onde são usadas.
 */
public final class BrazilianHolidays {

    private BrazilianHolidays() {
    }

    /**
     * Domingo de Páscoa pelo algoritmo de Meeus/Jones/Butcher (calendário gregoriano).
     *
     * Válido para qualquer ano do calendário gregoriano; é aritmética inteira pura,
     * sem tabelas. Referência: Jean Meeus, "Astronomical Algorithms", cap. 8.
     */
    public static LocalDate easterSunday(int year) {
        int a = year % 19;
        int b = year / 100;
        int c = year % 100;
        int d = b / 4;
        int e = b % 4;
        int f = (b + 8) / 25;
        int g = (b - f + 1) / 3;
        int h = (19 * a + b - d - g + 15) % 30;
        int i = c / 4;
        int k = c % 4;
        int l = (32 + 2 * e + 2 * i - h - k) % 7;
        int m = (a + 11 * h + 22 * l) / 451;
        int month = (h + l - 7 * m + 114) / 31;
        int day = ((h + l - 7 * m + 114) % 31) + 1;
        return LocalDate.of(year, month, day);
    }

    /** Terça-feira de Carnaval: 47 dias antes da Páscoa. */
    public static LocalDate carnivalTuesday(int year) {
        return easterSunday(year).minusDays(47);
    }

    /** Quarta-feira de Cinzas: 46 dias antes da Páscoa (fim do feriado de Carnaval). */
    public static LocalDate ashWednesday(int year) {
        return easterSunday(year).minusDays(46);
    }

    /** Corpus Christi: 60 dias depois da Páscoa. */
    public static LocalDate corpusChristi(int year) {
        return easterSunday(year).plusDays(60);
    }
}
