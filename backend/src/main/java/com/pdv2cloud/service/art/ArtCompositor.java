package com.pdv2cloud.service.art;

import java.awt.AlphaComposite;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.geom.AffineTransform;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.MemoryCacheImageOutputStream;

/**
 * Fundo achatado das camadas, montado no servidor. É o mesmo desenho do
 * navegador (features/art-studio/render.ts, drawLayers): base cobrindo a arte,
 * enfeite pelo centro, largura em fração da arte, giro horário e opacidade.
 * Usado quando quem salva as camadas não tem canvas (API do MCP).
 */
final class ArtCompositor {

    private ArtCompositor() {}

    static byte[] compose(ArtFormats.Format format, List<Object> layers, ArtFileStorage storage) {
        int W = format.width();
        int H = format.height();
        BufferedImage out = new BufferedImage(W, H, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = out.createGraphics();
        try {
            g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
            g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
            g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            g.setColor(Color.WHITE);
            g.fillRect(0, 0, W, H);
            Map<String, BufferedImage> cache = new HashMap<>();
            for (Object o : layers) {
                if (!(o instanceof Map<?, ?> m) || Boolean.TRUE.equals(m.get("hidden"))) {
                    continue;
                }
                String url = String.valueOf(m.get("url"));
                BufferedImage img = cache.computeIfAbsent(url, u -> decode(storage.read(u), u));
                AffineTransform saved = g.getTransform();
                g.setComposite(AlphaComposite.getInstance(AlphaComposite.SRC_OVER, (float) ArtJson.num(m.get("opacity"), 1)));
                if ("base".equals(m.get("role"))) {
                    g.drawImage(img, 0, 0, W, H, null);
                } else {
                    double w = ArtJson.num(m.get("width"), 0.3) * W;
                    double h = w * img.getHeight() / Math.max(1, img.getWidth());
                    g.translate(ArtJson.num(m.get("cx"), 0.5) * W, ArtJson.num(m.get("cy"), 0.5) * H);
                    g.rotate(Math.toRadians(ArtJson.num(m.get("rotation"), 0)));
                    g.drawImage(img, (int) Math.round(-w / 2), (int) Math.round(-h / 2), (int) Math.round(w), (int) Math.round(h), null);
                }
                g.setTransform(saved);
            }
        } finally {
            g.dispose();
        }
        return jpeg(out);
    }

    private static BufferedImage decode(byte[] bytes, String url) {
        try {
            BufferedImage img = ImageIO.read(new ByteArrayInputStream(bytes));
            if (img == null) {
                throw new IllegalArgumentException("Não foi possível ler a camada (use PNG ou JPG, não WebP): " + url);
            }
            return img;
        } catch (IOException e) {
            throw new IllegalArgumentException("Não foi possível ler a camada: " + url);
        }
    }

    /** JPEG: o fundo achatado é opaco e serve para análise e miniatura; o desenho final usa as camadas. */
    private static byte[] jpeg(BufferedImage img) {
        ImageWriter writer = ImageIO.getImageWritersByFormatName("jpg").next();
        try (ByteArrayOutputStream bytes = new ByteArrayOutputStream();
             MemoryCacheImageOutputStream stream = new MemoryCacheImageOutputStream(bytes)) {
            ImageWriteParam param = writer.getDefaultWriteParam();
            param.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
            param.setCompressionQuality(0.92f);
            writer.setOutput(stream);
            writer.write(null, new IIOImage(img, null, null), param);
            stream.flush();
            return bytes.toByteArray();
        } catch (IOException e) {
            throw new IllegalStateException("Falha ao montar o fundo", e);
        } finally {
            writer.dispose();
        }
    }
}
