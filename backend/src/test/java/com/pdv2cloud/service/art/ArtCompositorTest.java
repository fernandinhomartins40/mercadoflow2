package com.pdv2cloud.service.art;

import static org.assertj.core.api.Assertions.assertThat;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class ArtCompositorTest {

    @TempDir
    Path dir;

    private static byte[] png(int w, int h, Color color) throws Exception {
        BufferedImage img = new BufferedImage(w, h, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = img.createGraphics();
        g.setColor(color);
        g.fillRect(0, 0, w, h);
        g.dispose();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(img, "png", out);
        return out.toByteArray();
    }

    @Test
    void drawsBaseFullAndElementAtCenterWithWidthFraction() throws Exception {
        ArtFileStorage storage = new ArtFileStorage(dir.toString());
        String base = storage.storeBytes("themes/t", png(100, 100, Color.RED)).url();
        String element = storage.storeBytes("themes/t", png(50, 50, Color.BLUE)).url();
        List<Object> layers = List.of(
            Map.of("url", base, "role", "base"),
            // Enfeite no centro, com 20% da largura da arte (216 px num quadrado de 1080).
            Map.of("url", element, "role", "element", "cx", 0.5, "cy", 0.5, "width", 0.2, "rotation", 0, "opacity", 1),
            Map.of("url", element, "role", "element", "cx", 0.1, "cy", 0.1, "width", 0.1, "hidden", true));

        byte[] jpeg = ArtCompositor.compose(ArtFormats.require("square"), layers, storage);
        BufferedImage out = ImageIO.read(new ByteArrayInputStream(jpeg));

        assertThat(out.getWidth()).isEqualTo(1080);
        assertThat(out.getHeight()).isEqualTo(1080);
        Color center = new Color(out.getRGB(540, 540));
        Color corner = new Color(out.getRGB(20, 20));
        Color justOutside = new Color(out.getRGB(540 + 120, 540));
        assertThat(center.getBlue()).isGreaterThan(200);
        assertThat(center.getRed()).isLessThan(60);
        assertThat(justOutside.getRed()).isGreaterThan(200);
        // Camada escondida não entra: o canto continua vermelho.
        assertThat(corner.getRed()).isGreaterThan(200);
        assertThat(corner.getBlue()).isLessThan(60);
    }

    @Test
    void previewPutsSealInItsAreaAndDrawsGuides() throws Exception {
        ArtFileStorage storage = new ArtFileStorage(dir.toString());
        String base = storage.storeBytes("themes/t", png(100, 100, Color.WHITE)).url();
        String seal = storage.storeBytes("themes/t", png(100, 100, Color.BLUE)).url();
        Map<String, Object> regions = Map.of(
            "seal", Map.of("x", 0.6, "y", 0.1, "w", 0.3, "h", 0.3),
            "products", Map.of("x", 0.05, "y", 0.5, "w", 0.9, "h", 0.45));
        List<Object> layers = List.<Object>of(Map.of("url", base, "role", "base"));

        // A4 sai reduzido a 1080 px no lado maior.
        BufferedImage a4 = ImageIO.read(new ByteArrayInputStream(
            ArtCompositor.preview(ArtFormats.require("a4"), layers, null, regions, seal, false, storage)));
        assertThat(Math.max(a4.getWidth(), a4.getHeight())).isEqualTo(1080);

        BufferedImage sq = ImageIO.read(new ByteArrayInputStream(
            ArtCompositor.preview(ArtFormats.require("square"), layers, null, regions, seal, true, storage)));
        // Selo no meio da área dele.
        assertThat(new Color(sq.getRGB((int) (0.75 * 1080), (int) (0.25 * 1080))).getBlue()).isGreaterThan(200);
        // Área de produtos tingida de verde por cima do branco.
        Color inside = new Color(sq.getRGB(540, (int) (0.75 * 1080)));
        assertThat(inside.getGreen()).isGreaterThan(inside.getRed());
        // Fora das áreas continua branco.
        Color outside = new Color(sq.getRGB(200, 200));
        assertThat(outside.getRed()).isGreaterThan(230);
    }
}
