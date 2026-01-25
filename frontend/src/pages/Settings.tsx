import React, { useEffect, useMemo, useState } from 'react';
import Layout from '../components/layout/Layout';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const Settings: React.FC = () => {
  const { marketId, role } = useAuth();
  const [keys, setKeys] = useState<Array<{ id: string; name: string; keyPrefix: string; createdAt: string }>>([]);
  const [name, setName] = useState('');
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [manualMarketId, setManualMarketId] = useState('');
  const [markets, setMarkets] = useState<Array<{ id: string; name: string }>>([]);
  const [listError, setListError] = useState<string | null>(null);
  const apiBaseUrl = useMemo(() => window.location.origin, []);

  const loadKeys = async () => {
    const resolvedMarketId = marketId || manualMarketId;
    if (!resolvedMarketId) {
      setKeys([]);
      return;
    }
    try {
      const response = await api.get('/v1/agent-keys', { params: { marketId: resolvedMarketId } });
      setKeys(response.data || []);
      setListError(null);
    } catch (err: any) {
      setListError(err?.message || 'Falha ao carregar chaves');
    }
  };

  useEffect(() => {
    loadKeys();
  }, [marketId, manualMarketId]);

  useEffect(() => {
    const loadMarkets = async () => {
      if (role !== 'ADMIN' || marketId) {
        return;
      }
      try {
        const response = await api.get('/v1/markets');
        setMarkets(response.data || []);
      } catch {
        setMarkets([]);
      }
    };
    loadMarkets();
  }, [role, marketId]);

  const createKey = async () => {
    const resolvedMarketId = marketId || manualMarketId;
    if (!resolvedMarketId || !name.trim()) {
      setMessage('Informe um nome e o ID do supermercado');
      return;
    }
    const response = await api.post('/v1/agent-keys', { marketId: resolvedMarketId, name });
    setGeneratedKey(response.data.apiKey);
    setName('');
    setMessage('Chave criada com sucesso');
    await loadKeys();
  };

  return (
    <Layout>
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>Configuracoes</h3>
        <p>Controle de conta, preferencia e integracoes.</p>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>API Key do Coletor</h3>
        <p>Gere uma chave unica para conectar o PDV2Cloud Agent sem preencher varios campos.</p>
        <div className="card" style={{ background: 'rgba(15, 28, 36, 0.7)', marginBottom: 16 }}>
          <strong>URL da API:</strong>
          <div style={{ marginTop: 6 }}>{apiBaseUrl}</div>
          <span style={{ color: 'var(--muted)' }}>
            Use esta URL no desktop junto com a API Key.
          </span>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          {role === 'ADMIN' && !marketId && (
            <select
              className="input"
              value={manualMarketId}
              onChange={(e) => setManualMarketId(e.target.value)}
              style={{ maxWidth: 260 }}
            >
              <option value="">Selecione o supermercado</option>
              {markets.map((market) => (
                <option key={market.id} value={market.id}>
                  {market.name}
                </option>
              ))}
            </select>
          )}
          <input
            className="input"
            placeholder="Ex: Loja Centro"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ maxWidth: 280 }}
          />
          <button className="button" onClick={createKey}>
            Gerar API Key
          </button>
          {message && <span style={{ color: 'var(--muted)' }}>{message}</span>}
        </div>

        {generatedKey && (
          <div className="card" style={{ background: 'rgba(15, 28, 36, 0.8)', marginBottom: 16 }}>
            <strong>Copie esta chave agora (nao sera exibida novamente):</strong>
            <div style={{ marginTop: 8, wordBreak: 'break-all' }}>{generatedKey}</div>
          </div>
        )}

        <table className="table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Prefixo</th>
              <th>Criada em</th>
            </tr>
          </thead>
          <tbody>
            {keys.length === 0 ? (
              <tr>
                <td colSpan={3} style={{ color: 'var(--muted)' }}>
                  {listError || 'Nenhuma chave ativa encontrada.'}
                </td>
              </tr>
            ) : (
              keys.map((key) => (
                <tr key={key.id}>
                  <td>{key.name}</td>
                  <td>{key.keyPrefix}</td>
                  <td>{new Date(key.createdAt).toLocaleString('pt-BR')}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Layout>
  );
};

export default Settings;
