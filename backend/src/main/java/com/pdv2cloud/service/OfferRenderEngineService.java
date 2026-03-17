package com.pdv2cloud.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.zxing.WriterException;
import com.pdv2cloud.model.entity.OfferGenerationJob;
import com.pdv2cloud.model.entity.OfferRenderOutput;
import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Font;
import java.awt.FontMetrics;
import java.awt.GradientPaint;
import java.awt.Graphics2D;
import java.awt.LinearGradientPaint;
import java.awt.MultipleGradientPaint;
import java.awt.RenderingHints;
import java.awt.geom.RoundRectangle2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageOutputStream;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;

@Service
public class OfferRenderEngineService {

    private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() {};

    private final ObjectMapper objectMapper;
    private final OfferRenderStorageService offerRenderStorageService;
    private final CatalogImageStorageService catalogImageStorageService;
    private final CatalogImageUrlResolver catalogImageUrlResolver;
    private final QRCodeService qrCodeService;
    private final HttpClient httpClient;

    public OfferRenderEngineService(
        ObjectMapper objectMapper,
        OfferRenderStorageService offerRenderStorageService,
        CatalogImageStorageService catalogImageStorageService,
        CatalogImageUrlResolver catalogImageUrlResolver,
        QRCodeService qrCodeService
    ) {
        this.objectMapper = objectMapper;
        this.offerRenderStorageService = offerRenderStorageService;
        this.catalogImageStorageService = catalogImageStorageService;
        this.catalogImageUrlResolver = catalogImageUrlResolver;
        this.qrCodeService = qrCodeService;
        this.httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(20))
            .followRedirects(HttpClient.Redirect.NORMAL)
            .build();
    }

    public RenderedOutput render(OfferGenerationJob job, OfferRenderOutput output, String resolvedDesignJson) {
        Map<String, Object> resolved = parseJsonObject(resolvedDesignJson);
        Map<String, Object> canvas = asMap(resolved.get("canvas"));
        int width = clamp(intValue(canvas.get("width"), 1080), 720, 3200);
        int height = clamp(intValue(canvas.get("height"), 1350), 720, 4800);

        BufferedImage rendered = renderCanvas(resolved, width, height);
        String baseName = slugify((output.getVariantKey() == null ? "default" : output.getVariantKey()) + "-" + output.getPublishTarget() + "-" + output.getOutputType());
        String previewName = output.getId() + "-" + baseName + "-preview.png";
        Path previewPath = offerRenderStorageService.resolveJobFile(job.getId(), previewName);
        offerRenderStorageService.ensureParent(previewPath);
        writePng(rendered, previewPath);

        String outputType = normalizeText(output.getOutputType(), "PNG").toUpperCase(Locale.ROOT);
        Path outputPath;
        switch (outputType) {
            case "PDF" -> {
                outputPath = offerRenderStorageService.resolveJobFile(job.getId(), output.getId() + "-" + baseName + ".pdf");
                writePdf(rendered, outputPath);
            }
            case "JPG", "JPEG" -> {
                outputPath = offerRenderStorageService.resolveJobFile(job.getId(), output.getId() + "-" + baseName + ".jpg");
                writeJpeg(rendered, outputPath, 0.92f);
            }
            case "MP4" -> {
                outputPath = offerRenderStorageService.resolveJobFile(job.getId(), output.getId() + "-" + baseName + ".mp4");
                writeMp4(previewPath, outputPath);
            }
            default -> {
                outputPath = offerRenderStorageService.resolveJobFile(job.getId(), output.getId() + "-" + baseName + ".png");
                writePng(rendered, outputPath);
            }
        }

        return new RenderedOutput(
            offerRenderStorageService.toPublicUrl(outputPath),
            offerRenderStorageService.toPublicUrl(previewPath)
        );
    }

    private BufferedImage renderCanvas(Map<String, Object> resolved, int width, int height) {
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB);
        Graphics2D graphics = image.createGraphics();
        try {
            graphics.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            graphics.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
            graphics.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
            graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);

            paintBackground(graphics, resolved, width, height);
            for (Map<String, Object> layer : listOfMaps(resolved.get("layers"))) {
                paintLayer(graphics, resolved, layer, width, height);
            }
            for (Map<String, Object> zone : listOfMaps(resolved.get("productZones"))) {
                paintZone(graphics, resolved, zone, width, height);
            }
        } finally {
            graphics.dispose();
        }
        return image;
    }

    private void paintBackground(Graphics2D graphics, Map<String, Object> resolved, int width, int height) {
        Map<String, Object> canvas = asMap(resolved.get("canvas"));
        Map<String, Object> background = asMap(canvas.get("background"));
        Map<String, Object> brandTokens = asMap(resolved.get("brandTokens"));
        Map<String, Object> colors = asMap(brandTokens.get("colors"));
        Map<String, Object> campaignAssets = asMap(resolved.get("campaignAssets"));
        Map<String, Object> backgroundArt = asMap(campaignAssets.get("backgroundArt"));

        Color start = color(background.get("start"), color(colors.get("surface"), new Color(0xFFF7EF)));
        Color end = color(background.get("end"), color(colors.get("surfaceAlt"), Color.WHITE));
        if ("gradient".equalsIgnoreCase(String.valueOf(background.get("type")))) {
            graphics.setPaint(new LinearGradientPaint(0, 0, 0, height, new float[] { 0f, 1f }, new Color[] { start, end }, MultipleGradientPaint.CycleMethod.NO_CYCLE));
            graphics.fillRect(0, 0, width, height);
            return;
        }
        graphics.setColor(color(background.get("color"), start));
        graphics.fillRect(0, 0, width, height);
        if ("soft-gradient".equalsIgnoreCase(String.valueOf(backgroundArt.get("type")))) {
            graphics.setPaint(new GradientPaint(0, 0, new Color(255, 170, 82, 70), width, height / 2f, new Color(255, 170, 82, 0)));
            graphics.fillOval((int) (width * 0.05), (int) (height * 0.04), (int) (width * 0.42), (int) (height * 0.26));
        }
    }

    private void paintLayer(Graphics2D graphics, Map<String, Object> resolved, Map<String, Object> layer, int canvasWidth, int canvasHeight) {
        Map<String, Object> bounds = asMap(layer.get("bounds"));
        int x = intValue(bounds.get("x"), 0);
        int y = intValue(bounds.get("y"), 0);
        int w = clamp(intValue(bounds.get("w"), canvasWidth), 1, canvasWidth);
        int h = clamp(intValue(bounds.get("h"), canvasHeight), 1, canvasHeight);
        String type = normalizeText(String.valueOf(layer.get("type")), "text").toLowerCase(Locale.ROOT);
        String binding = layer.get("binding") == null ? null : String.valueOf(layer.get("binding"));
        String text = resolveText(resolved, binding);

        switch (type) {
            case "tag", "badge" -> {
                graphics.setColor(new Color(255, 255, 255, 210));
                graphics.fill(new RoundRectangle2D.Float(x, y, w, h, h, h));
                drawText(graphics, text, x + 18, y + (h / 2) + 5, font(Font.SANS_SERIF, Font.BOLD, Math.max(18, h / 2 - 8)), new Color(95, 46, 13));
            }
            case "text" -> drawWrappedText(graphics, normalizeText(text, ""), x, y, w, h, font("SansSerif", Font.BOLD, 42), new Color(0x1F1613), 3);
            case "brandlogo" -> paintBrandLogo(graphics, resolved, x, y, w, h);
            case "campaignbadge" -> paintCampaignBadge(graphics, resolved, x, y, w, h);
            case "qrcode" -> paintQrCode(graphics, normalizeText(text, normalizeText(resolveText(resolved, "brand.qrValue"), "https://mercadoflow.com")), x, y, w, h);
            case "footer" -> paintFooter(graphics, resolved, x, y, w, h);
            case "image" -> paintContainedImage(graphics, loadImage(resolveText(resolved, binding)), x, y, w, h, 28);
            case "price" -> {
                graphics.setColor(new Color(255, 255, 255, 228));
                graphics.fill(new RoundRectangle2D.Float(x, y, w, h, 28, 28));
                drawText(graphics, normalizeText(text, "R$ 0,00"), x + 18, y + h / 2 + 12, font("SansSerif", Font.BOLD, Math.max(24, h / 2)), new Color(47, 23, 11));
            }
            default -> {
                if (text != null) {
                    drawWrappedText(graphics, text, x, y, w, h, font("SansSerif", Font.PLAIN, 24), new Color(0x1F1613), 3);
                }
            }
        }
    }

    private void paintBrandLogo(Graphics2D graphics, Map<String, Object> resolved, int x, int y, int w, int h) {
        Map<String, Object> brandTokens = asMap(resolved.get("brandTokens"));
        Map<String, Object> brandAssets = asMap(resolved.get("brandAssets"));
        String label = normalizeText(resolveText(resolved, "brand.logoLabel"), normalizeText(String.valueOf(asMap(brandAssets.get("logo")).get("label")), "Mercado"));
        graphics.setColor(new Color(255, 255, 255, 228));
        graphics.fill(new RoundRectangle2D.Float(x, y, w, h, 26, 26));
        graphics.setColor(color(asMap(brandTokens.get("colors")).get("primary"), new Color(255, 106, 0)));
        graphics.fillOval(x + 16, y + 12, Math.min(44, h - 24), Math.min(44, h - 24));
        drawText(graphics, label, x + 72, y + (h / 2) + 6, font("SansSerif", Font.BOLD, 22), new Color(47, 23, 11));
    }

    private void paintCampaignBadge(Graphics2D graphics, Map<String, Object> resolved, int x, int y, int w, int h) {
        Map<String, Object> campaignTokens = asMap(resolved.get("campaignTokens"));
        String label = normalizeText(String.valueOf(campaignTokens.get("badgeLabel")), "Encarte rapido");
        graphics.setPaint(new GradientPaint(x, y, new Color(255, 122, 18), x + w, y + h, new Color(240, 90, 0)));
        graphics.fill(new RoundRectangle2D.Float(x, y, w, h, 28, 28));
        drawText(graphics, label, x + 18, y + (h / 2) + 6, font("SansSerif", Font.BOLD, 20), Color.WHITE);
    }

    private void paintFooter(Graphics2D graphics, Map<String, Object> resolved, int x, int y, int w, int h) {
        Map<String, Object> campaignTokens = asMap(resolved.get("campaignTokens"));
        Map<String, Object> brandAssets = asMap(resolved.get("brandAssets"));
        String label = normalizeText(String.valueOf(campaignTokens.get("footer")), normalizeText(String.valueOf(asMap(brandAssets.get("footer")).get("disclaimer")), ""));
        graphics.setColor(new Color(29, 23, 19, 226));
        graphics.fill(new RoundRectangle2D.Float(x, y, w, h, 18, 18));
        drawWrappedText(graphics, label, x + 16, y + 12, w - 32, h - 16, font("SansSerif", Font.PLAIN, 14), new Color(255, 244, 238), 2);
    }

    private void paintQrCode(Graphics2D graphics, String value, int x, int y, int w, int h) {
        try {
            byte[] bytes = qrCodeService.generateQRCodeBytes(value, Math.max(w, 64), Math.max(h, 64));
            BufferedImage qr = ImageIO.read(new ByteArrayInputStream(bytes));
            paintContainedImage(graphics, qr, x, y, w, h, 18);
        } catch (IOException | WriterException ignored) {
        }
    }

    private void paintZone(Graphics2D graphics, Map<String, Object> resolved, Map<String, Object> zone, int canvasWidth, int canvasHeight) {
        Map<String, Object> bounds = asMap(zone.get("bounds"));
        int x = intValue(bounds.get("x"), 0);
        int y = intValue(bounds.get("y"), 0);
        int w = clamp(intValue(bounds.get("w"), canvasWidth), 1, canvasWidth);
        int h = clamp(intValue(bounds.get("h"), canvasHeight), 1, canvasHeight);
        String zoneId = normalizeText(String.valueOf(zone.get("id")), "zone");
        String zoneType = normalizeText(String.valueOf(zone.get("zoneType")), normalizeText(String.valueOf(zone.get("layout")), "grid")).toLowerCase(Locale.ROOT);
        int columns = "hero".equals(zoneType) || "single".equals(zoneType) ? 1 : Math.max(intValue(zone.get("columns"), 2), 1);
        int slotCount = Math.max(intValue(zone.get("slotCount"), 1), 1);
        int rows = Math.max((int) Math.ceil(slotCount / (double) columns), 1);
        int gap = 20;
        int cardWidth = columns == 1 ? w : (w - (gap * (columns - 1))) / columns;
        int cardHeight = rows == 1 ? h : (h - (gap * (rows - 1))) / rows;
        List<Map<String, Object>> products = listOfMaps(asMap(resolved.get("zoneBindings")).get(zoneId));

        for (int index = 0; index < Math.min(slotCount, products.size()); index++) {
            int row = index / columns;
            int col = index % columns;
            int cardX = x + (col * (cardWidth + gap));
            int cardY = y + (row * (cardHeight + gap));
            paintProductCard(graphics, products.get(index), cardX, cardY, cardWidth, cardHeight, "hero".equals(zoneType) || "single".equals(zoneType));
        }
    }

    private void paintProductCard(Graphics2D graphics, Map<String, Object> product, int x, int y, int w, int h, boolean hero) {
        graphics.setColor(new Color(255, 255, 255, 240));
        graphics.fill(new RoundRectangle2D.Float(x, y, w, h, 28, 28));
        graphics.setColor(new Color(234, 217, 202, 220));
        graphics.setStroke(new BasicStroke(2f));
        graphics.draw(new RoundRectangle2D.Float(x + 1, y + 1, w - 2, h - 2, 28, 28));

        int padding = hero ? 28 : 18;
        int imageHeight = hero ? (int) (h * 0.54) : (int) (h * 0.48);
        paintContainedImage(graphics, loadImage(normalizeText(String.valueOf(product.get("imageUrl")), null)), x + padding, y + padding, w - (padding * 2), imageHeight, 24);

        int textY = y + padding + imageHeight + 12;
        String name = normalizeText(String.valueOf(product.get("name")), "Produto do encarte");
        String unit = normalizeText(String.valueOf(product.get("unit")), "Unidade");
        double currentPrice = numberValue(product.get("currentPrice"));
        double baselinePrice = numberValue(product.get("baselinePrice"));

        drawWrappedText(graphics, name, x + padding, textY, w - (padding * 2), hero ? 70 : 52, font("SansSerif", Font.BOLD, hero ? 24 : 18), new Color(31, 22, 19), 2);
        drawText(graphics, unit, x + padding, textY + (hero ? 92 : 74), font("SansSerif", Font.PLAIN, hero ? 18 : 14), new Color(122, 91, 73));
        drawText(graphics, formatMoney(currentPrice), x + padding, y + h - padding - 12, font("SansSerif", Font.BOLD, hero ? 30 : 22), new Color(47, 23, 11));

        if (baselinePrice > currentPrice) {
            String baseline = formatMoney(baselinePrice);
            Font baselineFont = font("SansSerif", Font.PLAIN, hero ? 16 : 13);
            FontMetrics metrics = graphics.getFontMetrics(baselineFont);
            int baseY = y + h - padding - (hero ? 44 : 34);
            graphics.setFont(baselineFont);
            graphics.setColor(new Color(122, 91, 73));
            graphics.drawString(baseline, x + padding, baseY);
            int baseWidth = metrics.stringWidth(baseline);
            graphics.setStroke(new BasicStroke(2f));
            graphics.drawLine(x + padding, baseY - 6, x + padding + baseWidth, baseY - 6);
        }
    }

    private void paintContainedImage(Graphics2D graphics, BufferedImage source, int x, int y, int w, int h, int radius) {
        graphics.setColor(Color.WHITE);
        graphics.fill(new RoundRectangle2D.Float(x, y, w, h, radius, radius));
        if (source == null) {
            graphics.setColor(new Color(210, 199, 191));
            graphics.draw(new RoundRectangle2D.Float(x + 1, y + 1, w - 2, h - 2, radius, radius));
            drawText(graphics, "Sem imagem", x + 18, y + (h / 2) + 4, font("SansSerif", Font.BOLD, 18), new Color(122, 91, 73));
            return;
        }

        float scale = Math.min(w / (float) source.getWidth(), h / (float) source.getHeight());
        int drawWidth = Math.max(1, Math.round(source.getWidth() * scale));
        int drawHeight = Math.max(1, Math.round(source.getHeight() * scale));
        int drawX = x + Math.round((w - drawWidth) / 2f);
        int drawY = y + Math.round((h - drawHeight) / 2f);
        graphics.drawImage(source, drawX, drawY, drawWidth, drawHeight, null);
    }

    private void drawWrappedText(Graphics2D graphics, String text, int x, int y, int width, int height, Font font, Color color, int maxLines) {
        graphics.setFont(font);
        graphics.setColor(color);
        FontMetrics metrics = graphics.getFontMetrics(font);
        List<String> lines = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        for (String word : normalizeText(text, "").split("\\s+")) {
            String candidate = current.isEmpty() ? word : current + " " + word;
            if (metrics.stringWidth(candidate) <= width) {
                current.setLength(0);
                current.append(candidate);
                continue;
            }
            if (!current.isEmpty()) {
                lines.add(current.toString());
            }
            current.setLength(0);
            current.append(word);
            if (lines.size() == maxLines - 1) {
                break;
            }
        }
        if (!current.isEmpty() && lines.size() < maxLines) {
            lines.add(current.toString());
        }
        if (lines.size() == maxLines && metrics.stringWidth(lines.get(lines.size() - 1)) > width) {
            lines.set(lines.size() - 1, ellipsize(metrics, lines.get(lines.size() - 1), width));
        }
        int lineHeight = metrics.getHeight();
        int cursorY = y + metrics.getAscent();
        int maxY = y + height;
        for (String line : lines) {
            if (cursorY > maxY) {
                break;
            }
            graphics.drawString(ellipsize(metrics, line, width), x, cursorY);
            cursorY += lineHeight;
        }
    }

    private String ellipsize(FontMetrics metrics, String text, int width) {
        if (metrics.stringWidth(text) <= width) {
            return text;
        }
        String suffix = "...";
        int suffixWidth = metrics.stringWidth(suffix);
        String value = text;
        while (!value.isEmpty() && metrics.stringWidth(value) + suffixWidth > width) {
            value = value.substring(0, value.length() - 1);
        }
        return value + suffix;
    }

    private void drawText(Graphics2D graphics, String text, int x, int y, Font font, Color color) {
        graphics.setFont(font);
        graphics.setColor(color);
        graphics.drawString(normalizeText(text, ""), x, y);
    }

    private Font font(String family, int style, int size) {
        return new Font(family, style, size);
    }

    private Color color(Object value, Color fallback) {
        if (!(value instanceof String text) || text.isBlank()) {
            return fallback;
        }
        try {
            return Color.decode(text.trim());
        } catch (NumberFormatException ignored) {
            return fallback;
        }
    }

    private BufferedImage loadImage(String url) {
        if (url == null) {
            return null;
        }
        try {
            if (catalogImageUrlResolver.isManagedImage(url)) {
                String storageKey = catalogImageUrlResolver.extractManagedStorageKey(url);
                Resource resource = catalogImageStorageService.loadManagedResource(storageKey).orElse(null);
                if (resource != null) {
                    try (InputStream stream = resource.getInputStream()) {
                        return ImageIO.read(stream);
                    }
                }
            }
            if (catalogImageUrlResolver.isAbsoluteHttpUrl(url)) {
                HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                    .timeout(Duration.ofSeconds(25))
                    .header("User-Agent", "MercadoFlowOfferRender/1.0")
                    .GET()
                    .build();
                HttpResponse<InputStream> response = httpClient.send(request, HttpResponse.BodyHandlers.ofInputStream());
                if (response.statusCode() >= 200 && response.statusCode() < 300) {
                    try (InputStream stream = response.body()) {
                        return ImageIO.read(stream);
                    }
                }
            }
        } catch (Exception ignored) {
        }
        return null;
    }

    private void writePng(BufferedImage image, Path path) {
        offerRenderStorageService.ensureParent(path);
        try {
            ImageIO.write(image, "png", path.toFile());
        } catch (IOException ex) {
            throw new IllegalStateException("Falha ao gerar PNG do lote", ex);
        }
    }

    private void writeJpeg(BufferedImage image, Path path, float quality) {
        offerRenderStorageService.ensureParent(path);
        BufferedImage rgbImage = new BufferedImage(image.getWidth(), image.getHeight(), BufferedImage.TYPE_INT_RGB);
        Graphics2D graphics = rgbImage.createGraphics();
        try {
            graphics.setColor(Color.WHITE);
            graphics.fillRect(0, 0, rgbImage.getWidth(), rgbImage.getHeight());
            graphics.drawImage(image, 0, 0, null);
        } finally {
            graphics.dispose();
        }

        ImageWriter writer = ImageIO.getImageWritersByFormatName("jpg").next();
        try (ImageOutputStream output = ImageIO.createImageOutputStream(path.toFile())) {
            writer.setOutput(output);
            ImageWriteParam params = writer.getDefaultWriteParam();
            if (params.canWriteCompressed()) {
                params.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
                params.setCompressionQuality(quality);
            }
            writer.write(null, new IIOImage(rgbImage, null, null), params);
        } catch (IOException ex) {
            throw new IllegalStateException("Falha ao gerar JPEG do lote", ex);
        } finally {
            writer.dispose();
        }
    }

    private void writePdf(BufferedImage image, Path path) {
        offerRenderStorageService.ensureParent(path);
        try {
            byte[] jpegBytes = asJpegBytes(image);
            byte[] contentBytes = ("q\n" + image.getWidth() + " 0 0 " + image.getHeight() + " 0 0 cm\n/Im0 Do\nQ\n").getBytes(StandardCharsets.US_ASCII);

            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            List<Integer> offsets = new ArrayList<>();
            buffer.write("%PDF-1.4\n".getBytes(StandardCharsets.US_ASCII));

            offsets.add(buffer.size());
            writeObject(buffer, 1, "<< /Type /Catalog /Pages 2 0 R >>");

            offsets.add(buffer.size());
            writeObject(buffer, 2, "<< /Type /Pages /Count 1 /Kids [3 0 R] >>");

            offsets.add(buffer.size());
            writeObject(buffer, 3, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + image.getWidth() + " " + image.getHeight() + "] /Resources << /XObject << /Im0 4 0 R >> /ProcSet [/PDF /Text /ImageC] >> /Contents 5 0 R >>");

            offsets.add(buffer.size());
            writeStreamObject(buffer, 4, "<< /Type /XObject /Subtype /Image /Width " + image.getWidth() + " /Height " + image.getHeight() + " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + jpegBytes.length + " >>", jpegBytes);

            offsets.add(buffer.size());
            writeStreamObject(buffer, 5, "<< /Length " + contentBytes.length + " >>", contentBytes);

            int xrefOffset = buffer.size();
            buffer.write(("xref\n0 " + (offsets.size() + 1) + "\n").getBytes(StandardCharsets.US_ASCII));
            buffer.write("0000000000 65535 f \n".getBytes(StandardCharsets.US_ASCII));
            for (Integer offset : offsets) {
                buffer.write(String.format(Locale.ROOT, "%010d 00000 n \n", offset).getBytes(StandardCharsets.US_ASCII));
            }
            buffer.write(("trailer << /Size " + (offsets.size() + 1) + " /Root 1 0 R >>\nstartxref\n" + xrefOffset + "\n%%EOF").getBytes(StandardCharsets.US_ASCII));

            Files.write(path, buffer.toByteArray());
        } catch (IOException ex) {
            throw new IllegalStateException("Falha ao gerar PDF do lote", ex);
        }
    }

    private byte[] asJpegBytes(BufferedImage image) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        BufferedImage rgbImage = new BufferedImage(image.getWidth(), image.getHeight(), BufferedImage.TYPE_INT_RGB);
        Graphics2D graphics = rgbImage.createGraphics();
        try {
            graphics.setColor(Color.WHITE);
            graphics.fillRect(0, 0, rgbImage.getWidth(), rgbImage.getHeight());
            graphics.drawImage(image, 0, 0, null);
        } finally {
            graphics.dispose();
        }
        ImageIO.write(rgbImage, "jpg", output);
        return output.toByteArray();
    }

    private void writeObject(ByteArrayOutputStream buffer, int objectNumber, String body) throws IOException {
        buffer.write((objectNumber + " 0 obj\n").getBytes(StandardCharsets.US_ASCII));
        buffer.write(body.getBytes(StandardCharsets.US_ASCII));
        buffer.write("\nendobj\n".getBytes(StandardCharsets.US_ASCII));
    }

    private void writeStreamObject(ByteArrayOutputStream buffer, int objectNumber, String header, byte[] bytes) throws IOException {
        buffer.write((objectNumber + " 0 obj\n").getBytes(StandardCharsets.US_ASCII));
        buffer.write(header.getBytes(StandardCharsets.US_ASCII));
        buffer.write("\nstream\n".getBytes(StandardCharsets.US_ASCII));
        buffer.write(bytes);
        buffer.write("\nendstream\nendobj\n".getBytes(StandardCharsets.US_ASCII));
    }

    private void writeMp4(Path framePath, Path outputPath) {
        offerRenderStorageService.ensureParent(outputPath);
        try {
            Process process = new ProcessBuilder(
                "ffmpeg",
                "-y",
                "-loop", "1",
                "-i", framePath.toString(),
                "-c:v", "libx264",
                "-t", "6",
                "-pix_fmt", "yuv420p",
                "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
                outputPath.toString()
            ).redirectErrorStream(true).start();
            byte[] logs = process.getInputStream().readAllBytes();
            int exitCode = process.waitFor();
            if (exitCode != 0) {
                throw new IllegalStateException("Falha ao gerar MP4 do lote: " + new String(logs, StandardCharsets.UTF_8));
            }
        } catch (IOException | InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Falha ao gerar MP4 do lote", ex);
        }
    }

    private String resolveText(Map<String, Object> resolved, String binding) {
        if (binding == null || binding.isBlank()) {
            return null;
        }
        if (binding.startsWith("static.")) {
            Object value = lookup(asMap(asMap(resolved.get("bindings")).get("static")), binding.substring("static.".length()));
            return value == null ? null : String.valueOf(value);
        }
        if (binding.startsWith("brand.")) {
            Object value = lookup(asMap(resolved.get("brandTokens")), binding.substring("brand.".length()));
            return value == null ? null : String.valueOf(value);
        }
        if (binding.startsWith("campaign.")) {
            Object value = lookup(asMap(resolved.get("campaignTokens")), binding.substring("campaign.".length()));
            return value == null ? null : String.valueOf(value);
        }
        if (binding.startsWith("product.")) {
            List<Map<String, Object>> products = listOfMaps(resolved.get("resolvedProducts"));
            if (!products.isEmpty()) {
                Object value = lookup(products.get(0), binding.substring("product.".length()));
                return value == null ? null : String.valueOf(value);
            }
        }
        Object value = lookup(resolved, binding);
        return value == null ? null : String.valueOf(value);
    }

    private Object lookup(Map<String, Object> value, String path) {
        Object current = value;
        for (String segment : path.split("\\.")) {
            if (!(current instanceof Map<?, ?> map)) {
                return null;
            }
            current = map.get(segment);
        }
        return current;
    }

    private List<Map<String, Object>> listOfMaps(Object value) {
        if (!(value instanceof List<?> list)) {
            return List.of();
        }
        return list.stream().map(this::asMap).filter(map -> !map.isEmpty()).toList();
    }

    private Map<String, Object> asMap(Object value) {
        if (value instanceof Map<?, ?> map) {
            Map<String, Object> normalized = new LinkedHashMap<>();
            map.forEach((key, entryValue) -> normalized.put(String.valueOf(key), entryValue));
            return normalized;
        }
        return new LinkedHashMap<>();
    }

    private Map<String, Object> parseJsonObject(String value) {
        try {
            if (value == null || value.isBlank()) {
                return new LinkedHashMap<>();
            }
            return objectMapper.readValue(value, MAP_TYPE);
        } catch (IOException ex) {
            return new LinkedHashMap<>();
        }
    }

    private String slugify(String value) {
        return normalizeText(value, "output")
            .toLowerCase(Locale.ROOT)
            .replaceAll("[^a-z0-9]+", "-")
            .replaceAll("(^-|-$)", "");
    }

    private String normalizeText(String value, String fallback) {
        if (value == null) {
            return fallback;
        }
        String normalized = value.trim();
        return normalized.isEmpty() ? fallback : normalized;
    }

    private int intValue(Object value, int fallback) {
        if (value instanceof Number number) {
            return number.intValue();
        }
        if (value instanceof String text) {
            try {
                return Integer.parseInt(text.trim());
            } catch (NumberFormatException ignored) {
            }
        }
        return fallback;
    }

    private double numberValue(Object value) {
        if (value instanceof Number number) {
            return number.doubleValue();
        }
        if (value instanceof String text) {
            try {
                return Double.parseDouble(text.trim().replace(",", "."));
            } catch (NumberFormatException ignored) {
            }
        }
        return 0d;
    }

    private int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }

    private String formatMoney(double value) {
        return String.format(Locale.forLanguageTag("pt-BR"), "R$ %.2f", value).replace(".", ",");
    }

    public record RenderedOutput(String fileUrl, String previewImageUrl) {}
}
