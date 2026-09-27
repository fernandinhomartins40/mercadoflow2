import { useEffect, useRef } from 'react';

/**
 * Comportamento padrão de diálogo para overlays montados à mão:
 * trava o scroll do body enquanto aberto e fecha com Escape.
 *
 * O componente Modal (components/common/Modal) já faz isso internamente —
 * use este hook nas telas que precisam de um cabeçalho próprio e por isso
 * mantêm o overlay local, para que o comportamento não fique divergente.
 *
 * Com diálogos empilhados (um aberto por cima de outro), Escape fecha só o de
 * cima, e o scroll só é liberado quando o último fecha.
 */

const openStack: symbol[] = [];
let lockedOverflow: string | null = null;

export function useModalBehavior(
  open: boolean,
  onClose: () => void,
  options: { preventClose?: boolean } = {},
): void {
  const { preventClose = false } = options;
  // Handler mais recente sem reinscrever o listener a cada render.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const preventRef = useRef(preventClose);
  preventRef.current = preventClose;

  useEffect(() => {
    if (!open) return undefined;
    const id = Symbol('modal');

    if (openStack.length === 0) {
      lockedOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    openStack.push(id);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || preventRef.current) return;
      if (openStack[openStack.length - 1] !== id) return;
      closeRef.current();
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      const index = openStack.indexOf(id);
      if (index >= 0) openStack.splice(index, 1);
      if (openStack.length === 0) {
        document.body.style.overflow = lockedOverflow ?? '';
        lockedOverflow = null;
      }
    };
  }, [open]);
}

export default useModalBehavior;
