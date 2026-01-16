package com.pdv2cloud.controller;

import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.repository.UserRepository;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/admin")
@PreAuthorize("hasRole('ADMIN')")
public class AdminController {

    @Autowired
    private MarketRepository marketRepository;

    @Autowired
    private UserRepository userRepository;

    @GetMapping("/stats")
    public ResponseEntity<Map<String, Object>> stats() {
        long markets = marketRepository.count();
        long users = userRepository.count();
        return ResponseEntity.ok(Map.of("markets", markets, "users", users));
    }
}
