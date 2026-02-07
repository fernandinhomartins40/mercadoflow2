package com.pdv2cloud.util;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.Date;

public class DateUtils {
    public static LocalDateTime fromDate(Date date) {
        return LocalDateTime.ofInstant(date.toInstant(), ZoneId.systemDefault());
    }

    public static LocalDateTime parseFlexible(String value) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("dataEmissao is required");
        }
        String trimmed = value.trim();
        try {
            return OffsetDateTime.parse(trimmed).toLocalDateTime();
        } catch (Exception ignored) {
        }
        try {
            return LocalDateTime.parse(trimmed);
        } catch (Exception ignored) {
        }
        try {
            return LocalDate.parse(trimmed).atStartOfDay();
        } catch (Exception ignored) {
        }
        throw new IllegalArgumentException("Invalid dataEmissao: " + value);
    }
}
