/**
 * Fontes e imagens da arte.
 *
 * A arte é desenhada num canvas e exportada em PNG/PDF. Duas regras vêm daí:
 * a fonte precisa estar carregada antes de desenhar (senão o canvas usa a
 * padrão e a arte muda depois), e toda imagem precisa ser da mesma origem
 * (senão o canvas fica "sujo" e o navegador bloqueia a exportação). Imagem de
 * outro site passa pelo proxy do backend e vira blob local.
 */

export const FONT_PRICE = '"Anton", "Impact", "Arial Narrow", sans-serif';
export const FONT_NAME = '"Barlow Condensed", "Arial Narrow", sans-serif';
export const FONT_TEXT = '"Barlow", "Inter", Arial, sans-serif';

const FONT_HREF = 'https://fonts.googleapis.com/css2?family=Anton&family=Barlow+Condensed:wght@500;600;700;800&family=Barlow:wght@500;600;700&display=swap';

let fontsReady: Promise<void> | null = null;

export const ensureFonts = (): Promise<void> => {
  if (fontsReady) return fontsReady;
  fontsReady = (async () => {
    if (typeof document === 'undefined') return;
    if (!document.querySelector(`link[data-art-fonts]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = FONT_HREF;
      link.dataset.artFonts = '1';
      document.head.appendChild(link);
      await new Promise<void>((resolve) => {
        link.onload = () => resolve();
        link.onerror = () => resolve();
        setTimeout(resolve, 4000);
      });
    }
    try {
      await Promise.race([
        Promise.all([
          document.fonts.load('40px "Anton"'),
          document.fonts.load('700 40px "Barlow Condensed"'),
          document.fonts.load('800 40px "Barlow Condensed"'),
          document.fonts.load('500 40px "Barlow Condensed"'),
          document.fonts.load('600 40px "Barlow"'),
        ]),
        new Promise((resolve) => setTimeout(resolve, 5000)),
      ]);
    } catch {
      // Sem internet para a fonte: desenha com a alternativa da pilha.
    }
  })();
  return fontsReady;
};

const cache = new Map<string, Promise<HTMLImageElement | null>>();

const sameOrigin = (url: string) => {
  if (url.startsWith('blob:') || url.startsWith('data:')) return true;
  try {
    return new URL(url, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
};

const fromSrc = (src: string) => new Promise<HTMLImageElement | null>((resolve) => {
  const img = new Image();
  img.decoding = 'async';
  img.onload = () => resolve(img);
  img.onerror = () => resolve(null);
  img.src = src;
});

/**
 * @param proxy busca a imagem de outro site pelo backend; sem ele, imagem de
 *              fora é ignorada (melhor um cartão sem foto do que exportação quebrada)
 */
export const loadImage = (url: string | null | undefined, proxy?: (url: string) => Promise<Blob>): Promise<HTMLImageElement | null> => {
  if (!url) return Promise.resolve(null);
  const cached = cache.get(url);
  if (cached) return cached;
  let promise: Promise<HTMLImageElement | null>;
  if (sameOrigin(url)) {
    promise = fromSrc(url);
  } else if (proxy && /^https?:\/\//i.test(url)) {
    promise = proxy(url)
      .then((blob) => (blob && blob.type.startsWith('image/') ? fromSrc(URL.createObjectURL(blob)) : null))
      .catch(() => null);
  } else {
    promise = Promise.resolve(null);
  }
  cache.set(url, promise);
  // Falha não fica em cache: a próxima tentativa pode dar certo.
  promise.then((img) => { if (!img) cache.delete(url); });
  return promise;
};

/**
 * Espera a imagem até {@code ms}; depois segue sem ela. Uma foto lenta de
 * site externo não pode segurar a arte inteira (ela entra na próxima montagem,
 * quando já estiver em cache).
 */
export const loadImageWithin = (url: string | null | undefined, ms: number, proxy?: (url: string) => Promise<Blob>) =>
  Promise.race([loadImage(url, proxy), new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);

/** Luminância média (0 a 1) de um trecho da imagem: decide texto claro ou escuro. */
const lumCache = new WeakMap<HTMLImageElement, Map<string, number>>();
export const regionLuminance = (img: HTMLImageElement, r: { x: number; y: number; w: number; h: number }): number => {
  const key = `${r.x.toFixed(3)}:${r.y.toFixed(3)}:${r.w.toFixed(3)}:${r.h.toFixed(3)}`;
  let map = lumCache.get(img);
  if (!map) { map = new Map(); lumCache.set(img, map); }
  const hit = map.get(key);
  if (hit !== undefined) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = 24;
  canvas.height = 12;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let value = 1;
  if (ctx) {
    const sx = r.x * img.naturalWidth;
    const sy = r.y * img.naturalHeight;
    ctx.drawImage(img, sx, sy, Math.max(1, r.w * img.naturalWidth), Math.max(1, r.h * img.naturalHeight), 0, 0, 24, 12);
    const data = ctx.getImageData(0, 0, 24, 12).data;
    let sum = 0;
    let weight = 0;
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3] / 255;
      sum += ((0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255) * a + (1 - a);
      weight += 1;
    }
    value = weight ? sum / weight : 1;
  }
  map.set(key, value);
  return value;
};
