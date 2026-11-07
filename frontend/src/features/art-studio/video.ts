import type { FormatKey, MotionPreset } from '../../types/art.types';
import { Scene, renderScene } from './render';

/**
 * Vídeo do encarte animado, gerado no navegador: cada quadro é desenhado pelo
 * mesmo {@link renderScene} da prévia e codificado em H.264 (WebCodecs, via
 * Mediabunny). Nada roda no servidor.
 */

const FPS = 30;
// ~6 Mbit/s: story de 15 s fica perto de 11 MB, abaixo do limite de 25 MB do upload.
const BITRATE = 6_000_000;

/** A4 é impressão: não sai em vídeo. Mesma lista do backend (ArtFormats.VIDEO_FORMATS). */
export const VIDEO_FORMATS: FormatKey[] = ['story', 'post', 'square', 'tv'];

export interface VideoFile { blob: Blob; width: number; height: number; extension: 'mp4' }

/** O navegador sabe codificar vídeo? (Chrome, Edge, Firefox 130+, Safari 16.4+.) */
export const canExportVideo = () => typeof window !== 'undefined' && 'VideoEncoder' in window;

export const sceneVideo = async (
  scene: Scene, preset: MotionPreset, duration: number, onProgress?: (fraction: number) => void,
): Promise<VideoFile> => {
  if (!canExportVideo()) throw new Error('Este navegador não gera vídeo. Use o Chrome ou o Edge atualizado.');
  const { Output, Mp4OutputFormat, BufferTarget, CanvasSource, Quality, canEncodeVideo } = await import('mediabunny');
  // H.264 pede lados pares.
  const width = scene.width - (scene.width % 2);
  const height = scene.height - (scene.height % 2);
  if (!(await canEncodeVideo('avc', { width, height }))) {
    throw new Error('Este navegador não gera vídeo MP4 neste tamanho. Use o Chrome ou o Edge atualizado.');
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
  const source = new CanvasSource(canvas, { codec: 'avc', quality: new Quality({ bitrate: BITRATE }), keyFrameInterval: 2 });
  output.addVideoTrack(source, { frameRate: FPS });
  await output.start();
  const frames = Math.round(duration * FPS);
  const still = { ...scene, width, height, selectedKey: null };
  for (let i = 0; i < frames; i++) {
    const t = i / FPS;
    renderScene(ctx, { ...still, motion: { preset, t, duration } });
    await source.add(t, 1 / FPS);
    if (onProgress && i % 10 === 0) onProgress(i / frames);
  }
  await output.finalize();
  onProgress?.(1);
  const buffer = output.target.buffer;
  if (!buffer) throw new Error('Falha ao montar o vídeo');
  return { blob: new Blob([buffer], { type: 'video/mp4' }), width, height, extension: 'mp4' };
};
