package com.pdv2cloud.service.ai;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

/**
 * Garantias da custódia das chaves de API dos clientes.
 *
 * Cada teste aqui protege uma propriedade que, se quebrada, expõe a credencial
 * de um terceiro — quem paga a conta do provedor é o cliente, não nós.
 */
class AiCredentialCipherTest {

    private static final String MASTER = "segredo-de-teste-com-tamanho-razoavel";

    @Test
    void cifraEDecifraDeVolta() {
        AiCredentialCipher cipher = new AiCredentialCipher(MASTER);
        String apiKey = "gsk_exemplo_de_chave_do_groq_1234567890";

        String stored = cipher.encrypt(apiKey);

        assertNotEquals(apiKey, stored, "a chave não pode ficar em claro");
        assertFalse(stored.contains(apiKey), "o texto cifrado não pode conter a chave");
        assertEquals(apiKey, cipher.decrypt(stored));
    }

    /**
     * GCM exige IV único por operação: reusar IV com a mesma chave quebra a
     * cifra por completo. Dois ciphertexts iguais para o mesmo texto seriam a
     * evidência de que o IV está fixo.
     */
    @Test
    void mesmaChaveProduzCiphertextsDiferentes() {
        AiCredentialCipher cipher = new AiCredentialCipher(MASTER);
        String apiKey = "sk-mesma-chave-cifrada-duas-vezes";

        assertNotEquals(cipher.encrypt(apiKey), cipher.encrypt(apiKey));
    }

    /** Chave mestra diferente não decifra: é o que protege um dump de banco. */
    @Test
    void outraChaveMestraNaoDecifra() {
        String stored = new AiCredentialCipher(MASTER).encrypt("sk-secreta");
        AiCredentialCipher outra = new AiCredentialCipher("outro-segredo-qualquer");

        assertThrows(IllegalStateException.class, () -> outra.decrypt(stored));
    }

    /** GCM é autenticado: ciphertext adulterado falha em vez de devolver lixo. */
    @Test
    void ciphertextAdulteradoFalha() {
        AiCredentialCipher cipher = new AiCredentialCipher(MASTER);
        String stored = cipher.encrypt("sk-integridade");

        int sep = stored.indexOf(':');
        String payload = stored.substring(sep + 1);
        char first = payload.charAt(0);
        String adulterado = stored.substring(0, sep + 1)
            + (first == 'A' ? 'B' : 'A') + payload.substring(1);

        assertThrows(IllegalStateException.class, () -> cipher.decrypt(adulterado));
    }

    /**
     * Sem chave mestra o BYOK fica indisponível — e deve ficar. Guardar chave
     * de cliente em claro "só por enquanto" é pior que não oferecer o recurso.
     */
    @Test
    void semChaveMestraNaoCifra() {
        AiCredentialCipher cipher = new AiCredentialCipher("");

        assertFalse(cipher.isConfigured());
        assertThrows(IllegalStateException.class, () -> cipher.encrypt("sk-qualquer"));
    }

    @Test
    void hintRevelaApenasOsUltimosQuatroCaracteres() {
        AiCredentialCipher cipher = new AiCredentialCipher(MASTER);
        String apiKey = "gsk_chave_longa_do_cliente_ABCD";

        String hint = cipher.hint(apiKey);

        assertEquals("****ABCD", hint);
        assertFalse(apiKey.startsWith(hint), "o hint não pode revelar o prefixo");
    }

    @Test
    void hintDeChaveCurtaNaoVazaNada() {
        assertEquals("****", new AiCredentialCipher(MASTER).hint("ab"));
    }

    @Test
    void formatoInvalidoNaoDecifra() {
        AiCredentialCipher cipher = new AiCredentialCipher(MASTER);
        assertThrows(IllegalStateException.class, () -> cipher.decrypt("sem-separador"));
    }

    @Test
    void chaveMestraConfiguradaHabilitaOByok() {
        assertTrue(new AiCredentialCipher(MASTER).isConfigured());
    }
}
