import { Outlet } from 'react-router-dom';
import './panel-bundle.css';

/**
 * Rota-pai sem caminho que carrega o CSS do painel (lazy). O encarte público e o
 * Bipaê ficam fora dela e baixam só o CSS global, que é bem menor (abrem no 4G).
 */
const PanelStyles = () => <Outlet />;

export default PanelStyles;
