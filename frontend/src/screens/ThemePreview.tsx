import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { ArtTheme, FormatKey } from '../types/art.types';
import { FORMATS, sampleItems } from '../features/art-studio/formats';
import { buildScene } from '../features/art-studio/scene';
import { renderScene } from '../features/art-studio/render';

/**
 * Encarte completo de um tema com produtos de exemplo, desenhado pelo mesmo
 * motor da prévia e da exportação. O MCP do Codex abre esta página num
 * navegador sem janela e tira um print, para a IA ver o resultado de verdade.
 *
 * A chave vai depois do "#": o navegador não manda essa parte para o servidor,
 * então ela não aparece em log. Parâmetros: chave, formato, produtos (1 a 16),
 * destaque (1/0), fotos (1/0).
 */
const ThemePreview: React.FC = () => {
  const { id } = useParams();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | string>('loading');

  useEffect(() => {
    const q = new URLSearchParams(window.location.hash.slice(1));
    const key = q.get('chave') ?? '';
    const format = (q.get('formato') ?? 'post') as FormatKey;
    const count = Math.max(1, Math.min(16, Number(q.get('produtos')) || 6));
    if (!FORMATS[format]) { setState(`Formato inválido: ${format}`); return; }
    (async () => {
      const res = await fetch(`/api/v1/temas-api/themes/${id}`, { headers: { Authorization: `Bearer ${key}` } });
      if (!res.ok) throw new Error(res.status === 401 ? 'Chave inválida' : `Erro ${res.status} ao abrir o tema`);
      const theme = (await res.json()) as ArtTheme;
      const scene = await buildScene({
        theme, format, items: sampleItems(count, q.get('destaque') !== '0', q.get('fotos') !== '0'),
        brand: { displayName: 'Seu Mercado', addressLine: 'Rua das Flores, 120', whatsapp: '(11) 98888-7777' },
        validFrom: '2026-10-01', validUntil: '2026-10-05', showSeal: true,
      });
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;
      canvas.width = scene.width;
      canvas.height = scene.height;
      renderScene(ctx, scene);
      setState('ready');
    })().catch((e) => setState(e instanceof Error ? e.message : String(e)));
  }, [id]);

  return (
    <div style={{ margin: 0, width: '100vw', height: '100vh', background: '#ffffff', overflow: 'hidden' }} data-state={state}>
      {state !== 'loading' && state !== 'ready' && <p style={{ font: '24px sans-serif', color: '#b91c1c', padding: 24 }}>{state}</p>}
      <canvas ref={canvasRef} aria-label="Prévia do encarte" style={{ display: 'block', width: '100%', height: '100%' }} />
    </div>
  );
};

export default ThemePreview;
