package com.pdv2cloud.service.ai.chat;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Uma consulta que o modelo pode fazer aos dados da loja.
 *
 * ESTE É O PONTO CENTRAL DO "PERGUNTE AOS DADOS": o modelo não recebe os dados
 * da loja no prompt e não inventa números. Ele recebe a lista de ferramentas
 * disponíveis, escolhe qual chamar, e nós executamos a consulta de verdade
 * contra o banco. O número que ele cita é sempre um número que saiu daqui.
 *
 * Três regras que nenhuma implementação pode violar:
 *
 * <ol>
 *   <li><b>Somente leitura.</b> Nenhuma ferramenta escreve, apaga ou dispara
 *       ação. O pior que uma pergunta mal-intencionada consegue é ler o que o
 *       usuário já veria nas telas.</li>
 *   <li><b>Sempre no escopo do mercado.</b> O {@code marketId} vem do contexto
 *       autenticado, nunca dos argumentos que o modelo produz — senão bastaria
 *       o modelo alucinar um UUID para atravessar o isolamento entre lojas.</li>
 *   <li><b>Nada de dado pessoal.</b> Mesmo agregando, nenhuma ferramenta pode
 *       devolver CPF, CNPJ de destinatário ou chave de NFe. A camada de cliente
 *       só é exposta em números agregados, com o k-anonimato que a Fase 2 já
 *       aplica.</li>
 * </ol>
 */
public interface DataTool {

    /** Nome que o modelo usa para chamar. Curto, sem espaço, estável. */
    String name();

    /**
     * O que a ferramenta faz, na perspectiva de quem escolhe usá-la.
     *
     * É a única informação que o modelo tem para decidir. Uma descrição vaga
     * faz o modelo chamar a ferramenta errada e responder com o número errado —
     * o modo de falha mais caro deste recurso.
     */
    String description();

    /**
     * Parâmetros aceitos, em JSON Schema (formato da API da OpenAI).
     *
     * Deve ser restritivo: enumerar valores quando possível, marcar o que é
     * obrigatório. Schema frouxo devolve argumento inválido do modelo e vira
     * erro em tempo de execução.
     */
    Map<String, Object> parametersSchema();

    /**
     * Executa a consulta e devolve o resultado que voltará ao modelo.
     *
     * Deve devolver estrutura pequena e legível: o resultado inteiro entra no
     * contexto da próxima chamada e o cliente paga por esses tokens. Listas
     * longas devem vir truncadas com o total informado, não completas.
     *
     * Nunca lançar por falta de dado — devolver o mapa explicando a ausência é
     * mais útil ao modelo do que uma exceção, que só produz "não consegui".
     */
    Map<String, Object> execute(UUID marketId, Map<String, Object> arguments);

    /** Limite padrão de itens numa listagem, para não inflar o contexto. */
    int DEFAULT_LIMIT = 10;

    /** Teto absoluto, mesmo que o modelo peça mais. */
    int MAX_LIMIT = 25;

    /** Lê um inteiro dos argumentos do modelo, que podem vir como texto. */
    static int intArg(Map<String, Object> args, String key, int fallback) {
        Object raw = args == null ? null : args.get(key);
        if (raw instanceof Number n) {
            return n.intValue();
        }
        if (raw instanceof String s && !s.isBlank()) {
            try {
                return Integer.parseInt(s.trim());
            } catch (NumberFormatException ignored) {
                return fallback;
            }
        }
        return fallback;
    }

    static int limitArg(Map<String, Object> args) {
        return Math.min(MAX_LIMIT, Math.max(1, intArg(args, "limite", DEFAULT_LIMIT)));
    }

    static String stringArg(Map<String, Object> args, String key) {
        Object raw = args == null ? null : args.get(key);
        return raw == null || String.valueOf(raw).isBlank() ? null : String.valueOf(raw).trim();
    }

    /** Schema de um parâmetro numérico, para as implementações não repetirem. */
    static Map<String, Object> numberParam(String description) {
        return Map.of("type", "integer", "description", description);
    }

    static Map<String, Object> stringParam(String description) {
        return Map.of("type", "string", "description", description);
    }

    static Map<String, Object> enumParam(String description, List<String> values) {
        return Map.of("type", "string", "description", description, "enum", values);
    }

    /** Monta o schema completo no formato que a API espera. */
    static Map<String, Object> schema(Map<String, Object> properties, List<String> required) {
        return Map.of(
            "type", "object",
            "properties", properties,
            "required", required
        );
    }
}
