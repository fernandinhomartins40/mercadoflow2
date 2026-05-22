package com.pdv2cloud.controller;

import com.pdv2cloud.model.dto.SupplierOrderDTO;
import com.pdv2cloud.model.dto.SupplierOrderItemDTO;
import com.pdv2cloud.service.SupplierOrderService;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/markets/{marketId}/supplier-orders")
public class SupplierOrderController {

    private final SupplierOrderService service;

    public SupplierOrderController(SupplierOrderService service) {
        this.service = service;
    }

    @GetMapping
    public List<SupplierOrderDTO> list(
            @PathVariable UUID marketId,
            @RequestParam(required = false) String status) {
        return service.listOrders(marketId, status);
    }

    @GetMapping("/{orderId}")
    public SupplierOrderDTO get(
            @PathVariable UUID marketId,
            @PathVariable UUID orderId) {
        return service.getOrder(marketId, orderId);
    }

    @PostMapping
    public ResponseEntity<SupplierOrderDTO> create(
            @PathVariable UUID marketId,
            @RequestBody Map<String, Object> body) {
        UUID supplierId = UUID.fromString(body.get("supplierId").toString());
        String notes = body.containsKey("notes") ? (String) body.get("notes") : null;
        SupplierOrderDTO dto = service.createOrder(marketId, supplierId, notes);
        return ResponseEntity.status(201).body(dto);
    }

    @PatchMapping("/{orderId}/notes")
    public SupplierOrderDTO updateNotes(
            @PathVariable UUID marketId,
            @PathVariable UUID orderId,
            @RequestBody Map<String, Object> body) {
        String notes = body.containsKey("notes") ? (String) body.get("notes") : null;
        return service.updateNotes(marketId, orderId, notes);
    }

    @PostMapping("/{orderId}/items")
    public ResponseEntity<SupplierOrderItemDTO> addItem(
            @PathVariable UUID marketId,
            @PathVariable UUID orderId,
            @RequestBody Map<String, Object> body) {
        UUID productId = UUID.fromString(body.get("productId").toString());
        BigDecimal qty = new BigDecimal(body.get("quantityRequested").toString());
        String unitType = body.containsKey("unitType") ? (String) body.get("unitType") : "UN";
        BigDecimal unitsPerPack = body.containsKey("unitsPerPack") && body.get("unitsPerPack") != null
            ? new BigDecimal(body.get("unitsPerPack").toString()) : null;
        BigDecimal unitCost = new BigDecimal(body.get("unitCost").toString());
        BigDecimal unitSalePrice = body.containsKey("unitSalePrice") && body.get("unitSalePrice") != null
            ? new BigDecimal(body.get("unitSalePrice").toString()) : null;
        String note = body.containsKey("note") ? (String) body.get("note") : null;

        SupplierOrderItemDTO dto = service.addItem(
            marketId, orderId, productId, qty, unitType, unitsPerPack, unitCost, unitSalePrice, note);
        return ResponseEntity.status(201).body(dto);
    }

    @PatchMapping("/{orderId}/items/{itemId}")
    public SupplierOrderItemDTO updateItem(
            @PathVariable UUID marketId,
            @PathVariable UUID orderId,
            @PathVariable UUID itemId,
            @RequestBody Map<String, Object> body) {
        BigDecimal qty = body.containsKey("quantityRequested") && body.get("quantityRequested") != null
            ? new BigDecimal(body.get("quantityRequested").toString()) : null;
        String unitType = body.containsKey("unitType") ? (String) body.get("unitType") : null;
        BigDecimal unitsPerPack = body.containsKey("unitsPerPack") && body.get("unitsPerPack") != null
            ? new BigDecimal(body.get("unitsPerPack").toString()) : null;
        BigDecimal unitCost = body.containsKey("unitCost") && body.get("unitCost") != null
            ? new BigDecimal(body.get("unitCost").toString()) : null;
        BigDecimal unitSalePrice = body.containsKey("unitSalePrice") && body.get("unitSalePrice") != null
            ? new BigDecimal(body.get("unitSalePrice").toString()) : null;
        String note = body.containsKey("note") ? (String) body.get("note") : null;

        return service.updateItem(marketId, orderId, itemId, qty, unitType, unitsPerPack, unitCost, unitSalePrice, note);
    }

    @DeleteMapping("/{orderId}/items/{itemId}")
    public ResponseEntity<Void> removeItem(
            @PathVariable UUID marketId,
            @PathVariable UUID orderId,
            @PathVariable UUID itemId) {
        service.removeItem(marketId, orderId, itemId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{orderId}/send")
    public SupplierOrderDTO send(
            @PathVariable UUID marketId,
            @PathVariable UUID orderId) {
        return service.sendOrder(marketId, orderId);
    }

    @PostMapping("/{orderId}/receive")
    public SupplierOrderDTO receive(
            @PathVariable UUID marketId,
            @PathVariable UUID orderId,
            @RequestBody(required = false) Map<String, Object> body) {
        List<Map<String, Object>> items = null;
        LocalDateTime receivedAt = null;
        if (body != null) {
            if (body.containsKey("items")) {
                items = (List<Map<String, Object>>) body.get("items");
            }
            if (body.containsKey("receivedAt") && body.get("receivedAt") != null) {
                receivedAt = LocalDateTime.parse(body.get("receivedAt").toString());
            }
        }
        return service.receiveOrder(marketId, orderId, items, receivedAt);
    }

    @PostMapping("/{orderId}/cancel")
    public SupplierOrderDTO cancel(
            @PathVariable UUID marketId,
            @PathVariable UUID orderId,
            @RequestBody(required = false) Map<String, Object> body) {
        String reason = (body != null && body.containsKey("reason")) ? (String) body.get("reason") : null;
        return service.cancelOrder(marketId, orderId, reason);
    }

    @DeleteMapping("/{orderId}")
    public ResponseEntity<Void> delete(
            @PathVariable UUID marketId,
            @PathVariable UUID orderId) {
        service.deleteOrder(marketId, orderId);
        return ResponseEntity.noContent().build();
    }
}
