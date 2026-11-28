import {
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Info,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getImageById } from '../lib/db';
import { formatFileSize } from '../lib/imageProcessor';
import type { Category, VaultImageView } from '../types/vault';

interface ImageInspectorModalProps {
  image: VaultImageView | null;
  images: VaultImageView[];
  categories: Category[];
  hasPrev: boolean;
  hasNext: boolean;
  onSelectImage: (id: string) => void;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onUpdate: (
    id: string,
    patch: Partial<{
      title: string;
      notes: string;
      categoryId: string | null;
      isFavorite: boolean;
    }>
  ) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onCreateCategory: (name: string) => Promise<Category>;
  canManage?: boolean;
}

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const PRELOAD_NEAREST_COUNT = 2;
const FILMSTRIP_HALF_WINDOW = 24;

interface PreloadedPreviewEntry {
  fullUrl: string;
  isObjectUrl: boolean;
  fullImg?: HTMLImageElement;
  thumbImg?: HTMLImageElement;
  cancelled?: boolean;
}

function getNearestPreviewImages(
  images: VaultImageView[],
  activeId: string,
  limit = PRELOAD_NEAREST_COUNT
): VaultImageView[] {
  if (images.length <= 1 || limit <= 0) return [];
  const activeIndex = images.findIndex((item) => item.id === activeId);
  if (activeIndex === -1) {
    return images.slice(0, limit);
  }

  const nearest: VaultImageView[] = [];
  for (
    let offset = 1;
    nearest.length < limit &&
    (activeIndex + offset < images.length || activeIndex - offset >= 0);
    offset += 1
  ) {
    if (activeIndex + offset < images.length && nearest.length < limit) {
      nearest.push(images[activeIndex + offset]);
    }
    if (activeIndex - offset >= 0 && nearest.length < limit) {
      nearest.push(images[activeIndex - offset]);
    }
  }
  return nearest;
}

function getCardZoomOffset(imageId: string): { x: number; y: number; scale: number } {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { x: 0, y: 0, scale: 0.72 };
  }
  const selectorId = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(imageId) : imageId;
  const el = document.querySelector(`[data-image-card="${selectorId}"]`);
  if (!el) return { x: 0, y: 0, scale: 0.72 };
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return { x: 0, y: 0, scale: 0.72 };
  }
  if (rect.bottom < 0 || rect.top > window.innerHeight) {
    return { x: 0, y: 0, scale: 0.72 };
  }
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cardCenterX = rect.left + rect.width / 2;
  const cardCenterY = rect.top + rect.height / 2;
  const stageCenterX = vw / 2;
  const stageCenterY = Math.max(120, (vh - 130) / 2);
  const targetWidth = Math.min(vw * 0.82, 680);
  const scale = Math.max(0.2, Math.min(0.68, rect.width / targetWidth));

  return {
    x: cardCenterX - stageCenterX,
    y: cardCenterY - stageCenterY,
    scale,
  };
}

