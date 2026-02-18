package com.pdv2cloud.model.dto;

import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@Builder
public class ErrorResponse {
    private String error;
    private String message;
    private String userMessage;  // Friendly message for end users
    private LocalDateTime timestamp;
    private String path;

    public static ErrorResponse create(String error, String technicalMessage, String userMessage, String path) {
        return ErrorResponse.builder()
                .error(error)
                .message(technicalMessage)
                .userMessage(userMessage)
                .timestamp(LocalDateTime.now())
                .path(path)
                .build();
    }
}
