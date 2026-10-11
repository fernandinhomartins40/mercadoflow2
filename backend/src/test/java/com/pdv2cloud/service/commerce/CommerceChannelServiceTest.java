package com.pdv2cloud.service.commerce;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.pdv2cloud.service.commerce.CommerceChannelService.Agreement;
import com.pdv2cloud.service.commerce.CommerceChannelService.Decision;
import com.pdv2cloud.service.commerce.CommerceChannelService.Owner;
import com.pdv2cloud.service.commerce.CommerceChannelService.Rules;
import com.pdv2cloud.service.commerce.CommerceChannelService.SellerRow;
import com.pdv2cloud.service.commerce.CommerceChannelService.Store;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;

/**
 * O motor de canal é o que garante os contratos de distribuição: um erro aqui
 * faz a indústria vender por cima do distribuidor exclusivo. Cada cenário da
 * tabela da seção 5 de docs/PROPOSTA-MERCADOFLOW-VENDAS.md tem um teste.
 */
class CommerceChannelServiceTest {

    static final String GTIN = "7891000100103";
    static final String CAMPINAS = "3509502";

    NamedParameterJdbcTemplate jdbc;
    CommerceChannelService channel;
    Rules rules;
    SellerRow industry;
    SellerRow exclusiveDistributor;
    SellerRow otherDistributor;
    Store campinas;
    Store recife;
    Store noAddress;

    @BeforeEach
    void setUp() {
        jdbc = mock(NamedParameterJdbcTemplate.class);
        when(jdbc.queryForList(anyString(), any(SqlParameterSource.class), eq(String.class))).thenReturn(List.of());
        channel = new CommerceChannelService(jdbc);
        rules = new Rules();
        industry = seller("INDUSTRIA", "11111111000111", "Indústria X", "MISTO");
        exclusiveDistributor = seller("DISTRIBUIDOR", "22222222000122", "Distribuidor SP", "DIRETO");
        otherDistributor = seller("DISTRIBUIDOR", "33333333000133", "Atacado Y", "DIRETO");
        rules.owners.put(GTIN, new Owner(industry.id(), "MARCA X"));
        campinas = store("33333333000199", "", "SP", CAMPINAS, "Campinas");
        recife = store("44444444000199", "", "PE", "2611606", "Recife");
        noAddress = store("55555555000199", "", null, null, null);
    }

    SellerRow seller(String kind, String cnpj, String name, String mode) {
        SellerRow s = new SellerRow(UUID.randomUUID(), kind, cnpj, name, "ATIVO", mode, List.of(), List.of());
        rules.sellers.put(s.id(), s);
        rules.sellerByCnpj.put(cnpj, s.id());
        return s;
    }

    static Store store(String cnpj, String parentCnpj, String uf, String cityCode, String city) {
        return new Store(UUID.randomUUID(), "Loja", cnpj, parentCnpj, uf, cityCode, city, true, true);
    }

    void agreement(SellerRow distributor, boolean exclusive, boolean blockOthers, List<String> ufs) {
        Agreement a = new Agreement(UUID.randomUUID(), industry.id(), distributor.id(), distributor.cnpj(), distributor.name(), exclusive,
            blockOthers, ufs, List.of(), List.of(), List.of(), LocalDate.now().minusDays(10), null);
        rules.agreements.computeIfAbsent(industry.id(), k -> new ArrayList<>()).add(a);
    }

    @Test
    void semAcordoAIndustriaVendeDireto() {
        Decision d = channel.decide(rules, industry, campinas, GTIN, null);
        assertTrue(d.allowed());
        assertEquals("DIRETO", d.channel());
    }

    @Test
    void areaExclusivaLevaAPropostaDaIndustriaAoDistribuidor() {
        agreement(exclusiveDistributor, true, false, List.of("SP"));
        Decision d = channel.decide(rules, industry, campinas, GTIN, null);
        assertTrue(d.allowed());
        assertEquals("DISTRIBUIDOR", d.channel());
        assertEquals(exclusiveDistributor.id(), d.fulfillingSellerId());
        assertEquals("22222222000122", d.distributorCnpj());
    }

    @Test
    void foraDaAreaExclusivaAIndustriaVendeDireto() {
        agreement(exclusiveDistributor, true, false, List.of("SP"));
        Decision d = channel.decide(rules, industry, recife, GTIN, null);
        assertEquals("DIRETO", d.channel());
    }

    @Test
    void contaDiretaPassaPorCimaDaExclusividade() {
        agreement(exclusiveDistributor, true, false, List.of("SP"));
        rules.directAccounts.put(industry.id(), new HashSet<>(Set.of(campinas.cnpj())));
        Decision d = channel.decide(rules, industry, campinas, GTIN, null);
        assertEquals("DIRETO", d.channel());
        assertEquals("CONTA_DIRETA", d.code());
    }

    @Test
    void contaDiretaValePelaRede() {
        agreement(exclusiveDistributor, true, false, List.of("SP"));
        Store filial = store("66666666000199", "77777777000199", "SP", CAMPINAS, "Campinas");
        rules.directAccounts.put(industry.id(), new HashSet<>(Set.of("77777777000199")));
        assertEquals("CONTA_DIRETA", channel.decide(rules, industry, filial, GTIN, null).code());
    }

