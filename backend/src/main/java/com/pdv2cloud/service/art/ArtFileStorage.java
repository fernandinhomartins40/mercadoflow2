package com.pdv2cloud.service.art;

import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.Locale;
import java.util.UUID;
import javax.imageio.ImageIO;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

/**
 * Arquivos do estúdio de encartes: fundos e selos dos temas, logos dos
 * mercados e as artes publicadas.
 *
 * Ficam em {@code <offers-dir>/art}, o mesmo volume persistente do editor
 * antigo (o deploy não apaga {@code data/offers}). Os nomes são UUID: a URL é
 * pública porque a página de ofertas do mercado precisa abrir sem login.
 *
 * O PNG enviado é gravado como veio — recomprimir um fundo de A4 feito por
 * designer perderia qualidade. Só se confere que é imagem de verdade e se lê o
 * tamanho.
 */
@Service
public class ArtFileStorage {

    public static final String PUBLIC_PREFIX = "/api/v1/art-files/";
    private static final long MAX_BYTES = 25L * 1024 * 1024;
    private static final int MAX_SIDE = 6000;

    private final Path root;

    public ArtFileStorage(@Value("${app.offers.outputs-dir:../data/offers}") String outputsDir) {
        this.root = Paths.get(outputsDir).toAbsolutePath().normalize().resolve("art");
    }

    public Path root() {
        return root;
    }

    public record Stored(String url, int width, int height) {}

    /** Grava uma imagem enviada pelo navegador em {@code folder}. */
    public Stored storeImage(String folder, MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("Nenhum arquivo foi enviado");
        }
        if (file.getSize() > MAX_BYTES) {
            throw new IllegalArgumentException("A imagem passa de 25 MB. Exporte com compressão e tente de novo.");
        }
        try {
            return storeBytes(folder, file.getBytes());
        } catch (IOException ex) {
            throw new IllegalStateException("Falha ao ler a imagem enviada", ex);
        }
    }

    public Stored storeBytes(String folder, byte[] bytes) {
        String extension = sniffExtension(bytes);
        if (extension == null) {
            throw new IllegalArgumentException("Envie uma imagem PNG, JPG ou WebP");
        }
        int width;
        int height;
        try {
            BufferedImage image = ImageIO.read(new ByteArrayInputStream(bytes));
            if (image == null) {
                // WebP não tem leitor no ImageIO da JDK: aceita sem medir; o
                // navegador informa o tamanho quando precisa.
                if (!"webp".equals(extension)) {
                    throw new IllegalArgumentException("O arquivo enviado não é uma imagem válida");
                }
                width = 0;
                height = 0;
            } else {
                width = image.getWidth();
                height = image.getHeight();
            }
        } catch (IOException ex) {
            throw new IllegalArgumentException("O arquivo enviado não é uma imagem válida");
        }
        if (width > MAX_SIDE || height > MAX_SIDE) {
            throw new IllegalArgumentException("A imagem passa de " + MAX_SIDE + " px de lado");
        }

        Path target = root.resolve(safeFolder(folder)).resolve(UUID.randomUUID() + "." + extension).normalize();
        if (!target.startsWith(root)) {
            throw new IllegalArgumentException("Pasta inválida");
        }
        try {
            Files.createDirectories(target.getParent());
            Path temp = Files.createTempFile(target.getParent(), "art-", ".tmp");
            try {
                Files.write(temp, bytes);
                Files.move(temp, target, StandardCopyOption.REPLACE_EXISTING);
            } finally {
                Files.deleteIfExists(temp);
            }
        } catch (IOException ex) {
            throw new IllegalStateException("Falha ao gravar a imagem", ex);
        }
        return new Stored(PUBLIC_PREFIX + root.relativize(target).toString().replace('\\', '/'), width, height);
    }

    /** Apaga um arquivo nosso; URLs de fora ou inválidas são ignoradas. */
    public void delete(String url) {
        if (url == null || !url.startsWith(PUBLIC_PREFIX)) {
            return;
        }
        Path path = root.resolve(url.substring(PUBLIC_PREFIX.length())).normalize();
        if (!path.startsWith(root)) {
            return;
        }
        try {
            Files.deleteIfExists(path);
        } catch (IOException ignored) {
            // Arquivo órfão não quebra nada; a próxima limpeza resolve.
        }
    }

    private static String safeFolder(String folder) {
        String value = folder == null ? "misc" : folder.toLowerCase(Locale.ROOT);
        value = value.replaceAll("[^a-z0-9/_-]+", "-").replaceAll("/{2,}", "/").replaceAll("(^[-/]+|[-/]+$)", "");
        return value.isBlank() ? "misc" : value;
    }

    /** Tipo pelo cabeçalho do arquivo, não pelo nome nem pelo Content-Type do cliente. */
    private static String sniffExtension(byte[] b) {
        if (b == null || b.length < 12) {
            return null;
        }
        if ((b[0] & 0xff) == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G') {
            return "png";
        }
        if ((b[0] & 0xff) == 0xFF && (b[1] & 0xff) == 0xD8) {
            return "jpg";
        }
        if (b[0] == 'R' && b[1] == 'I' && b[2] == 'F' && b[3] == 'F' && b[8] == 'W' && b[9] == 'E' && b[10] == 'B' && b[11] == 'P') {
            return "webp";
        }
        return null;
    }
}
