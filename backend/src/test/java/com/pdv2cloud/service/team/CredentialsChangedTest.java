package com.pdv2cloud.service.team;

import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.pdv2cloud.service.PlanService;
import com.pdv2cloud.service.notify.EmailService;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;

/** SEG-05: troca de papel, desativação e transferência derrubam os tokens já emitidos. */
class CredentialsChangedTest {

    private final NamedParameterJdbcTemplate jdbc = mock(NamedParameterJdbcTemplate.class);
    private final TeamService team = new TeamService(jdbc, mock(PlanService.class), mock(EmailService.class), mock(PasswordEncoder.class));
    private final UUID root = UUID.randomUUID();
    private final UUID me = UUID.randomUUID();
    private final UUID member = UUID.randomUUID();

    private void memberIsManager() {
        Map<String, Object> row = new HashMap<>();
        row.put("id", member);
        row.put("role", "MARKET_MANAGER");
        row.put("team_role", "GERENTE");
        row.put("market_id", root);
        row.put("is_active", true);
        when(jdbc.queryForList(contains("from users u join markets m"), anyMap())).thenReturn(List.of(row));
    }

    @Test
    void desativarMembroGravaATrocaDeCredenciais() {
        memberIsManager();

        team.setActive(root, me, member, false);

        verify(jdbc).update(contains("credentials_changed_at = case when :a then credentials_changed_at else now() end"),
            eq(Map.of("a", false, "id", member)));
    }

    @Test
    void trocarPapelGravaATrocaDeCredenciais() {
        memberIsManager();

        team.change(root, me, member, "COMPRADOR", null);

        verify(jdbc).update(contains("credentials_changed_at = now()"), any(MapSqlParameterSource.class));
    }

    @Test
    void transferenciaAceitaDerrubaAsSessoesDoAntigoDono() {
        UUID transfer = UUID.randomUUID();
        UUID from = UUID.randomUUID();
        when(jdbc.queryForList(contains("from ownership_transfers"), anyMap()))
            .thenReturn(List.of(Map.of("id", transfer, "market_id", root, "from_user_id", from, "to_user_id", member)));
        when(jdbc.queryForObject(contains("select email from users"), anyMap(), eq(String.class))).thenReturn("antigo@loja.com");

        team.decideTransfer(transfer, member, true);

        verify(jdbc).update(contains("role = 'MARKET_MANAGER', team_role = 'GERENTE'"), eq(Map.of("id", from)));
        verify(jdbc).update(contains("credentials_changed_at = now() where id = :id"), eq(Map.of("id", from)));
    }
}
