import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Maximize } from 'lucide-react';
import type { Fixture, ShelfProduct, StorePlan } from '../../../types/storeMap.types';
import { DEPT_BY_KEY, FIXTURES, fixtureName, heatColor } from '../model';
import { HEIGHTS } from './IsoView';

/**
 * A loja em 3D de verdade (WebGL): piso, paredes, móveis na altura real e,
 * nas prateleiras montadas, cada produto no espaço que ocupa, com a foto do
 * catálogo na frente. Gira com um dedo, aproxima com dois.
 */

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-700)]';
const WALL_H = 2.6;
const PLINTH = 0.1;

interface Props {
  plan: StorePlan;
  products: Record<string, ShelfProduct>;
  selectedIds: string[];
  onSelect: (id: string | null) => void;
  heat?: Record<string, number>;
  heatMode?: boolean;
  highlightIds?: Set<string>;
  className?: string;
}

/** Frente de cada lado: para onde olha quem está no corredor. */
interface Face { key: 'A' | 'B'; nx: number; nz: number }

/**
 * Lados de um móvel na planta. Gôndola em pé: A olha para a esquerda (oeste),
 * B para a direita. Deitada: A para o fundo da loja, B para a frente. Móvel de
 * um lado só olha para longe da parede mais próxima.
 */
function facesOf(f: Fixture, W: number, H: number): Face[] {
  const vertical = f.h >= f.w;
  if (f.type === 'gondola' || f.type === 'ilha') {
    return vertical ? [{ key: 'A', nx: -1, nz: 0 }, { key: 'B', nx: 1, nz: 0 }] : [{ key: 'A', nx: 0, nz: -1 }, { key: 'B', nx: 0, nz: 1 }];
  }
  if (vertical) return [{ key: 'A', nx: f.x < W - (f.x + f.w) ? 1 : -1, nz: 0 }];
  return [{ key: 'A', nx: 0, nz: f.y < H - (f.y + f.h) ? 1 : -1 }];
}

const textures = new Map<string, THREE.Texture | null>();
const loader = new THREE.TextureLoader();
loader.setCrossOrigin('anonymous');

/** Foto do produto como textura, carregada uma vez; repetida pelas frentes. */
function productTexture(url: string, repeat: number, onReady: () => void): THREE.Texture | null {
  const key = `${url}#${repeat}`;
  if (textures.has(key)) return textures.get(key)!;
  const base = `${url}#1`;
  if (!textures.has(base)) {
    const t = loader.load(url, () => onReady(), undefined, () => { textures.set(base, null); });
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    textures.set(base, t);
  }
  const b = textures.get(base);
  if (!b || repeat === 1) return b ?? null;
  const t = b.clone();
  t.repeat.set(repeat, 1);
  t.needsUpdate = true;
  textures.set(key, t);
  return t;
}

/** Placa com o nome do móvel, sempre de frente para a câmera. */
function label(text: string): THREE.Sprite {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d')!;
  ctx.font = '600 44px Inter, Arial, sans-serif';
  const w = Math.min(1024, Math.ceil(ctx.measureText(text).width) + 40);
  c.width = w; c.height = 72;
  ctx.font = '600 44px Inter, Arial, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.beginPath(); ctx.roundRect(0, 0, w, 72, 20); ctx.fill();
  ctx.fillStyle = '#1f2937'; ctx.textBaseline = 'middle'; ctx.fillText(text, 20, 38);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set((w / 72) * 0.28, 0.28, 1);
  s.renderOrder = 10;
  return s;
}

const box = new THREE.BoxGeometry(1, 1, 1);

