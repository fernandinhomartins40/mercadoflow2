package com.pdv2cloud.controller;

import com.pdv2cloud.service.MarketAccessService;
import com.pdv2cloud.service.art.ArtImageProxy;
import com.pdv2cloud.service.art.ArtStudioService;
import com.pdv2cloud.service.art.ArtThemeService;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.context.annotation.Profile;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/** Estúdio de encartes do mercado: temas publicados, marca, produtos, campanhas. */
@Profile("!jobs")
@RestController
@RequestMapping("/api/v1/markets/{marketId}/art")
@PreAuthorize("hasAnyRole('MARKET_OWNER', 'MARKET_MANAGER', 'ADMIN')")
public class ArtStudioController {

    private final ArtStudioService studio;
    private final ArtThemeService themes;
    private final ArtImageProxy imageProxy;
    private final MarketAccessService access;

    public ArtStudioController(ArtStudioService studio, ArtThemeService themes, ArtImageProxy imageProxy,
                               MarketAccessService access) {
        this.studio = studio;
        this.themes = themes;
        this.imageProxy = imageProxy;
        this.access = access;
    }

    @GetMapping("/themes")
    public List<ArtThemeService.Theme> themes(@PathVariable UUID marketId, Authentication auth) {
        access.assertCanAccessMarket(marketId, auth);
        return themes.list(true);
    }

    @GetMapping("/brand")
    public ArtStudioService.Brand brand(@PathVariable UUID marketId, Authentication auth) {
        access.assertCanAccessMarket(marketId, auth);
        return studio.brand(marketId);
    }

    @PutMapping("/brand")
    public ArtStudioService.Brand saveBrand(@PathVariable UUID marketId, @RequestBody Map<String, Object> body,
                                            Authentication auth) {
        access.assertCanAccessMarket(marketId, auth);
        return studio.saveBrand(marketId, body);
    }

    @PostMapping(value = "/brand/logo", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ArtStudioService.Brand uploadLogo(@PathVariable UUID marketId, @RequestParam("file") MultipartFile file,
                                             Authentication auth) {
        access.assertCanAccessMarket(marketId, auth);
        return studio.uploadLogo(marketId, file);
    }

    @DeleteMapping("/brand/logo")
    public ArtStudioService.Brand removeLogo(@PathVariable UUID marketId, Authentication auth) {
        access.assertCanAccessMarket(marketId, auth);
        return studio.removeLogo(marketId);
    }

    @GetMapping("/products")
    public List<ArtStudioService.ArtProduct> products(@PathVariable UUID marketId, @RequestParam String q,
                                                      Authentication auth) {
        access.assertCanAccessMarket(marketId, auth);
        return studio.searchProducts(marketId, q);
    }

    @GetMapping("/suggestions")
    public List<ArtStudioService.SuggestionGroup> suggestions(@PathVariable UUID marketId, Authentication auth) {
        access.assertCanAccessMarket(marketId, auth);
        return studio.suggestions(marketId);
    }

    @GetMapping("/image")
    public ResponseEntity<byte[]> image(@PathVariable UUID marketId, @RequestParam String url, Authentication auth) {
        access.assertCanAccessMarket(marketId, auth);
        ArtImageProxy.Image image = imageProxy.fetch(url);
        return ResponseEntity.ok()
            .contentType(MediaType.parseMediaType(image.contentType()))
            .cacheControl(CacheControl.maxAge(Duration.ofDays(1)).cachePrivate())
            .header("X-Content-Type-Options", "nosniff")
            .body(image.bytes());
    }

    @GetMapping("/campaigns")
    public List<ArtStudioService.Campaign> campaigns(@PathVariable UUID marketId, Authentication auth) {
        access.assertCanAccessMarket(marketId, auth);
        return studio.campaigns(marketId);
    }

    @PostMapping("/campaigns")
    public ArtStudioService.Campaign create(@PathVariable UUID marketId, @RequestBody Map<String, Object> body,
                                            Authentication auth) {
        access.assertCanAccessMarket(marketId, auth);
        return studio.createCampaign(marketId, body);
    }

    @GetMapping("/campaigns/{id}")
    public ArtStudioService.Campaign campaign(@PathVariable UUID marketId, @PathVariable UUID id, Authentication auth) {
        access.assertCanAccessMarket(marketId, auth);
        return studio.campaign(marketId, id);
    }

    @PutMapping("/campaigns/{id}")
    public ArtStudioService.Campaign save(@PathVariable UUID marketId, @PathVariable UUID id,
                                          @RequestBody Map<String, Object> body, Authentication auth) {
        access.assertCanAccessMarket(marketId, auth);
        return studio.saveCampaign(marketId, id, body);
    }

    @PostMapping("/campaigns/{id}/duplicate")
    public ArtStudioService.Campaign duplicate(@PathVariable UUID marketId, @PathVariable UUID id, Authentication auth) {
        access.assertCanAccessMarket(marketId, auth);
        return studio.duplicateCampaign(marketId, id);
    }

    @DeleteMapping("/campaigns/{id}")
    public ResponseEntity<Void> delete(@PathVariable UUID marketId, @PathVariable UUID id, Authentication auth) {
        access.assertCanAccessMarket(marketId, auth);
        studio.deleteCampaign(marketId, id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping(value = "/campaigns/{id}/publish", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ArtStudioService.Campaign publish(@PathVariable UUID marketId, @PathVariable UUID id,
                                             @RequestParam("files") List<MultipartFile> files,
                                             @RequestParam("formats") List<String> formats, Authentication auth) {
        access.assertCanAccessMarket(marketId, auth);
        return studio.publish(marketId, id, files, formats);
    }

    @PostMapping("/campaigns/{id}/unpublish")
    public ArtStudioService.Campaign unpublish(@PathVariable UUID marketId, @PathVariable UUID id, Authentication auth) {
        access.assertCanAccessMarket(marketId, auth);
        return studio.unpublish(marketId, id);
    }
}
