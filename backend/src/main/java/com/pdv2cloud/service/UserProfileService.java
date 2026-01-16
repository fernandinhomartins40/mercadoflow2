package com.pdv2cloud.service;

import com.pdv2cloud.model.dto.MeResponse;
import com.pdv2cloud.model.entity.User;
import com.pdv2cloud.repository.UserRepository;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class UserProfileService {

    @Autowired
    private UserRepository userRepository;

    public MeResponse getProfile(String email) {
        User user = userRepository.findByEmail(email).orElseThrow();
        UUID marketId = user.getMarket() != null ? user.getMarket().getId() : null;
        return new MeResponse(user.getId(), user.getEmail(), user.getName(), user.getRole().name(), marketId);
    }
}
