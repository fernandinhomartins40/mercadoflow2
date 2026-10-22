import React from 'react';
import { useTeamPermission, type TeamArea } from '../../lib/teamPermissions';

/**
 * Aviso no topo da tela quando o papel da equipe não pode alterar nada nela.
 * Os botões principais também ficam desabilitados com a mesma frase no `title`.
 */
const RoleNotice: React.FC<{ area: TeamArea; what?: string }> = ({ area, what }) => {
  const perm = useTeamPermission();
  if (perm.can(area)) return null;
  return (
    <p role="note" className="fx-band" style={{ margin: 0, fontSize: 14.5 }}>
      <span>
        <strong>Só para ver.</strong> Seu papel na equipe ({perm.label}) não permite {what ?? 'mudar nada aqui'}. Fale com o dono da conta.
      </span>
    </p>
  );
};

export default RoleNotice;
