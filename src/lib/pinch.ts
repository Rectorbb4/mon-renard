// Le geste à deux doigts sur un graphique. Un seul doigt reste libre : il lit la valeur ou fait défiler la page.
// Les écouteurs ne sont pas passifs : sans preventDefault, le navigateur prendrait le geste pour un défilement.
import { pinchView, type Span } from './chartZoom';

export interface PinchOptions {
  /** Bords de la zone de tracé, en part de la largeur du graphique. */
  left: number;
  right: number;
  view: () => Span;
  bounds: () => Span;
  minSpan: () => number;
  onview: (view: Span) => void;
  /** Le geste commence ou se termine : la lecture au doigt se met de côté. */
  onpinch: (active: boolean) => void;
}

export function pinch(node: Element, initial: PinchOptions) {
  let opts = initial;
  let start: { view: Span; a: number; b: number } | null = null;

  const place = (clientX: number) => {
    const box = node.getBoundingClientRect();
    const share = (clientX - box.left) / (box.width || 1);
    return (share - opts.left) / (opts.right - opts.left || 1);
  };

  const fingers = (e: TouchEvent) => {
    const a = place(e.touches[0].clientX);
    const b = place(e.touches[1].clientX);
    return a <= b ? { a, b } : { a: b, b: a };
  };

  function onTouch(e: TouchEvent) {
    if (e.touches.length < 2) return;
    if (e.cancelable) e.preventDefault();
    const now = fingers(e);
    if (!start) {
      start = { view: opts.view(), ...now };
      opts.onpinch(true);
      return;
    }
    opts.onview(pinchView(start.view, opts.bounds(), start.a, start.b, now.a, now.b, opts.minSpan()));
  }

  function onEnd(e: TouchEvent) {
    // Un doigt levé : on repart de la plage actuelle si deux doigts restent
    if (e.touches.length >= 2 && start) {
      start = { view: opts.view(), ...fingers(e) };
      return;
    }
    if (e.touches.length === 0 && start) {
      start = null;
      opts.onpinch(false);
    }
  }

  node.addEventListener('touchstart', onTouch as EventListener, { passive: false });
  node.addEventListener('touchmove', onTouch as EventListener, { passive: false });
  node.addEventListener('touchend', onEnd as EventListener);
  node.addEventListener('touchcancel', onEnd as EventListener);

  return {
    update(next: PinchOptions) {
      opts = next;
    },
    destroy() {
      node.removeEventListener('touchstart', onTouch as EventListener);
      node.removeEventListener('touchmove', onTouch as EventListener);
      node.removeEventListener('touchend', onEnd as EventListener);
      node.removeEventListener('touchcancel', onEnd as EventListener);
    }
  };
}