export function ImageInspectorModal(props: ImageInspectorModalProps) {
  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {props.image && (
          <ImageInspectorContent
            key="image-inspector"
            {...props}
            image={props.image}
          />
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}

function ImageInspectorContent({
  image,
  images,
  categories,
  hasPrev,
  hasNext,
  onSelectImage,
  onPrev,
  onNext,
  onClose,
  onUpdate,
  onDelete,
  onCreateCategory,
  canManage = true,
}: ImageInspectorModalProps & { image: VaultImageView }) {
  const [fullUrl, setFullUrl] = useState<string>('');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [isZoomedIn, setIsZoomedIn] = useState(false);
  const [isDraggingPan, setIsDraggingPan] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState(false);
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');

  const stageRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const activeThumbRef = useRef<HTMLButtonElement | null>(null);
  const drawerTouchStartXRef = useRef<number | null>(null);
  const lastTapRef = useRef<number>(0);
  const suppressBackdropClickRef = useRef<boolean>(false);
  const preloadCacheRef = useRef<Map<string, PreloadedPreviewEntry>>(new Map());

  const onPrevRef = useRef(onPrev);
  onPrevRef.current = onPrev;
  const onNextRef = useRef(onNext);
  onNextRef.current = onNext;
  const hasPrevRef = useRef(hasPrev);
  hasPrevRef.current = hasPrev;
  const hasNextRef = useRef(hasNext);
  hasNextRef.current = hasNext;

  const transformRef = useRef({ scale: 1, x: 0, y: 0 });
  const zoomOrigin = useMemo(() => getCardZoomOffset(image.id), [image.id]);

  const clampPan = useCallback((x: number, y: number, scale: number) => {
    if (scale <= 1) return { x: 0, y: 0 };
    const stage = stageRef.current;
    const img = imgRef.current;
    const maxW = stage ? stage.clientWidth * 0.6 * (scale - 1) : 400 * (scale - 1);
    const maxH = stage ? stage.clientHeight * 0.6 * (scale - 1) : 400 * (scale - 1);
    const boundX = img ? Math.max(maxW, (img.clientWidth * scale - (stage?.clientWidth || 0)) / 2 + 40) : maxW;
    const boundY = img ? Math.max(maxH, (img.clientHeight * scale - (stage?.clientHeight || 0)) / 2 + 40) : maxH;
    return {
      x: Math.max(-Math.max(0, boundX), Math.min(Math.max(0, boundX), x)),
      y: Math.max(-Math.max(0, boundY), Math.min(Math.max(0, boundY), y)),
    };
  }, []);

  const applyTransform = useCallback(
    (nextScale: number, nextX: number, nextY: number, animate = false) => {
      const clampedScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, nextScale));
      const { x, y } =
        clampedScale <= 1.02 ? { x: 0, y: 0 } : clampPan(nextX, nextY, clampedScale);
      const finalScale = clampedScale <= 1.02 ? 1 : clampedScale;

      transformRef.current = { scale: finalScale, x, y };
      setIsZoomedIn(finalScale > 1.02);

      const el = imgRef.current;
      if (!el) return;
      el.style.transition = animate
        ? 'transform 200ms cubic-bezier(0.16, 1, 0.3, 1), opacity 200ms ease-out'
        : 'none';
      el.style.opacity = '1';
      el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${finalScale})`;
    },
    [clampPan]
  );

  const resetZoom = useCallback(
    (animate = true) => {
      applyTransform(1, 0, 0, animate);
    },
    [applyTransform]
  );

  const nearestImages = useMemo(
    () => (image ? getNearestPreviewImages(images, image.id, PRELOAD_NEAREST_COUNT) : []),
    [images, image]
  );
  const nearestIdSet = useMemo(
    () => new Set(nearestImages.map((item) => item.id)),
    [nearestImages]
  );
  const filmstripWindow = useMemo(() => {
    const activeIndex = images.findIndex((item) => item.id === image.id);
    if (activeIndex === -1 || images.length <= FILMSTRIP_HALF_WINDOW * 2 + 1) {
      return images;
    }
    const start = Math.max(0, activeIndex - FILMSTRIP_HALF_WINDOW);
    const end = Math.min(images.length, activeIndex + FILMSTRIP_HALF_WINDOW + 1);
    return images.slice(start, end);
  }, [images, image.id]);

  useEffect(() => {
    if (!image) {
      setShowInfo(false);
      setConfirmDelete(false);
      return;
    }
    setTitle(image.title);
    setNotes(image.notes);
    setCategoryId(image.categoryId || '');
    setConfirmDelete(false);
    setSaveFeedback(false);
    setShowNewCat(false);
    transformRef.current = { scale: 1, x: 0, y: 0 };
    setIsZoomedIn(false);
    const el = imgRef.current;
    if (el) {
      el.style.transition = 'none';
      el.style.opacity = '0.65';
      el.style.transform = 'translate3d(0px, 0px, 0) scale(0.985)';
      requestAnimationFrame(() => {
        applyTransform(1, 0, 0, true);
      });
    }

    const preloaded = preloadCacheRef.current.get(image.id);
    if (image.fullUrl) {
      if (
        preloaded?.fullUrl === image.fullUrl &&
        preloaded.fullImg?.complete &&
        preloaded.fullImg.naturalWidth > 0
      ) {
        setFullUrl(image.fullUrl);
        return;
      }
      // Show already-cached thumbnail immediately while loading & decoding full-res image
      setFullUrl(image.thumbnailUrl || image.fullUrl);
      let cancelled = false;
      const hiRes = new Image();
      hiRes.decoding = 'async';
      hiRes.referrerPolicy = 'no-referrer';
      const commitHiRes = () => {
        if (cancelled) return;
        const existing = preloadCacheRef.current.get(image.id);
        preloadCacheRef.current.set(image.id, {
          fullUrl: image.fullUrl!,
          isObjectUrl: false,
          fullImg: hiRes,
          thumbImg: existing?.thumbImg,
        });
        setFullUrl(image.fullUrl!);
      };
      hiRes.onload = () => {
        if (typeof hiRes.decode === 'function') {
          void hiRes.decode().catch(() => {}).finally(commitHiRes);
        } else {
          commitHiRes();
        }
      };
      hiRes.onerror = commitHiRes;
      hiRes.src = image.fullUrl;
      if (hiRes.complete && hiRes.naturalWidth > 0) {
        commitHiRes();
      }
      return () => {
        cancelled = true;
      };
    }

    if (preloaded?.fullUrl) {
      setFullUrl(preloaded.fullUrl);
      return;
    }

    setFullUrl('');
    let cancelled = false;
    getImageById(image.id).then((rec) => {
      if (cancelled || !rec) return;
      const existing = preloadCacheRef.current.get(image.id);
      if (existing?.fullUrl) {
        setFullUrl(existing.fullUrl);
        return;
      }
      const objectUrl = URL.createObjectURL(rec.blob);
      preloadCacheRef.current.set(image.id, {
        fullUrl: objectUrl,
        isObjectUrl: true,
      });
      setFullUrl(objectUrl);
    });

    return () => {
      cancelled = true;
    };
  }, [image?.id, image?.fullUrl, applyTransform]);

  // Delay neighbor full-res preloads briefly so the active image finishes loading first on iOS Safari
  useEffect(() => {
    if (!image) return;

    const cache = preloadCacheRef.current;
    const keepIds = new Set<string>([image.id]);
    for (const neighbor of nearestImages) {
      keepIds.add(neighbor.id);
    }

    for (const [cachedId, entry] of cache.entries()) {
      if (!keepIds.has(cachedId)) {
        entry.cancelled = true;
        if (entry.isObjectUrl && entry.fullUrl) {
          URL.revokeObjectURL(entry.fullUrl);
        }
        cache.delete(cachedId);
      }
    }

    const timerId = window.setTimeout(() => {
      for (const neighbor of nearestImages) {
        const existing = cache.get(neighbor.id);
        if (existing && (!neighbor.fullUrl || existing.fullUrl === neighbor.fullUrl)) {
          continue;
        }
        if (existing?.isObjectUrl && existing.fullUrl) {
          URL.revokeObjectURL(existing.fullUrl);
        }

        if (neighbor.fullUrl) {
          const fullImg = new Image();
          fullImg.decoding = 'async';
          fullImg.referrerPolicy = 'no-referrer';
          fullImg.src = neighbor.fullUrl;
          cache.set(neighbor.id, {
            fullUrl: neighbor.fullUrl,
            isObjectUrl: false,
            fullImg,
          });
        } else {
          const entry: PreloadedPreviewEntry = {
            fullUrl: '',
            isObjectUrl: false,
            cancelled: false,
          };
          cache.set(neighbor.id, entry);
          getImageById(neighbor.id).then((rec) => {
            if (entry.cancelled || !rec) return;
            const objectUrl = URL.createObjectURL(rec.blob);
            const fullImg = new Image();
            fullImg.decoding = 'async';
            fullImg.src = objectUrl;
            entry.fullUrl = objectUrl;
            entry.isObjectUrl = true;
            entry.fullImg = fullImg;
          });
        }
      }
    }, 180);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [image?.id, nearestImages]);

  useEffect(() => {
    const cache = preloadCacheRef.current;
    return () => {
      for (const entry of cache.values()) {
        entry.cancelled = true;
        if (entry.isObjectUrl && entry.fullUrl) {
          URL.revokeObjectURL(entry.fullUrl);
        }
      }
      cache.clear();
    };
  }, []);

  useEffect(() => {
    if (!image?.id) return;
    activeThumbRef.current?.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest',
    });
  }, [image?.id]);

  // Interactive wheel + pinch-to-zoom + 1-finger pan (zoomed) + horizontal swipe (unzoomed)
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !image) return;

    let pinchStartDist = 0;
    let pinchStartScale = 1;
    let pinchStartX = 0;
    let pinchStartY = 0;
    let pinchMidStartX = 0;
    let pinchMidStartY = 0;

    let panStartTouchX = 0;
    let panStartTouchY = 0;
    let panOriginX = 0;
    let panOriginY = 0;
    let isTouchPanning = false;

    let swipeStartX = 0;
    let swipeStartY = 0;
    let swipeCurrentDx = 0;
    let isSwiping = false;
    let swipeAxisLocked: 'x' | 'y' | null = null;
    let wheelSwipeCooldown = 0;

    const getDist = (t1: Touch, t2: Touch) =>
      Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);

    const applySwipePreview = (dx: number) => {
      const el = imgRef.current;
      if (!el) return;
      const atBoundary =
        (dx > 0 && !hasPrevRef.current) || (dx < 0 && !hasNextRef.current);
      const effectiveDx = atBoundary ? dx * 0.25 : dx;
      el.style.transition = 'none';
      el.style.transform = `translate3d(${effectiveDx}px, 0, 0) scale(1)`;
      el.style.opacity = atBoundary
        ? '1'
        : String(Math.max(0.45, 1 - Math.abs(effectiveDx) / 420));
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { scale, x, y } = transformRef.current;

      // Trackpad two-finger horizontal swipe when unzoomed
      if (
        !e.ctrlKey &&
        scale <= 1.02 &&
        Math.abs(e.deltaX) > 32 &&
        Math.abs(e.deltaX) > Math.abs(e.deltaY) * 1.4
      ) {
        const now = Date.now();
        if (now - wheelSwipeCooldown > 350) {
          if (e.deltaX > 0 && hasNextRef.current) {
            wheelSwipeCooldown = now;
            onNextRef.current();
          } else if (e.deltaX < 0 && hasPrevRef.current) {
            wheelSwipeCooldown = now;
            onPrevRef.current();
          }
        }
        return;
      }

      const zoomFactor = e.deltaY < 0 ? 1.12 : 0.89;
      const nextScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale * zoomFactor));

      if (nextScale <= 1.02) {
        applyTransform(1, 0, 0, false);
        return;
      }

      const rect = stage.getBoundingClientRect();
      const cursorOffsetX = e.clientX - (rect.left + rect.width / 2);
      const cursorOffsetY = e.clientY - (rect.top + rect.height / 2);
      const ratio = nextScale / scale;
      const nextX = cursorOffsetX - (cursorOffsetX - x) * ratio;
      const nextY = cursorOffsetY - (cursorOffsetY - y) * ratio;

      applyTransform(nextScale, nextX, nextY, false);
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        suppressBackdropClickRef.current = true;
        isTouchPanning = false;
        isSwiping = false;
        swipeAxisLocked = null;
        if (swipeCurrentDx !== 0) {
          swipeCurrentDx = 0;
          resetZoom(false);
        }
        pinchStartDist = getDist(e.touches[0], e.touches[1]);
        pinchStartScale = transformRef.current.scale;
        pinchStartX = transformRef.current.x;
        pinchStartY = transformRef.current.y;
        pinchMidStartX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        pinchMidStartY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      } else if (e.touches.length === 1) {
        suppressBackdropClickRef.current = false;
        if (transformRef.current.scale > 1.02) {
          isTouchPanning = true;
          isSwiping = false;
          panStartTouchX = e.touches[0].clientX;
          panStartTouchY = e.touches[0].clientY;
          panOriginX = transformRef.current.x;
          panOriginY = transformRef.current.y;
        } else {
          isTouchPanning = false;
          isSwiping = true;
          swipeAxisLocked = null;
          swipeCurrentDx = 0;
          swipeStartX = e.touches[0].clientX;
          swipeStartY = e.touches[0].clientY;
        }
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchStartDist > 0) {
        e.preventDefault();
        suppressBackdropClickRef.current = true;
        const currentDist = getDist(e.touches[0], e.touches[1]);
        const nextScale = Math.max(
          MIN_SCALE,
          Math.min(MAX_SCALE, pinchStartScale * (currentDist / pinchStartDist))
        );
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        const nextX = pinchStartX + (midX - pinchMidStartX);
        const nextY = pinchStartY + (midY - pinchMidStartY);
        applyTransform(nextScale, nextX, nextY, false);
      } else if (e.touches.length === 1 && isTouchPanning) {
        e.preventDefault();
        const dx = e.touches[0].clientX - panStartTouchX;
        const dy = e.touches[0].clientY - panStartTouchY;
        if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
          suppressBackdropClickRef.current = true;
        }
        applyTransform(
          transformRef.current.scale,
          panOriginX + dx,
          panOriginY + dy,
          false
        );
      } else if (e.touches.length === 1 && isSwiping) {
        const dx = e.touches[0].clientX - swipeStartX;
        const dy = e.touches[0].clientY - swipeStartY;

        if (!swipeAxisLocked && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
          swipeAxisLocked = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
        }

        if (swipeAxisLocked === 'x') {
          e.preventDefault();
          suppressBackdropClickRef.current = true;
          swipeCurrentDx = dx;
          applySwipePreview(dx);
        }
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        pinchStartDist = 0;
        if (transformRef.current.scale > 1 && transformRef.current.scale < 1.08) {
          resetZoom(true);
        }
      }
      if (e.touches.length === 0) {
        isTouchPanning = false;
        if (isSwiping) {
          isSwiping = false;
          const dx = swipeCurrentDx;
          swipeCurrentDx = 0;
          swipeAxisLocked = null;

          if (dx < -55 && hasNextRef.current) {
            onNextRef.current();
          } else if (dx > 55 && hasPrevRef.current) {
            onPrevRef.current();
          } else if (Math.abs(dx) > 4) {
            resetZoom(true);
          }
        }
        if (suppressBackdropClickRef.current) {
          window.setTimeout(() => {
            suppressBackdropClickRef.current = false;
          }, 120);
        }
      }
    };

    stage.addEventListener('wheel', handleWheel, { passive: false });
    stage.addEventListener('touchstart', handleTouchStart, { passive: true });
    stage.addEventListener('touchmove', handleTouchMove, { passive: false });
    stage.addEventListener('touchend', handleTouchEnd, { passive: true });
    stage.addEventListener('touchcancel', handleTouchEnd, { passive: true });

    return () => {
      stage.removeEventListener('wheel', handleWheel);
      stage.removeEventListener('touchstart', handleTouchStart);
      stage.removeEventListener('touchmove', handleTouchMove);
      stage.removeEventListener('touchend', handleTouchEnd);
      stage.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [image, applyTransform, resetZoom]);

  useEffect(() => {
    if (!image) return;
    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT';

      if (e.key === 'Escape') {
        if (confirmDelete) {
          setConfirmDelete(false);
        } else {
          onClose();
        }
      } else if (!isEditing && e.key === 'ArrowLeft' && hasPrev) {
        onPrev();
      } else if (!isEditing && e.key === 'ArrowRight' && hasNext) {
        onNext();
      } else if (!isEditing && (e.key === '+' || e.key === '=')) {
        e.preventDefault();
        applyTransform(
          transformRef.current.scale + 0.4,
          transformRef.current.x,
          transformRef.current.y,
          true
        );
      } else if (!isEditing && e.key === '-') {
        e.preventDefault();
        applyTransform(
          transformRef.current.scale - 0.4,
          transformRef.current.x,
          transformRef.current.y,
          true
        );
      } else if (!isEditing && e.key === '0') {
        e.preventDefault();
        resetZoom(true);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [image, confirmDelete, hasPrev, hasNext, onClose, onPrev, onNext, applyTransform, resetZoom]);

  const toggleDoubleTapZoom = (clientX: number, clientY: number) => {
    const { scale } = transformRef.current;
    if (scale > 1.05) {
      resetZoom(true);
      return;
    }
    const stage = stageRef.current;
    if (!stage) {
      applyTransform(2.2, 0, 0, true);
      return;
    }
    const rect = stage.getBoundingClientRect();
    const offsetX = clientX - (rect.left + rect.width / 2);
    const offsetY = clientY - (rect.top + rect.height / 2);
    const targetScale = 2.2;
    applyTransform(
      targetScale,
      -offsetX * (targetScale - 1) * 0.55,
      -offsetY * (targetScale - 1) * 0.55,
      true
    );
  };

  const handleMousePointerDown = (e: React.PointerEvent<HTMLImageElement>) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    e.preventDefault();

    const startX = e.clientX;
    const startY = e.clientY;
    const originX = transformRef.current.x;
    const originY = transformRef.current.y;
    const isPanning = transformRef.current.scale > 1.02;
    let lastDx = 0;
    setIsDraggingPan(true);

    const onMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      lastDx = dx;

      if (isPanning) {
        applyTransform(transformRef.current.scale, originX + dx, originY + dy, false);
      } else if (Math.abs(dx) > 6) {
        const el = imgRef.current;
        if (el) {
          const atBoundary =
            (dx > 0 && !hasPrevRef.current) || (dx < 0 && !hasNextRef.current);
          const effectiveDx = atBoundary ? dx * 0.25 : dx;
          el.style.transition = 'none';
          el.style.transform = `translate3d(${effectiveDx}px, 0, 0) scale(1)`;
          el.style.opacity = atBoundary
            ? '1'
            : String(Math.max(0.45, 1 - Math.abs(effectiveDx) / 420));
        }
      }
    };

    const onUp = () => {
      setIsDraggingPan(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);

      if (!isPanning) {
        if (lastDx < -60 && hasNextRef.current) {
          onNextRef.current();
        } else if (lastDx > 60 && hasPrevRef.current) {
          onPrevRef.current();
        } else if (Math.abs(lastDx) > 6) {
          resetZoom(true);
        }
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const triggerSave = async (
    nextPatch: Partial<{
      title: string;
      notes: string;
      categoryId: string | null;
    }>
  ) => {
    await onUpdate(image.id, nextPatch);
    setSaveFeedback(true);
    setTimeout(() => setSaveFeedback(false), 1400);
  };

  const handleCreateCategory = async () => {
    const trimmed = newCatName.trim();
    if (!trimmed) return;
    const created = await onCreateCategory(trimmed);
    setCategoryId(created.id);
    setNewCatName('');
    setShowNewCat(false);
    await triggerSave({ categoryId: created.id });
  };

  const handleDownload = async () => {
    let blob: Blob | null = null;
    if (image.fullUrl) {
      const res = await fetch(image.fullUrl);
      if (res.ok) blob = await res.blob();
    } else {
      const rec = await getImageById(image.id);
      if (rec) blob = rec.blob;
    }
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = image.fileName || `${image.title}.jpg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const displaySrc = fullUrl || image.thumbnailUrl || image.fullUrl || '';
  const formattedDate = new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(image.createdAt));

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-0 z-50 flex overflow-hidden bg-zinc-950/95"
      role="dialog"
      aria-modal="true"
      aria-label={`Chi tiết ảnh ${image.title}`}
    >
        {/* Unobstructed Image Viewport */}
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget && !suppressBackdropClickRef.current) {
              onClose();
            }
          }}
          className={`relative flex flex-1 items-center justify-center overflow-hidden p-4 pb-36 transition-[margin] duration-250 ease-[cubic-bezier(0.16,1,0.3,1)] sm:p-8 sm:pb-40 ${
            showInfo ? 'lg:mr-[380px]' : ''
          }`}
        >
          {/* Top-Left Circular Close Button */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng trình xem ảnh"
            className="absolute left-4 top-[calc(1rem+var(--app-safe-top))] z-20 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-zinc-900/90 text-zinc-100 shadow-lg transition-colors hover:bg-zinc-800"
          >
            <X className="h-5 w-5" />
          </button>

          {hasPrev && (
            <button
              type="button"
              onClick={onPrev}
              aria-label="Ảnh trước"
              className="absolute left-4 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-zinc-900/75 text-white hover:bg-zinc-800"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
          {hasNext && (
            <button
              type="button"
              onClick={onNext}
              aria-label="Ảnh tiếp theo"
              className="absolute right-4 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-zinc-900/75 text-white hover:bg-zinc-800"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          )}

          {/* Interactive Zoomable & Pannable Stage */}
          <motion.div
            ref={stageRef}
            data-image-stage="true"
            initial={{
              opacity: 0,
              x: zoomOrigin.x,
              y: zoomOrigin.y,
              scale: zoomOrigin.scale,
            }}
            animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
            exit={{
              opacity: 0,
              x: zoomOrigin.x,
              y: zoomOrigin.y,
              scale: zoomOrigin.scale,
            }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => {
              if (e.target === e.currentTarget && !suppressBackdropClickRef.current) {
                onClose();
              }
            }}
            className="flex h-full w-full touch-none items-center justify-center overflow-hidden"
          >
            <img
              ref={imgRef}
              src={displaySrc}
              alt={image.title}
              decoding="async"
              referrerPolicy="no-referrer"
              draggable={false}
              onPointerDown={handleMousePointerDown}
              onDoubleClick={(e) => toggleDoubleTapZoom(e.clientX, e.clientY)}
              onTouchEnd={(e) => {
                if (e.changedTouches.length !== 1 || e.touches.length > 0) return;
                const now = Date.now();
                if (now - lastTapRef.current < 280) {
                  lastTapRef.current = 0;
                  toggleDoubleTapZoom(
                    e.changedTouches[0].clientX,
                    e.changedTouches[0].clientY
                  );
                } else {
                  lastTapRef.current = now;
                }
              }}
              className={`max-h-[66vh] max-w-full select-none rounded-lg object-contain ${
                isZoomedIn
                  ? isDraggingPan
                    ? 'cursor-grabbing'
                    : 'cursor-grab'
                  : 'cursor-zoom-in'
              }`}
            />
          </motion.div>

          {/* Bottom Dock: Filmstrip Thumbnails + Action Capsule */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 z-20 flex w-max max-w-[calc(100%-2rem)] -translate-x-1/2 flex-col items-center gap-2.5"
          >
            {filmstripWindow.length > 0 && (
              <div
                aria-label="Danh sách ảnh thu nhỏ"
                onWheel={(e) => {
                  e.stopPropagation();
                  if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                    e.currentTarget.scrollLeft += e.deltaY;
                  }
                }}
                onTouchStart={(e) => e.stopPropagation()}
                onTouchMove={(e) => e.stopPropagation()}
                className="flex max-w-full items-center gap-1.5 overflow-x-auto rounded-2xl border border-white/10 bg-zinc-900/85 p-1.5 shadow-xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {filmstripWindow.map((item) => {
                  const isActive = item.id === image.id;
                  const isNearActive = isActive || nearestIdSet.has(item.id);
                  return (
                    <button
                      key={item.id}
                      ref={isActive ? activeThumbRef : null}
                      type="button"
                      onClick={() => onSelectImage(item.id)}
                      title={item.title}
                      aria-label={`Xem ${item.title}`}
                      aria-current={isActive ? 'true' : undefined}
                      className={`h-10 w-10 shrink-0 overflow-hidden rounded-lg transition-[transform,opacity,box-shadow] duration-150 sm:h-11 sm:w-11 ${
                        isActive
                          ? 'scale-105 opacity-100 ring-2 ring-white'
                          : 'opacity-55 hover:opacity-95'
                      }`}
                    >
                      <img
                        src={item.thumbnailUrl}
                        alt={item.title}
                        loading={isNearActive ? 'eager' : 'lazy'}
                        decoding="async"
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover"
                      />
                    </button>
                  );
                })}
              </div>
            )}

            {canManage && confirmDelete ? (
              <div className="inline-flex h-12 items-center gap-2 rounded-full border border-white/15 bg-zinc-900/95 px-4 text-xs text-white shadow-2xl whitespace-nowrap">
                <span className="font-medium text-rose-300">Xóa ảnh này?</span>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-full border border-white/20 px-3 py-1.5 font-medium text-zinc-200 transition-colors hover:bg-white/10"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(image.id)}
                  className="rounded-full bg-rose-600 px-3 py-1.5 font-medium text-white transition-colors hover:bg-rose-500"
                >
                  Xóa ngay
                </button>
              </div>
            ) : (
              <div className="inline-flex h-12 max-w-full items-center rounded-full border border-white/15 bg-zinc-900/90 p-1 text-zinc-100 shadow-2xl">
                {canManage && (
                  <>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(true)}
                      title="Xóa ảnh"
                      aria-label="Xóa ảnh"
                      className="inline-flex h-10 items-center justify-center rounded-full px-2.5 text-zinc-200 transition-colors hover:bg-rose-500/20 hover:text-rose-300 sm:px-4"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>

                    <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-white/15" />
                  </>
                )}

                <button
                  type="button"
                  onClick={handleDownload}
                  title="Tải xuống ảnh gốc"
                  aria-label="Tải xuống ảnh gốc"
                  className="inline-flex h-10 items-center justify-center rounded-full px-2.5 text-zinc-200 transition-colors hover:bg-white/10 hover:text-white sm:px-4"
                >
                  <Download className="h-5 w-5" />
                </button>

                <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-white/15" />

                <button
                  type="button"
                  onClick={() => setShowInfo((v) => !v)}
                  title="Thông tin ảnh"
                  aria-label="Hiển thị thông tin ảnh"
                  aria-expanded={showInfo}
                  className={`inline-flex h-10 items-center justify-center rounded-full px-2.5 transition-colors sm:px-4 ${
                    showInfo
                      ? 'bg-white text-zinc-950'
                      : 'text-zinc-200 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <Info className="h-5 w-5" />
                </button>
              </div>
            )}
          </motion.div>
        </div>

        {/* Horizontal Slide-in Metadata Drawer */}
        <AnimatePresence>
          {showInfo && (
            <motion.aside
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              onTouchStart={(e) => {
                if (e.touches.length === 1) {
                  drawerTouchStartXRef.current = e.touches[0].clientX;
                }
              }}
              onTouchMove={(e) => {
                if (drawerTouchStartXRef.current === null || e.touches.length !== 1) return;
                const deltaX = e.touches[0].clientX - drawerTouchStartXRef.current;
                if (deltaX > 55) {
                  drawerTouchStartXRef.current = null;
                  setShowInfo(false);
                }
              }}
              onTouchEnd={() => {
                drawerTouchStartXRef.current = null;
              }}
              className="fixed inset-y-0 right-0 z-30 flex w-full max-w-[380px] flex-col border-l border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950"
            >
              <div className="flex items-center justify-between border-b border-zinc-200 px-5 pb-3.5 pt-[calc(0.875rem+var(--app-safe-top))] dark:border-zinc-800">
                <div className="flex items-center gap-2.5">
                  <h2 className="font-display text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                    Thông tin ảnh
                  </h2>
                  {saveFeedback && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      <Check className="h-3.5 w-3.5" />
                      Đã lưu
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setShowInfo(false)}
                  aria-label="Đóng thông tin ảnh"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex-1 space-y-5 overflow-y-auto p-5">
                {/* Title */}
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    Tiêu đề ảnh mẫu
                  </label>
                  <input
                    type="text"
                    value={title}
                    readOnly={!canManage}
                    onChange={(e) => {
                      if (!canManage) return;
                      setTitle(e.target.value);
                    }}
                    onBlur={() => {
                      if (!canManage) return;
                      if (title.trim() && title !== image.title) {
                        triggerSave({ title: title.trim() });
                      }
                    }}
                    className={`h-10 w-full rounded-lg border border-zinc-200 px-3 text-sm font-medium focus:outline-none dark:border-zinc-800 dark:text-zinc-100 ${
                      canManage
                        ? 'bg-white text-zinc-950 focus:border-blue-600 dark:bg-zinc-900'
                        : 'bg-zinc-50 text-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-300'
                    }`}
                  />
                </div>

                {/* Category */}
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      Danh mục
                    </label>
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => setShowNewCat((v) => !v)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                      >
                        <Plus className="h-3 w-3" />
                        <span>Tạo danh mục</span>
                      </button>
                    )}
                  </div>
                  {!canManage ? (
                    <div className="flex h-10 w-full items-center rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-300">
                      {categories.find((c) => c.id === categoryId)?.name || 'Chưa phân loại'}
                    </div>
                  ) : showNewCat ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={newCatName}
                        onChange={(e) => setNewCatName(e.target.value)}
                        placeholder="Tên danh mục mới..."
                        className="h-10 min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 focus:border-blue-600 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                      />
                      <button
                        type="button"
                        onClick={handleCreateCategory}
                        className="h-10 rounded-lg bg-blue-600 px-3 text-xs font-medium text-white"
                      >
                        Lưu
                      </button>
                    </div>
                  ) : (
                    <select
                      value={categoryId}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCategoryId(val);
                        triggerSave({ categoryId: val || null });
                      }}
                      className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 focus:border-blue-600 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                    >
                      <option value="">Chưa phân loại</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Notes */}
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    Ghi chú tham khảo
                  </label>
                  <textarea
                    rows={4}
                    value={notes}
                    readOnly={!canManage}
                    onChange={(e) => {
                      if (!canManage) return;
                      setNotes(e.target.value);
                    }}
                    onBlur={() => {
                      if (!canManage) return;
                      if (notes !== image.notes) {
                        triggerSave({ notes: notes.trim() });
                      }
                    }}
                    placeholder={canManage ? 'Ghi chú về ánh sáng, bố cục, chất liệu...' : 'Không có ghi chú'}
                    className={`w-full rounded-lg border border-zinc-200 p-3 text-sm focus:outline-none dark:border-zinc-800 dark:text-zinc-100 ${
                      canManage
                        ? 'bg-white text-zinc-900 focus:border-blue-600 dark:bg-zinc-900'
                        : 'bg-zinc-50 text-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-300'
                    }`}
                  />
                </div>

                {/* File Specs */}
                <div className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
                  <dl className="grid grid-cols-2 gap-y-2 text-xs">
                    <dt className="text-zinc-500 dark:text-zinc-400">Kích thước</dt>
                    <dd className="text-right font-mono tabular-nums text-zinc-900 dark:text-zinc-200">
                      {image.width} × {image.height} px
                    </dd>
                    <dt className="text-zinc-500 dark:text-zinc-400">Dung lượng</dt>
                    <dd className="text-right font-mono tabular-nums text-zinc-900 dark:text-zinc-200">
                      {formatFileSize(image.size)}
                    </dd>
                    <dt className="text-zinc-500 dark:text-zinc-400">Định dạng</dt>
                    <dd className="text-right font-mono text-zinc-900 dark:text-zinc-200">
                      {image.mimeType.replace('image/', '').toUpperCase()}
                    </dd>
                    <dt className="text-zinc-500 dark:text-zinc-400">Ngày lưu</dt>
                    <dd className="text-right tabular-nums text-zinc-900 dark:text-zinc-200">
                      {formattedDate}
                    </dd>
                  </dl>
                </div>
              </div>

              {/* Delete Footer */}
              {canManage && (
                <div className="border-t border-zinc-200 p-4 dark:border-zinc-800">
                  {confirmDelete ? (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-rose-600 dark:text-rose-400">
                        Xác nhận xóa vĩnh viễn ảnh này?
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(false)}
                          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
                        >
                          Hủy
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(image.id)}
                          className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700"
                        >
                          Xóa ngay
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(true)}
                      className="flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-200 py-2 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-50 dark:border-zinc-800 dark:text-rose-400 dark:hover:bg-rose-950/30"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Xóa ảnh mẫu khỏi server</span>
                    </button>
                  )}
                </div>
              )}
            </motion.aside>
          )}
        </AnimatePresence>
      </motion.div>
  );
}
