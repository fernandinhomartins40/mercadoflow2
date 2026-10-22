import React from 'react';
import { Card } from '../flow/Flow';

/**
 * Falha ao carregar: diz o que houve e oferece "Tentar de novo".
 *
 * Mesmo desenho do Decidir. Use no lugar do estado vazio quando a busca falhou:
 * "ainda não há dado" e "não deu para buscar" não podem parecer a mesma coisa.
 */
interface LoadErrorProps {
  /** O que não carregou (ex.: "os produtos"). */
  what?: string;
  /** Frase do erro (já vem clara do api.ts). */
  error?: unknown;
  onRetry?: () => void;
  /** Versão em linha, sem cartão (para dentro de um painel). */
  inline?: boolean;
}

export const errorText = (error: unknown): string | null => {
  if (!error) return null;
  const m = (error as { message?: unknown })?.message;
  return typeof m === 'string' && m.trim() ? m : null;
};

const LoadError: React.FC<LoadErrorProps> = ({ what, error, onRetry, inline = false }) => {
  const title = what ? `Não foi possível carregar ${what}` : 'Não foi possível carregar agora';
  const detail = errorText(error) ?? 'Confira a internet e tente de novo.';
  const body = (
    <>
      <h2 className="fx-section-title" style={{ margin: 0 }}>{title}</h2>
      <p className="fx-muted" style={{ margin: '6px 0 12px' }}>{detail}</p>
      {onRetry && <button type="button" className="fx-btn dark" style={{ minHeight: 44 }} onClick={onRetry}>Tentar de novo</button>}
    </>
  );
  if (inline) return <div role="alert" style={{ textAlign: 'center', padding: '20px 8px' }}>{body}</div>;
  return <Card role="alert" style={{ textAlign: 'center', padding: 36 }}>{body}</Card>;
};

export default LoadError;
