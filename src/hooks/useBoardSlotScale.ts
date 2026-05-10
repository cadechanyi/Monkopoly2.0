import { useLayoutEffect, useState, type RefObject } from "react";

/**
 * Fit a fixed-size board (bw × bh) inside ``ref``'s content box without upscaling.
 */
export function useBoardSlotScale(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean,
  bw: number,
  bh: number
): number {
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    if (!enabled) {
      setScale(1);
      return;
    }
    const el = ref.current;
    if (!el) return;

    const update = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w <= 0 || h <= 0) return;
      const s = Math.min(1, w / bw, h / bh);
      setScale(Number.isFinite(s) && s > 0 ? s : 1);
    };

    update();
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    window.addEventListener("orientationchange", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("orientationchange", update);
    };
  }, [enabled, ref, bw, bh]);

  return enabled ? scale : 1;
}
