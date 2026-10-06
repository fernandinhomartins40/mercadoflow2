import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Cache de dados da tela no navegador ("stale-while-revalidate").
 *
 * Voltar a uma tela mostra na hora o último dado que ela teve e atualiza em
 * segundo plano; duas chamadas iguais ao mesmo tempo viram uma. A chave sempre
 * inclui o mercado, então dados de uma loja nunca aparecem em outra, e o cache
 * é limpo ao sair da conta.
 */

interface Entry { data: unknown; at: number }

const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();
const listeners = new Map<string, Set<() => void>>();

const notify = (key: string) => listeners.get(key)?.forEach((fn) => fn());

/** Busca com deduplicação; grava no cache e avisa quem está olhando a chave. */
export const fetchCached = <T,>(key: string, fetcher: () => Promise<T>): Promise<T> => {
  const running = inflight.get(key);
  if (running) return running as Promise<T>;
  const p = fetcher()
    .then((data) => { cache.set(key, { data, at: Date.now() }); notify(key); return data; })
    .finally(() => { inflight.delete(key); });
  inflight.set(key, p);
  return p;
};

/** Marca como velhas as chaves que começam com o prefixo (ex.: depois de decidir). */
export const invalidateCached = (prefix: string) => {
  cache.forEach((e, k) => { if (k.startsWith(prefix)) e.at = 0; });
};

/** Ao sair da conta. */
export const clearCached = () => { cache.clear(); inflight.clear(); };

export interface Cached<T> {
  data: T | undefined;
  /** Só é true quando ainda não há nada para mostrar. */
  loading: boolean;
  error: unknown;
  /** Busca de novo agora (ignora o tempo de frescor). */
  refresh: () => Promise<T | undefined>;
}

/**
 * @param key      null desliga a busca (ex.: sem mercado ainda)
 * @param staleMs  por quanto tempo o dado conta como fresco e não é buscado de novo
 */
export function useCached<T>(key: string | null, fetcher: () => Promise<T>, staleMs = 60_000): Cached<T> {
  const hit = key ? cache.get(key) : undefined;
  const [data, setData] = useState<T | undefined>(hit?.data as T | undefined);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(!!key && !hit);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const refresh = useCallback(async () => {
    if (!key) return undefined;
    try {
      const v = await fetchCached(key, () => fetcherRef.current());
      setError(null);
      return v;
    } catch (e) {
      setError(e);
      return undefined;
    } finally {
      setLoading(false);
    }
  }, [key]);

  useEffect(() => {
    if (!key) { setData(undefined); setLoading(false); return undefined; }
    const sync = () => setData(cache.get(key)?.data as T | undefined);
    const set = listeners.get(key) ?? new Set();
    set.add(sync);
    listeners.set(key, set);
    const entry = cache.get(key);
    setData(entry?.data as T | undefined);
    setLoading(!entry);
    if (!entry || Date.now() - entry.at > staleMs) void refresh();
    return () => { set.delete(sync); };
  }, [key, staleMs, refresh]);

  return { data, loading, error, refresh };
}
