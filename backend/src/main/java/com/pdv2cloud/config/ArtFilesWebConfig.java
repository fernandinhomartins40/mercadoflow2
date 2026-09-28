package com.pdv2cloud.config;

import com.pdv2cloud.service.art.ArtFileStorage;
import java.time.Duration;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.http.CacheControl;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/** Serve os arquivos do estúdio de encartes. Nomes são UUID e nunca mudam: cache longo. */
@Configuration
@Profile("!jobs")
public class ArtFilesWebConfig implements WebMvcConfigurer {

    private final ArtFileStorage storage;

    public ArtFilesWebConfig(ArtFileStorage storage) {
        this.storage = storage;
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        String location = storage.root().toUri().toString();
        if (!location.endsWith("/")) {
            location = location + "/";
        }
        registry.addResourceHandler(ArtFileStorage.PUBLIC_PREFIX + "**")
            .addResourceLocations(location)
            .setCacheControl(CacheControl.maxAge(Duration.ofDays(30)).cachePublic());
    }
}