/** Monta o móvel: corpo, prateleiras e produtos. Devolve o grupo e os materiais que acendem na seleção. */
function buildFixture(f: Fixture, W: number, H: number, products: Record<string, ShelfProduct>, bodyColor: string, onTexture: () => void) {
  const g = new THREE.Group();
  g.userData.id = f.id;
  const meta = FIXTURES[f.type];
  const height = HEIGHTS[f.type] ?? 1;
  const cx = f.x + f.w / 2;
  const cz = f.y + f.h / 2;
  const body = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.75 });
  const metal = new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.4, metalness: 0.5 });
  const lit = [body, metal];
  const add = (mat: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(box, mat);
    m.scale.set(sx, sy, sz); m.position.set(x, y, z);
    m.userData.id = f.id;
    g.add(m);
    return m;
  };

  if (f.type === 'entrada') {
    add(new THREE.MeshStandardMaterial({ color: '#86efac' }), f.w, 0.02, f.h, cx, 0.01, cz);
    return { g, lit: [] as THREE.MeshStandardMaterial[] };
  }

  const faces = facesOf(f, W, H);
  const vertical = f.h >= f.w;
  const len = Math.max(f.w, f.h);
  const depth = Math.min(f.w, f.h);
  const sides = f.sides ?? [];
  const isLow = height < 1.3;

  if (!sides.length || meta.noProducts) {
    // Sem prateleiras montadas: o móvel inteiro, com a cor do setor ou do calor.
    add(body, f.w, height, f.h, cx, height / 2, cz);
    if (meta.cold) add(new THREE.MeshPhysicalMaterial({ color: '#e0f2fe', transmission: 0.6, roughness: 0.1, transparent: true, opacity: 0.5 }), f.w * 1.01, isLow ? 0.02 : height * 0.8, f.h * 1.01, cx, isLow ? height + 0.01 : height * 0.55, cz);
    return { g, lit };
  }

  // Base e fundo (no meio, para quem tem dois lados).
  add(body, f.w, PLINTH, f.h, cx, PLINTH / 2, cz);
  const twoSided = faces.length > 1;
  const back = 0.04;
  if (!isLow) {
    const bx = twoSided ? cx : cx - faces[0].nx * (depth / 2 - back / 2);
    const bz = twoSided ? cz : cz - faces[0].nz * (depth / 2 - back / 2);
    add(body, vertical ? back : f.w, height, vertical ? f.h : back, bx, height / 2, bz);
  }
  const shelfDepth = twoSided ? depth / 2 - back / 2 : depth - back;

  for (const face of faces) {
    const side = sides.find((s) => s.key === face.key);
    if (!side) continue;
    const total = side.modules.reduce((s, m) => s + m.widthCm, 0) / 100 || len;
    const scale = len / total; // módulos somando diferente do móvel: estica para caber
    // Da esquerda para a direita de quem olha a frente: vetor "direita" = frente × cima.
    const rx = -face.nz;
    const rz = face.nx;
    // Começo (esquerda) do lado e centro da faixa da prateleira.
    const ox = cx - rx * (len / 2) + face.nx * (twoSided ? back / 2 + shelfDepth / 2 : -depth / 2 + back + shelfDepth / 2);
    const oz = cz - rz * (len / 2) + face.nz * (twoSided ? back / 2 + shelfDepth / 2 : -depth / 2 + back + shelfDepth / 2);
    let along = 0;
    for (const mod of side.modules) {
      const mw = (mod.widthCm / 100) * scale;
      const n = mod.shelves.length;
      const top = isLow ? height : height - 0.12;
      const gap = (top - PLINTH) / n;
      mod.shelves.forEach((sh, i) => {
        const k = n - 1 - i; // de cima para baixo na lista, de baixo para cima no espaço
        const y = PLINTH + k * gap;
        const mx = ox + rx * (along + mw / 2);
        const mz = oz + rz * (along + mw / 2);
        add(metal, Math.abs(rx) * mw + Math.abs(face.nx) * shelfDepth, 0.02, Math.abs(rz) * mw + Math.abs(face.nz) * shelfDepth, mx, y + 0.01, mz);
        let start = 0;
        for (const sl of sh.slots) {
          const w = sl.share * mw;
          const ph = Math.min(0.32, gap * 0.78);
          const pd = shelfDepth * 0.85;
          const px = ox + rx * (along + (start + sl.share / 2) * mw) - face.nx * 0.02;
          const pz = oz + rz * (along + (start + sl.share / 2) * mw) - face.nz * 0.02;
          start += sl.share;
          const color = DEPT_BY_KEY[sl.department ?? '']?.color ?? '#94a3b8';
          const p = sl.productId ? products[sl.productId] : undefined;
          const reps = Math.max(1, Math.min(20, sl.facings ?? Math.round(w / 0.12)));
          const tex = p?.imageUrl ? productTexture(p.imageUrl, reps, onTexture) : null;
          const side = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
          const front = tex ? new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }) : side;
          // Ordem das faces do BoxGeometry: +x, -x, +y, -y, +z, -z.
          const mats = [side, side, side, side, side, side];
          const fi = face.nx > 0 ? 0 : face.nx < 0 ? 1 : face.nz > 0 ? 4 : 5;
          mats[fi] = front;
          const m = new THREE.Mesh(box, mats);
          m.scale.set(Math.abs(rx) * w * 0.98 + Math.abs(face.nx) * pd, ph, Math.abs(rz) * w * 0.98 + Math.abs(face.nz) * pd);
          m.position.set(px, y + 0.02 + ph / 2, pz);
          m.userData.id = f.id;
          g.add(m);
        }
      });
      // Montante entre módulos.
      if (!isLow) add(metal, 0.03, height, 0.03, ox + rx * along, height / 2, oz + rz * along);
      along += mw;
    }
  }
  if (meta.cold) {
    add(new THREE.MeshPhysicalMaterial({ color: '#e0f2fe', transmission: 0.7, roughness: 0.05, transparent: true, opacity: 0.35 }),
      isLow ? f.w : vertical ? 0.01 : f.w, isLow ? 0.01 : height * 0.85, isLow ? f.h : vertical ? f.h : 0.01,
      isLow ? cx : cx + (faces[0].nx * depth) / 2, isLow ? height + 0.01 : height * 0.5, isLow ? cz : cz + (faces[0].nz * depth) / 2);
  }
  return { g, lit };
}

