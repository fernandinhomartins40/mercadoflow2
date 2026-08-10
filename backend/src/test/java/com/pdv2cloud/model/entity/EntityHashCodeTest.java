package com.pdv2cloud.model.entity;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;

import java.util.UUID;
import org.junit.jupiter.api.Test;

/**
 * O ciclo Market.owner -> User.market -> Market fazia hashCode recorrer até
 * estourar a pilha, e toda ingestão de nota respondia 500. O teste monta
 * exatamente essa referência mútua: sem a proteção no equals/hashCode, ele
 * falha com StackOverflowError em vez de passar.
 */
class EntityHashCodeTest {

    @Test
    void hashCodeNaoRecorreEmRelacionamentoBidirecional() {
        Market mercado = new Market();
        mercado.setId(UUID.randomUUID());

        User dono = new User();
        dono.setId(UUID.randomUUID());

        // O ciclo que derrubava a aplicação.
        mercado.setOwner(dono);
        dono.setMarket(mercado);

        mercado.hashCode();
        dono.hashCode();
        mercado.toString();
        dono.toString();
    }

    @Test
    void igualdadeUsaApenasOId() {
        UUID id = UUID.randomUUID();

        User a = new User();
        a.setId(id);
        a.setName("Antes");

        User b = new User();
        b.setId(id);
        b.setName("Depois da edicao");

        // Mesma linha do banco, mesmo objeto de domínio — ainda que os demais
        // campos divirjam entre dois carregamentos.
        assertEquals(a, b);
        assertEquals(a.hashCode(), b.hashCode());

        User outro = new User();
        outro.setId(UUID.randomUUID());
        assertNotEquals(a, outro);
    }
}
