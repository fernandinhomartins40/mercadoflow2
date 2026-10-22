package com.pdv2cloud.service.art;

import java.io.IOException;
import java.util.Iterator;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;

/**
 * Lê largura e altura do cabeçalho da imagem sem decodificar os pixels (SEG-11):
 * um PNG de poucos KB pode declarar 20 000 × 20 000 e estourar a memória no
 * {@code ImageIO.read}. Conferir o lado antes evita a bomba de descompressão.
 */
public final class ImageDimensions {

    private ImageDimensions() {
    }

    /** Largura e altura, ou nulo se nenhum leitor do ImageIO reconhece o formato (ex.: WebP). */
    public static int[] read(Object input) throws IOException {
        try (ImageInputStream in = ImageIO.createImageInputStream(input)) {
            if (in == null) {
                return null;
            }
            Iterator<ImageReader> readers = ImageIO.getImageReaders(in);
            if (!readers.hasNext()) {
                return null;
            }
            ImageReader reader = readers.next();
            try {
                reader.setInput(in, true, true);
                return new int[] {reader.getWidth(0), reader.getHeight(0)};
            } finally {
                reader.dispose();
            }
        }
    }

    /** Recusa a imagem cujo lado declarado passa de {@code maxSide}, antes de decodificar. */
    public static void requireWithin(Object input, int maxSide) throws IOException {
        int[] size = read(input);
        if (size != null && (size[0] > maxSide || size[1] > maxSide)) {
            throw new IllegalArgumentException("A imagem passa de " + maxSide + " px de lado");
        }
    }
}
