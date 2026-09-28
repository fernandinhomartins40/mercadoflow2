package com.pdv2cloud.controller;

import com.pdv2cloud.service.art.ArtStudioService;
import java.time.Duration;
import org.springframework.context.annotation.Profile;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Página de ofertas que o mercado manda no WhatsApp: abre sem login. */
@Profile("!jobs")
@RestController
@RequestMapping("/api/v1/public/encartes")
public class PublicArtController {

    private final ArtStudioService studio;

    public PublicArtController(ArtStudioService studio) {
        this.studio = studio;
    }

    @GetMapping("/{slug}")
    public ResponseEntity<ArtStudioService.PublicCampaign> get(@PathVariable String slug) {
        return ResponseEntity.ok()
            .cacheControl(CacheControl.maxAge(Duration.ofMinutes(2)).cachePublic())
            .body(studio.publicCampaign(slug));
    }
}
