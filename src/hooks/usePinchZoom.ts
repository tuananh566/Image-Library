import { useEffect, useRef, useState, type RefObject } from 'react';

interface UsePinchZoomOptions {
  containerRef: RefObject<HTMLElement | null>;
  zoomOffset: number;
  onZoomOffsetChange: (nextOffset: number) => void;
  enabled?: boolean;
}

export const GRID_COLS_CLASS: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
  6: 'grid-cols-6',
  7: 'grid-cols-7',
  8: 'grid-cols-8',
};

export const MASONRY_COLS_CLASS: Record<number, string> = {
  1: 'columns-1',
  2: 'columns-2',
  3: 'columns-3',
  4: 'columns-4',
  5: 'columns-5',
  6: 'columns-6',
  7: 'columns-7',
  8: 'columns-8',
};

function getColumnBounds(width: number): { baseCols: number; maxCols: number } {
  if (width < 640) return { baseCols: 1, maxCols: 5 };
  if (width < 768) return { baseCols: 2, maxCols: 6 };
  if (width < 1280) return { baseCols: 3, maxCols: 7 };
  return { baseCols: 4, maxCols: 8 };
}

function getTouchDistance(t1: Touch, t2: Touch): number {
  return Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
}

export function usePinchZoom({
  containerRef,
  zoomOffset,
  onZoomOffsetChange,
  enabled = true,
}: UsePinchZoomOptions) {
  const [containerWidth, setContainerWidth] = useState<number>(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1280
  );

  const zoomOffsetRef = useRef(zoomOffset);
  zoomOffsetRef.current = zoomOffset;

  const onChangeRef = useRef(onZoomOffsetChange);
  onChangeRef.current = onZoomOffsetChange;

  const boundsRef = useRef(getColumnBounds(containerWidth));
  const { baseCols, maxCols } = getColumnBounds(containerWidth);
  boundsRef.current = { baseCols, maxCols };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    setContainerWidth(el.clientWidth || window.innerWidth);
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          setContainerWidth(entry.contentRect.width);
        }
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [containerRef, enabled]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !enabled) return;

    let initialDistance: number | null = null;
    let initialOffset = zoomOffsetRef.current;
    let wheelAccumulator = 0;

    const clampOffset = (candidate: number) => {
      const { baseCols: b, maxCols: m } = boundsRef.current;
      const minOff = 1 - b;
      const maxOff = m - b;
      return Math.max(minOff, Math.min(maxOff, candidate));
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        initialDistance = getTouchDistance(e.touches[0], e.touches[1]);
        initialOffset = zoomOffsetRef.current;
      } else if (e.touches.length !== 2) {
        initialDistance = null;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || initialDistance === null || initialDistance <= 0) {
        return;
      }
      e.preventDefault();
      const currentDistance = getTouchDistance(e.touches[0], e.touches[1]);
      const ratio = currentDistance / initialDistance;
      if (ratio <= 0) return;

      // Pinch in (ratio < 1) => positive step => more columns
      // Pinch out (ratio > 1) => negative step => fewer, larger columns
      const stepDelta = Math.round(Math.log(ratio) / Math.log(0.82));
      const nextOffset = clampOffset(initialOffset + stepDelta);
      if (nextOffset !== zoomOffsetRef.current) {
        onChangeRef.current(nextOffset);
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        initialDistance = null;
      }
    };

    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      wheelAccumulator += e.deltaY;
      const threshold = 42;
      if (Math.abs(wheelAccumulator) >= threshold) {
        const step = wheelAccumulator > 0 ? 1 : -1;
        wheelAccumulator = 0;
        const nextOffset = clampOffset(zoomOffsetRef.current + step);
        if (nextOffset !== zoomOffsetRef.current) {
          onChangeRef.current(nextOffset);
        }
      }
    };

    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd, { passive: true });
    el.addEventListener('touchcancel', handleTouchEnd, { passive: true });
    el.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
      el.removeEventListener('touchcancel', handleTouchEnd);
      el.removeEventListener('wheel', handleWheel);
    };
  }, [containerRef, enabled]);

  const cols = Math.max(1, Math.min(maxCols, baseCols + zoomOffset));
  return { cols, maxCols };
}
