package com.pdv2cloud.config;

import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.CacheControl;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class OfferRenderWebConfig implements WebMvcConfigurer {

    @Value("${app.offers.outputs-dir:../data/offers}")
    private String offerOutputsDir;

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        Path outputsPath = Paths.get(offerOutputsDir).toAbsolutePath().normalize();
        String location = outputsPath.toUri().toString();
        if (!location.endsWith("/")) {
            location = location + "/";
        }

        registry.addResourceHandler("/api/v1/generated/offers/**")
            .addResourceLocations(location)
            .setCacheControl(CacheControl.maxAge(Duration.ofHours(6)).cachePublic());
    }
}
