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
import com.pdv2cloud.util.DateUtils;
import java.math.BigDecimal;
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
    private MarketRepository marketRepository;

    @Autowired
    private ProductCatalogService productCatalogService;

    @Autowired
    private PriceIntelligenceService priceIntelligenceService;

    public IngestResponse processInvoice(InvoiceDTO dto, UUID marketId) {
        try {
            if (invoiceRepository.existsByChaveNFe(dto.getChaveNFe())) {
                return IngestResponse.duplicate(dto.getChaveNFe());
            }

            List<Product> products = productCatalogService.resolveProducts(dto.getItems(), marketId);
            Invoice invoice = mapToEntity(dto, marketId);
            invoice.setProcessedAt(LocalDateTime.now());

            for (int i = 0; i < invoice.getItems().size(); i++) {
                InvoiceItem item = invoice.getItems().get(i);
                item.setProduct(products.get(i));
            }

            Invoice savedInvoice = invoiceRepository.save(invoice);
            productCatalogService.recordInvoiceCatalogData(savedInvoice);
            try {
                priceIntelligenceService.recomputeFromInvoice(savedInvoice);
            } catch (Exception ignored) {
                log.warn("Price intelligence update failed for invoice {}", dto.getChaveNFe());
            }
            return IngestResponse.success(savedInvoice.getId(), dto.getChaveNFe());
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
            item.setValorDesconto(itemDto.getValorDesconto());
            item.setValorFrete(itemDto.getValorFrete());
            item.setValorOutros(itemDto.getValorOutros());
            item.setValorLiquido(resolveNetTotal(itemDto));
            item.setIcms(itemDto.getIcms());
            item.setPis(itemDto.getPis());
            item.setCofins(itemDto.getCofins());
            items.add(item);
        }
        invoice.setItems(items);

        return invoice;
    }

    private BigDecimal resolveNetTotal(InvoiceItemDTO itemDto) {
        if (itemDto.getValorLiquido() != null) {
            return itemDto.getValorLiquido();
        }
        BigDecimal gross = itemDto.getValorTotal() != null ? itemDto.getValorTotal() : BigDecimal.ZERO;
        BigDecimal discount = itemDto.getValorDesconto() != null ? itemDto.getValorDesconto() : BigDecimal.ZERO;
        BigDecimal freight = itemDto.getValorFrete() != null ? itemDto.getValorFrete() : BigDecimal.ZERO;
        BigDecimal others = itemDto.getValorOutros() != null ? itemDto.getValorOutros() : BigDecimal.ZERO;
        return gross.subtract(discount).add(freight).add(others);
    }
}
