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
        return jpeg(render(format, layers, storage));
    }

    /** Cores das áreas, as mesmas do editor (formats.ts, REGION_META). */
    private static final Map<String, Color> REGION_COLORS = Map.of(
        "products", new Color(0x16a34a), "logo", new Color(0x2563eb), "footer", new Color(0x9333ea), "seal", new Color(0xea580c));
    private static final Map<String, String> REGION_LABELS = Map.of(
        "products", "PRODUTOS", "logo", "LOGO", "footer", "RODAPE", "seal", "SELO");

    /**
     * Prévia para revisar a montagem (MCP): fundo em camadas (ou o fundo único),
     * selo 3D na área dele e, com {@code guides}, as áreas, a margem de
     * segurança de 4% e o contorno + id de cada enfeite. Sai reduzida a 1080 px
     * no lado maior: é para olhar, não para imprimir.
     */
    static byte[] preview(ArtFormats.Format format, List<Object> layers, String backgroundUrl, Map<String, Object> regions,
                          String sealUrl, boolean guides, ArtFileStorage storage) {
        int W = format.width();
        int H = format.height();
        BufferedImage out = layers.isEmpty() && backgroundUrl != null
            ? flat(format, decode(storage.read(backgroundUrl), backgroundUrl))
            : render(format, layers, storage);
        Graphics2D g = out.createGraphics();
        try {
            quality(g);
            if (sealUrl != null && regions.get("seal") instanceof Map<?, ?> s) {
                BufferedImage seal = decode(storage.read(sealUrl), sealUrl);
                double[] r = rect(s, W, H);
                double k = Math.min(r[2] / seal.getWidth(), r[3] / seal.getHeight());
                double sw = seal.getWidth() * k;
                double sh = seal.getHeight() * k;
                g.drawImage(seal, (int) Math.round(r[0] + (r[2] - sw) / 2), (int) Math.round(r[1] + (r[3] - sh) / 2),
                    (int) Math.round(sw), (int) Math.round(sh), null);
            }
            if (guides) {
                drawGuides(g, layers, regions, W, H);
            }
        } finally {
            g.dispose();
        }
        double scale = Math.min(1, 1080.0 / Math.max(W, H));
        if (scale < 1) {
            BufferedImage small = new BufferedImage((int) Math.round(W * scale), (int) Math.round(H * scale), BufferedImage.TYPE_INT_RGB);
            Graphics2D s = small.createGraphics();
            quality(s);
            s.drawImage(out, 0, 0, small.getWidth(), small.getHeight(), null);
            s.dispose();
            out = small;
        }
        return jpeg(out);
    }

    private static void drawGuides(Graphics2D g, List<Object> layers, Map<String, Object> regions, int W, int H) {
        float unit = Math.min(W, H);
        java.awt.Font font = new java.awt.Font(java.awt.Font.SANS_SERIF, java.awt.Font.BOLD, Math.round(unit * 0.024f));
        g.setFont(font);
        java.awt.Stroke dashed = new java.awt.BasicStroke(Math.max(2, unit * 0.004f), java.awt.BasicStroke.CAP_BUTT,
            java.awt.BasicStroke.JOIN_MITER, 10, new float[] {unit * 0.015f, unit * 0.01f}, 0);
        // Margem de segurança (4% do menor lado).
        double m = unit * 0.04;
        g.setComposite(AlphaComposite.SrcOver);
        g.setStroke(dashed);
        g.setColor(new Color(255, 255, 255, 200));
        g.draw(new java.awt.geom.Rectangle2D.Double(m, m, W - 2 * m, H - 2 * m));
        for (String key : ArtFormats.REGION_KEYS) {
            if (!(regions.get(key) instanceof Map<?, ?> r)) {
                continue;
            }
            double[] p = rect(r, W, H);
            Color c = REGION_COLORS.get(key);
            g.setColor(new Color(c.getRed(), c.getGreen(), c.getBlue(), 50));
            g.fill(new java.awt.geom.Rectangle2D.Double(p[0], p[1], p[2], p[3]));
            g.setColor(c);
            g.draw(new java.awt.geom.Rectangle2D.Double(p[0], p[1], p[2], p[3]));
            label(g, REGION_LABELS.get(key), p[0], p[1], c);
        }
        // Enfeites: contorno girado + id, para a IA saber quem é quem.
        g.setStroke(new java.awt.BasicStroke(Math.max(2, unit * 0.003f)));
        for (Object o : layers) {
            if (!(o instanceof Map<?, ?> l) || "base".equals(l.get("role")) || Boolean.TRUE.equals(l.get("hidden"))) {
                continue;
            }
            double w = ArtJson.num(l.get("width"), 0.3) * W;
            double iw = ArtJson.num(l.get("w"), 1);
            double ih = ArtJson.num(l.get("h"), 1);
            double h = w * ih / Math.max(1, iw);
            double cx = ArtJson.num(l.get("cx"), 0.5) * W;
            double cy = ArtJson.num(l.get("cy"), 0.5) * H;
            AffineTransform saved = g.getTransform();
            g.translate(cx, cy);
            g.rotate(Math.toRadians(ArtJson.num(l.get("rotation"), 0)));
            g.setColor(new Color(14, 165, 233));
            g.draw(new java.awt.geom.Rectangle2D.Double(-w / 2, -h / 2, w, h));
            g.setTransform(saved);
            label(g, String.valueOf(l.get("id")), cx - w / 2, cy - h / 2, new Color(14, 165, 233));
        }
    }

    private static void label(Graphics2D g, String text, double x, double y, Color bg) {
        java.awt.FontMetrics fm = g.getFontMetrics();
        int pad = Math.max(2, fm.getHeight() / 6);
        int lx = (int) Math.max(0, x);
        int ly = (int) Math.max(0, y);
        g.setColor(bg);
        g.fillRect(lx, ly, fm.stringWidth(text) + 2 * pad, fm.getHeight());
        g.setColor(Color.WHITE);
        g.drawString(text, lx + pad, ly + fm.getAscent());
    }

    private static double[] rect(Map<?, ?> r, int W, int H) {
        return new double[] {ArtJson.num(r.get("x"), 0) * W, ArtJson.num(r.get("y"), 0) * H,
            ArtJson.num(r.get("w"), 0) * W, ArtJson.num(r.get("h"), 0) * H};
    }

    private static BufferedImage flat(ArtFormats.Format format, BufferedImage bg) {
        BufferedImage out = new BufferedImage(format.width(), format.height(), BufferedImage.TYPE_INT_RGB);
        Graphics2D g = out.createGraphics();
        quality(g);
        g.drawImage(bg, 0, 0, format.width(), format.height(), null);
        g.dispose();
        return out;
    }

    private static void quality(Graphics2D g) {
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
        g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
    }

    private static BufferedImage render(ArtFormats.Format format, List<Object> layers, ArtFileStorage storage) {
        int W = format.width();
        int H = format.height();
        BufferedImage out = new BufferedImage(W, H, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = out.createGraphics();
        try {
            quality(g);
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
        return out;
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