    @Test
    void distribuidorExclusivoVendeNaArea() {
        agreement(exclusiveDistributor, true, false, List.of("SP"));
        Decision d = channel.decide(rules, exclusiveDistributor, campinas, GTIN, null);
        assertEquals("DIRETO", d.channel());
        assertEquals("DISTRIBUIDOR_EXCLUSIVO", d.code());
    }

    @Test
    void outroDistribuidorSoEBarradoQuandoOAcordoPede() {
        agreement(exclusiveDistributor, true, false, List.of("SP"));
        assertTrue(channel.decide(rules, otherDistributor, campinas, GTIN, null).allowed());

        rules.agreements.clear();
        agreement(exclusiveDistributor, true, true, List.of("SP"));
        Decision d = channel.decide(rules, otherDistributor, campinas, GTIN, null);
        assertFalse(d.allowed());
        assertEquals("AREA_EXCLUSIVA", d.code());
    }

    @Test
    void lojaSemEnderecoComAreaExclusivaFicaDeFora() {
        agreement(exclusiveDistributor, true, false, List.of("SP"));
        Decision d = channel.decide(rules, industry, noAddress, GTIN, null);
        assertFalse(d.allowed());
        assertEquals("SEM_LOCALIZACAO", d.code());
    }

    @Test
    void industriaQueSoVendePorDistribuidorSemDistribuidorNaoChega() {
        SellerRow viaDistributor = new SellerRow(industry.id(), "INDUSTRIA", industry.cnpj(), industry.name(), "ATIVO", "DISTRIBUIDOR",
            List.of(), List.of());
        rules.sellers.put(industry.id(), viaDistributor);
        Decision d = channel.decide(rules, viaDistributor, recife, GTIN, null);
        assertFalse(d.allowed());
        assertEquals("SEM_DISTRIBUIDOR", d.code());

        agreement(otherDistributor, false, false, List.of());
        Decision via = channel.decide(rules, viaDistributor, recife, GTIN, null);
        assertEquals("DISTRIBUIDOR", via.channel());
        assertEquals(otherDistributor.id(), via.fulfillingSellerId());
    }

    @Test
    void distribuidorForaDaPlataformaFicaSoComCnpj() {
        Agreement a = new Agreement(UUID.randomUUID(), industry.id(), null, "88888888000188", "Distribuidor de fora", true, false,
            List.of("SP"), List.of(), List.of(), List.of(), LocalDate.now().minusDays(1), null);
        rules.agreements.put(industry.id(), new ArrayList<>(List.of(a)));
        Decision d = channel.decide(rules, industry, campinas, GTIN, null);
        assertEquals("DISTRIBUIDOR", d.channel());
        assertNull(d.fulfillingSellerId());
        assertEquals("88888888000188", d.distributorCnpj());
    }

    @Test
    void lojaQueBloqueouNaoRecebe() {
        Decision d = channel.decide(rules, industry, campinas, GTIN, "BLOQUEADA");
        assertFalse(d.allowed());
        assertEquals("LOJA_BLOQUEOU", d.code());
    }

    @Test
    void foraDaAreaDeEntregaDoVendedorNaoChega() {
        SellerRow regional = new SellerRow(UUID.randomUUID(), "DISTRIBUIDOR", "99999999000199", "Regional", "ATIVO", "DIRETO",
            List.of("PE"), List.of());
        assertFalse(channel.decide(rules, regional, campinas, GTIN, null).allowed());
        assertTrue(channel.decide(rules, regional, recife, GTIN, null).allowed());
    }

    @Test
    void acordoPorMarcaSoValeParaAMarca() {
        Agreement a = new Agreement(UUID.randomUUID(), industry.id(), exclusiveDistributor.id(), exclusiveDistributor.cnpj(),
            exclusiveDistributor.name(), true, false, List.of("SP"), List.of(), List.of("OUTRA MARCA"), List.of(),
            LocalDate.now().minusDays(1), null);
        rules.agreements.put(industry.id(), new ArrayList<>(List.of(a)));
        assertEquals("DIRETO", channel.decide(rules, industry, campinas, GTIN, null).channel());
    }

    @Test
    void campanhaComProdutosEmCanaisDiferentesNaoSai() {
        String other = "7891000200209";
        rules.owners.put(other, new Owner(industry.id(), "OUTRA MARCA"));
        Agreement a = new Agreement(UUID.randomUUID(), industry.id(), exclusiveDistributor.id(), exclusiveDistributor.cnpj(),
            exclusiveDistributor.name(), true, false, List.of("SP"), List.of(), List.of("MARCA X"), List.of(),
            LocalDate.now().minusDays(1), null);
        rules.agreements.put(industry.id(), new ArrayList<>(List.of(a)));
        Decision d = channel.decideAll(rules, industry, campinas, List.of(GTIN, other), null);
        assertFalse(d.allowed());
        assertEquals("CANAIS_DIFERENTES", d.code());
    }
}
