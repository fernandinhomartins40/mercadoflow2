package com.pdv2cloud.controller;

import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HealthController {

    @GetMapping("/health")
    public ResponseEntity<Map<String, String>> health() {
        return ResponseEntity.ok(Map.of("status", "ok"));
    }

    @GetMapping("/api/v1/health")
    public ResponseEntity<Map<String, String>> apiHealth() {
        return ResponseEntity.ok(Map.of("status", "ok"));
    }
}
