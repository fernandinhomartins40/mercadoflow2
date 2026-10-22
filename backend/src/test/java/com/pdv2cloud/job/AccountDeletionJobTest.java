package com.pdv2cloud.job;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.pdv2cloud.service.account.AccountAnonymizer;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** LGPD-03: o job processa os vencidos; um pedido com erro não impede os outros nem fica DONE. */
class AccountDeletionJobTest {

    @Test
    void anonimizaOsVencidosEMascaraAsNotasDaLojaAntes() {
        AccountAnonymizer anonymizer = mock(AccountAnonymizer.class);
        LocalDateTime now = LocalDateTime.of(2026, 11, 21, 1, 15);
        UUID root = UUID.randomUUID();
        AccountAnonymizer.Due loja = new AccountAnonymizer.Due(UUID.randomUUID(), UUID.randomUUID(), root, "STORE");
        AccountAnonymizer.Due falha = new AccountAnonymizer.Due(UUID.randomUUID(), UUID.randomUUID(), null, "USER");
        AccountAnonymizer.Due membro = new AccountAnonymizer.Due(UUID.randomUUID(), UUID.randomUUID(), null, "USER");
        when(anonymizer.due(now)).thenReturn(List.of(loja, falha, membro));
        when(anonymizer.network(root)).thenReturn(List.of(root));
        when(anonymizer.anonymize(loja.id(), now)).thenReturn(true);
        when(anonymizer.anonymize(falha.id(), now)).thenThrow(new RuntimeException("falhou"));
        when(anonymizer.anonymize(membro.id(), now)).thenReturn(true);

        int done = new AccountDeletionJob(anonymizer).run(now);

        assertEquals(2, done);
        verify(anonymizer).maskInvoices(List.of(root));
    }

    @Test
    void semPedidoVencidoNaoFazNada() {
        AccountAnonymizer anonymizer = mock(AccountAnonymizer.class);
        LocalDateTime now = LocalDateTime.of(2026, 11, 21, 1, 15);
        when(anonymizer.due(now)).thenReturn(List.of());

        assertEquals(0, new AccountDeletionJob(anonymizer).run(now));
        verify(anonymizer, never()).anonymize(any(), any());
    }
}
