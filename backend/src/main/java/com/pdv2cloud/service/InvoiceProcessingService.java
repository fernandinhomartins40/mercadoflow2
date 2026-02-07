package com.pdv2cloud.service;

import com.pdv2cloud.model.dto.BatchIngestResponse;
import com.pdv2cloud.model.dto.IngestResponse;
import com.pdv2cloud.model.dto.InvoiceDTO;
import com.pdv2cloud.model.dto.InvoiceItemDTO;
import com.pdv2cloud.model.entity.Invoice;
import com.pdv2cloud.model.entity.InvoiceItem;
import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.model.entity.Product;
import com.pdv2cloud.repository.InvoiceRepository;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.repository.ProductRepository;
import com.pdv2cloud.util.DateUtils;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
@Slf4j
public class InvoiceProcessingService {

    @Autowired
    private InvoiceRepository invoiceRepository;

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private MarketRepository marketRepository;

    public IngestResponse processInvoice(InvoiceDTO dto, UUID marketId) {
        try {
            if (invoiceRepository.existsByChaveNFe(dto.getChaveNFe())) {
                return IngestResponse.duplicate(dto.getChaveNFe());
            }

            List<Product> products = resolveProducts(dto.getItems(), marketId);
            Invoice invoice = mapToEntity(dto, marketId);
            invoice.setProcessedAt(LocalDateTime.now());

            for (int i = 0; i < invoice.getItems().size(); i++) {
                InvoiceItem item = invoice.getItems().get(i);
                item.setProduct(products.get(i));
            }

            invoiceRepository.save(invoice);
            return IngestResponse.success(invoice.getId(), dto.getChaveNFe());
        } catch (Exception e) {
            log.error("Error processing invoice: {}", dto.getChaveNFe(), e);
            return IngestResponse.error(dto.getChaveNFe(), e.getMessage());
        }
    }

    public BatchIngestResponse processBatch(List<InvoiceDTO> invoices, UUID marketId) {
        int success = 0;
        int duplicates = 0;
        int errors = 0;
        List<IngestResponse> results = new ArrayList<>();

        for (InvoiceDTO dto : invoices) {
            IngestResponse response = processInvoice(dto, marketId);
            results.add(response);
            switch (response.getStatus()) {
                case "SUCCESS":
                    success++;
                    break;
                case "DUPLICATE":
                    duplicates++;
                    break;
                default:
                    errors++;
                    break;
            }
        }

        return new BatchIngestResponse(invoices.size(), success, duplicates, errors, results);
    }

    private List<Product> resolveProducts(List<InvoiceItemDTO> items, UUID marketId) {
        List<Product> products = new ArrayList<>();

        for (InvoiceItemDTO item : items) {
            String resolvedEan = resolveEan(item, marketId);
            Product product = productRepository.findByEan(resolvedEan)
                .orElseGet(() -> {
                    Product newProduct = new Product();
                    newProduct.setEan(resolvedEan);
                    newProduct.setName(item.getDescricao());
                    newProduct.setCategory(null);
                    newProduct.setBrand(null);
                    newProduct.setUnit(null);
                    return productRepository.save(newProduct);
                });
            products.add(product);
        }

        return products;
    }

    private String resolveEan(InvoiceItemDTO item, UUID marketId) {
        String raw = item.getCodigoEAN();
        String normalized = normalizeEan(raw);
        if (normalized != null) {
            return normalized;
        }

        String internal = item.getCodigoInterno();
        if (internal != null && !internal.isBlank()) {
            return "INT:" + marketId + ":" + internal.trim();
        }

        String desc = item.getDescricao() != null ? item.getDescricao().trim().toLowerCase() : "item";
        return "DESC:" + marketId + ":" + sha256Hex(desc).substring(0, 12);
    }

    private String normalizeEan(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        if (trimmed.isBlank()) {
            return null;
        }
        String upper = trimmed.toUpperCase();
        if ("SEM GTIN".equals(upper) || "SEMGTIN".equals(upper) || "NULL".equals(upper)) {
            return null;
        }
        if (trimmed.replace("0", "").isBlank()) { // "0", "000000", etc.
            return null;
        }
        return trimmed;
    }

    private String sha256Hex(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(hash.length * 2);
            for (byte b : hash) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to hash value", ex);
        }
    }

    private Invoice mapToEntity(InvoiceDTO dto, UUID marketId) {
        Market market = marketRepository.getReferenceById(marketId);
        Invoice invoice = new Invoice();
        invoice.setChaveNFe(dto.getChaveNFe());
        invoice.setMarket(market);
        invoice.setSerie(dto.getSerie());
        invoice.setNumero(dto.getNumero());
        invoice.setDataEmissao(DateUtils.parseFlexible(dto.getDataEmissao()));
        invoice.setCnpjEmitente(dto.getCnpjEmitente());
        invoice.setCpfCnpjDestinatario(dto.getCpfCnpjDestinatario());
        invoice.setValorTotal(dto.getValorTotal());
        invoice.setRawXmlHash(dto.getRawXmlHash());

        List<InvoiceItem> items = new ArrayList<>();
        for (InvoiceItemDTO itemDto : dto.getItems()) {
            InvoiceItem item = new InvoiceItem();
            item.setInvoice(invoice);
            item.setCodigoEAN(itemDto.getCodigoEAN());
            item.setCodigoInterno(itemDto.getCodigoInterno());
            item.setDescricao(itemDto.getDescricao());
            item.setNcm(itemDto.getNcm());
            item.setCfop(itemDto.getCfop());
            item.setQuantidade(itemDto.getQuantidade());
            item.setValorUnitario(itemDto.getValorUnitario());
            item.setValorTotal(itemDto.getValorTotal());
            item.setIcms(itemDto.getIcms());
            item.setPis(itemDto.getPis());
            item.setCofins(itemDto.getCofins());
            items.add(item);
        }
        invoice.setItems(items);

        return invoice;
    }
}
