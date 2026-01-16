package com.pdv2cloud.model.dto;

import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class IngestResponse {
    private String status;
    private UUID invoiceId;
    private String chaveNFe;
    private String message;

    public static IngestResponse success(UUID invoiceId, String chaveNFe) {
        return new IngestResponse("SUCCESS", invoiceId, chaveNFe, "ok");
    }

    public static IngestResponse duplicate(String chaveNFe) {
        return new IngestResponse("DUPLICATE", null, chaveNFe, "duplicate");
    }

    public static IngestResponse error(String chaveNFe, String message) {
        return new IngestResponse("ERROR", null, chaveNFe, message);
    }
}
