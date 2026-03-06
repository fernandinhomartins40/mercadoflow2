package com.pdv2cloud.config;

import java.time.Duration;
import java.nio.file.Path;
import java.nio.file.Paths;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.CacheControl;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class CatalogImageWebConfig implements WebMvcConfigurer {

    @Value("${app.catalog.images-dir:../data/catalog/images}")
    private String catalogImagesDir;

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        Path imagesPath = Paths.get(catalogImagesDir).toAbsolutePath().normalize();
        String location = imagesPath.toUri().toString();
        if (!location.endsWith("/")) {
            location = location + "/";
        }

        registry.addResourceHandler("/api/v1/catalog/images/**")
            .addResourceLocations(location)
            .setCacheControl(CacheControl.maxAge(Duration.ofHours(12)).cachePublic());
    }
}