const Store3D: React.FC<Props> = ({ plan, products, selectedIds, onSelect, heat, heatMode = false, highlightIds, className }) => {
  const host = useRef<HTMLDivElement>(null);
  const ctx = useRef<{
    renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; controls: OrbitControls;
    store: THREE.Group; lit: Map<string, THREE.MeshStandardMaterial[]>; frame: () => void;
  } | null>(null);
  const [failed, setFailed] = useState(false);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // Cena, câmera e controles: uma vez.
  useEffect(() => {
    const el = host.current;
    if (!el) return undefined;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      setFailed(true);
      return undefined;
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    el.appendChild(renderer.domElement);
    renderer.domElement.style.touchAction = 'none';
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#eef2f0');
    scene.add(new THREE.HemisphereLight('#ffffff', '#b8c2bc', 2.2));
    const sun = new THREE.DirectionalLight('#ffffff', 1.4);
    sun.position.set(-10, 20, 12);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI / 2 - 0.08;
    controls.minDistance = 1.2;
    const store = new THREE.Group();
    scene.add(store);

    let raf = 0;
    const frame = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; controls.update(); renderer.render(scene, camera); }); };
    controls.addEventListener('change', frame);
    const resize = () => {
      const { clientWidth: w, clientHeight: h } = el;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
      frame();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    // Toque sem arrastar seleciona o móvel.
    let down: { x: number; y: number } | null = null;
    const ray = new THREE.Raycaster();
    const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; };
    const onUp = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) { down = null; return; }
      down = null;
      const r = renderer.domElement.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      const hit = ray.intersectObjects(store.children, true).find((h) => h.object.userData.id);
      onSelectRef.current(hit ? (hit.object.userData.id as string) : null);
    };
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerup', onUp);

    ctx.current = { renderer, scene, camera, controls, store, lit: new Map(), frame };
    resize();
    return () => {
      ro.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
      renderer.dispose();
      renderer.domElement.remove();
      ctx.current = null;
    };
  }, []);

  const fit = () => {
    const c = ctx.current;
    if (!c) return;
    const { width: W, height: H } = plan;
    c.controls.target.set(W / 2, 0.6, H / 2);
    const d = Math.max(W, H);
    c.camera.position.set(W / 2, d * 0.75, H + d * 0.45);
    c.controls.update();
    c.frame();
  };

  // Loja: refeita quando a planta, os produtos ou o calor mudam.
  useEffect(() => {
    const c = ctx.current;
    if (!c) return;
    const { width: W, height: H } = plan;
    c.store.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Sprite) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m: THREE.Material & { map?: THREE.Texture | null }) => { if (m.map instanceof THREE.CanvasTexture) m.map.dispose(); m.dispose(); });
      }
    });
    c.store.clear();
    c.lit.clear();

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ color: '#f5f5f0', roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(W / 2, 0, H / 2);
    c.store.add(floor);
    const grid = new THREE.GridHelper(Math.max(W, H), Math.round(Math.max(W, H) / 0.6), '#e2e2da', '#e2e2da');
    grid.position.set(W / 2, 0.002, H / 2);
    grid.scale.set(W / Math.max(W, H), 1, H / Math.max(W, H));
    c.store.add(grid);
    // Paredes por dentro: de fora, a parede da frente some e dá para ver a loja.
    const walls = new THREE.Mesh(new THREE.BoxGeometry(W, WALL_H, H), new THREE.MeshStandardMaterial({ color: '#f8fafc', side: THREE.BackSide, roughness: 0.95 }));
    walls.position.set(W / 2, WALL_H / 2, H / 2);
    c.store.add(walls);

    const maxHeat = Math.max(1, ...Object.values(heat ?? {}));
    for (const f of plan.fixtures) {
      const meta = FIXTURES[f.type];
      const v = heat?.[f.id];
      const color = heatMode && !meta.noProducts
        ? (v != null ? heatColor(v / maxHeat) : '#f4f6f3')
        : (f.departments[0] && !f.sides?.length ? DEPT_BY_KEY[f.departments[0]]?.color ?? meta.fill : meta.fill);
      const { g, lit } = buildFixture(f, W, H, products, color, c.frame);
      if (f.type !== 'entrada') {
        const s = label(fixtureName(f));
        s.position.set(f.x + f.w / 2, (HEIGHTS[f.type] ?? 1) + 0.3, f.y + f.h / 2);
        g.add(s);
      }
      c.lit.set(f.id, lit);
      c.store.add(g);
    }
    c.frame();
  }, [plan, products, heat, heatMode]);

  // Enquadra ao abrir e quando o tamanho da loja muda.
  useEffect(() => { fit(); }, [plan.width, plan.height]); // eslint-disable-line react-hooks/exhaustive-deps

  // Seleção e destaque acendem o móvel.
  useEffect(() => {
    const c = ctx.current;
    if (!c) return;
    const on = new Set([...selectedIds, ...(highlightIds ?? [])]);
    c.lit.forEach((mats, id) => mats.forEach((m) => m.emissive.set(on.has(id) ? (selectedIds.includes(id) ? '#15803d' : '#d97706') : '#000000')));
    c.lit.forEach((mats, id) => mats.forEach((m) => { m.emissiveIntensity = on.has(id) ? 0.45 : 0; }));
    c.frame();
  }, [selectedIds, highlightIds, plan, products, heat, heatMode]);

  if (failed) {
    return <div className={`flex items-center justify-center p-6 text-center text-sm ${className ?? ''}`} style={{ color: 'var(--text-muted)' }}>Este aparelho não mostra 3D. Use a planta ou o corredor.</div>;
  }

  return (
    <div className={`relative ${className ?? ''}`}>
      <div ref={host} className="absolute inset-0" role="img" aria-label={`Loja em 3D com ${plan.fixtures.length} móveis. Arraste para girar, use dois dedos ou a roda do mouse para aproximar.`} />
      <button type="button" onClick={fit} title="Ver a loja inteira" aria-label="Ver a loja inteira"
        className={`absolute right-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-lg shadow ${FOCUS}`} style={{ background: 'var(--surface-base)', color: 'var(--text-primary)' }}>
        <Maximize className="h-4 w-4" aria-hidden="true" />
      </button>
      <p className="pointer-events-none absolute bottom-2 left-3 rounded-md px-2 py-1 text-xs" style={{ background: 'rgba(255,255,255,0.85)', color: '#334155' }}>
        Arraste para girar · dois dedos ou roda para aproximar · toque num móvel
      </p>
    </div>
  );
};

export default Store3D;
