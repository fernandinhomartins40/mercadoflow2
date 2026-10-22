package com.pdv2cloud.service.art;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.pdv2cloud.repository.ProductEnrichmentRepository;
import com.pdv2cloud.service.CatalogImageStorageService;
import com.pdv2cloud.service.CatalogImageUrlResolver;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.zip.CRC32;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockMultipartFile;

/** SEG-11: PNG pequeno que declara 20 000 × 20 000 é recusado antes de decodificar. */
class ImageBombTest {

    @TempDir
    Path dir;

    /** PNG 1×1 de verdade com o IHDR reescrito para declarar {@code side} × {@code side}. */
    static byte[] bomb(int side) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(1, 1, BufferedImage.TYPE_INT_RGB), "png", out);
        byte[] png = out.toByteArray();
        ByteBuffer.wrap(png, 16, 8).putInt(side).putInt(side);
        CRC32 crc = new CRC32();
        crc.update(png, 12, 17); // "IHDR" + 13 bytes de dados
        ByteBuffer.wrap(png, 29, 4).putInt((int) crc.getValue());
        return png;
    }

    @Test
    void cabecalhoInformaOTamanhoSemDecodificar() throws Exception {
        assertThat(ImageDimensions.read(new ByteArrayInputStream(bomb(20_000)))).containsExactly(20_000, 20_000);
    }

    @Test
    void estudioRecusaBombaDeImagem() throws Exception {
        ArtFileStorage storage = new ArtFileStorage(dir.toString());

        assertThatThrownBy(() -> storage.storeBytes("temas", bomb(20_000)))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("6000 px");
        assertThat(Files.exists(dir.resolve("art"))).isFalse();
    }

    @Test
    void catalogoRecusaBombaDeImagem() throws Exception {
        CatalogImageUrlResolver resolver = mock(CatalogImageUrlResolver.class);
        when(resolver.normalizeStorageKey(anyString())).thenAnswer(i -> i.getArgument(0));
        CatalogImageStorageService service = new CatalogImageStorageService(resolver, mock(ProductEnrichmentRepository.class),
            dir.toString(), 5_000_000L, 12_000_000L);
        MockMultipartFile file = new MockMultipartFile("file", "x.png", "image/png", bomb(20_000));

        assertThatThrownBy(() -> service.storeUploadedSquareImage("products/789.jpg", file))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("6000 px");
    }
}
