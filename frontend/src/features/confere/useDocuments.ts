import { useEffect, useState } from 'react';
import { confereService } from '../../services/confere.service';
import type { DocumentSummary } from '../../types/confere.types';

/** Notas do mercado, guardadas no celular: sem sinal na doca, a lista continua aparecendo. */
export const useDocuments = (marketId: string) => {
  const cacheKey = `confere:docs:${marketId}`;
  const [docs, setDocs] = useState<DocumentSummary[] | null>(() => {
    try { const v = localStorage.getItem(cacheKey); return v ? (JSON.parse(v) as DocumentSummary[]) : null; } catch { return null; }
  });
  useEffect(() => {
    confereService.documents(marketId).then((d) => {
      setDocs(d);
      try { localStorage.setItem(cacheKey, JSON.stringify(d)); } catch { /* cheio ou bloqueado */ }
    }).catch(() => setDocs((prev) => prev ?? []));
  }, [marketId, cacheKey]);
  return docs;
};
