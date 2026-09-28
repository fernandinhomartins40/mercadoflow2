import { useCallback, useRef, useState } from 'react';
import type { StorePlan } from '../../../types/storeMap.types';

const LIMIT = 80;

/**
 * Planta com desfazer/refazer.
 *
 * `preview` muda a planta sem entrar no histórico (arrastar, redimensionar);
 * `commit` fecha a alteração: o que estava antes do gesto vira um passo de
 * desfazer. Assim um arrasto inteiro se desfaz com um Ctrl+Z, não 40.
 */
export function usePlanHistory(onCommit: (plan: StorePlan) => void) {
  const [plan, setPlanState] = useState<StorePlan | null>(null);
  const current = useRef<StorePlan | null>(null);
  const past = useRef<StorePlan[]>([]);
  const future = useRef<StorePlan[]>([]);
  const gestureStart = useRef<StorePlan | null>(null);
  const [depth, setDepth] = useState({ undo: 0, redo: 0 });

  const set = (next: StorePlan | null) => {
    current.current = next;
    setPlanState(next);
  };
  const sync = () => setDepth({ undo: past.current.length, redo: future.current.length });

  const reset = useCallback((next: StorePlan | null) => {
    past.current = [];
    future.current = [];
    gestureStart.current = null;
    set(next);
    sync();
  }, []);

  const preview = useCallback((next: StorePlan) => {
    if (!gestureStart.current) gestureStart.current = current.current;
    set(next);
  }, []);

  const commit = useCallback((next?: StorePlan) => {
    const target = next ?? current.current;
    const before = gestureStart.current ?? current.current;
    gestureStart.current = null;
    set(target);
    if (!target || !before || before === target) return;
    past.current = [...past.current.slice(-(LIMIT - 1)), before];
    future.current = [];
    sync();
    onCommit(target);
  }, [onCommit]);

  /** Desfaz um gesto ainda em andamento sem gravar nada (Esc no meio do arrasto). */
  const cancel = useCallback(() => {
    if (gestureStart.current) set(gestureStart.current);
    gestureStart.current = null;
  }, []);

  const undo = useCallback(() => {
    const prev = past.current[past.current.length - 1];
    const now = current.current;
    if (!prev || !now) return;
    past.current = past.current.slice(0, -1);
    future.current = [now, ...future.current];
    set(prev);
    sync();
    onCommit(prev);
  }, [onCommit]);

  const redo = useCallback(() => {
    const next = future.current[0];
    const now = current.current;
    if (!next || !now) return;
    future.current = future.current.slice(1);
    past.current = [...past.current, now];
    set(next);
    sync();
    onCommit(next);
  }, [onCommit]);

  return {
    plan, reset, preview, commit, cancel, undo, redo,
    canUndo: depth.undo > 0,
    canRedo: depth.redo > 0,
  };
}
