import { Check, ChevronDown, ImageIcon, Upload } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatFileSize, warmDecodedThumbnail, warmImageUrl } from '../lib/imageProcessor';
import {
  getImageCategoryIds,
  type Category,
  type ScoredImage,
  type ViewMode,
} from '../types/vault';

const INITIAL_ALBUM_BATCH_SIZE = 100;
const LOAD_MORE_STEP = 100;
const LOOKAHEAD_BUFFER = 100;
const TABLET_BREAKPOINT_PX = 768;

function getPreviewBufferCount(): number {
  if (typeof window === 'undefined') return 4;
  return window.innerWidth >= TABLET_BREAKPOINT_PX ? 8 : 4;
}

interface GalleryGridProps {
  items: ScoredImage[];
  categories: Category[];
  viewMode: ViewMode;
  scopeKey?: string;
  isSidebarCollapsed?: boolean;
  isBatchMode: boolean;
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  onLongPressSelect?: (id: string) => void;
  onOpenImage: (id: string) => void;
  onOpenUpload: () => void;
  canUpload?: boolean;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
}

function ResilientThumbnail({
  src,
  alt,
  className,
  priority = false,
  highFetchPriority = false,
}: {
  src: string;
  alt: string;
  className?: string;
  priority?: boolean;
  highFetchPriority?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  if (failed || !src) {
    return (
      <div className="flex h-full min-h-[160px] w-full flex-col items-center justify-center gap-2 bg-zinc-100 p-4 text-center dark:bg-zinc-900">
        <ImageIcon className="h-7 w-7 text-zinc-400" />
        <span className="line-clamp-2 text-xs text-zinc-500">{alt}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={highFetchPriority ? 'high' : undefined}
      decoding={priority ? 'sync' : 'async'}
      draggable={false}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}

export function GalleryGrid({
  items,
  categories,
  viewMode,
  scopeKey = '',
  isSidebarCollapsed = false,
  isBatchMode,
  selectedIds,
  onToggleSelect,
  onLongPressSelect,
  onOpenImage,
  onOpenUpload,
  canUpload = true,
  hasActiveFilters,
  onClearFilters,
}: GalleryGridProps) {
  const categoryMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories]
  );
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const [visibleCount, setVisibleCount] = useState(INITIAL_ALBUM_BATCH_SIZE);
  const [previewBuffer, setPreviewBuffer] = useState<number>(() => getPreviewBufferCount());
  const [viewportRange, setViewportRange] = useState<{ start: number; end: number }>(() => ({
    start: 0,
    end: 12,
  }));
  const gridRootRef = useRef<HTMLDivElement>(null);
  const itemsContainerRef = useRef<HTMLDivElement>(null);
  const listBodyRef = useRef<HTMLTableSectionElement>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);

  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressOriginRef = useRef<{ x: number; y: number; id: string } | null>(null);
  const suppressNextClickIdRef = useRef<string | null>(null);

  useEffect(() => {
    setVisibleCount(INITIAL_ALBUM_BATCH_SIZE);
    setViewportRange({ start: 0, end: 12 });
    const scrollRoot = gridRootRef.current?.closest('.overflow-y-auto') as HTMLElement | null;
    if (scrollRoot) {
      scrollRoot.scrollTop = 0;
    }
  }, [scopeKey]);

  const visibleItems = useMemo(
    () => items.slice(0, visibleCount),
    [items, visibleCount]
  );
  const remainingCount = Math.max(0, items.length - visibleItems.length);

  // Track visible viewport card indices and warm/decode 4 (mobile) or 8 (tablet+) thumbnails above & below
  useEffect(() => {
    const rootEl = gridRootRef.current?.closest('.overflow-y-auto') as HTMLElement | null;
    if (!rootEl || visibleItems.length === 0) return;

    let rafId: number | null = null;
    const measureViewportRange = () => {
      rafId = null;
      const container = (viewMode === 'list' ? listBodyRef.current : itemsContainerRef.current) as
        | HTMLElement
        | null;
      const children = container?.children;
      if (!children || children.length === 0) return;

      const rootRect = rootEl.getBoundingClientRect();
      const viewTop = rootRect.top;
      const viewBottom = rootRect.bottom;
      const count = children.length;

      // Binary search for the first card whose bottom >= viewTop
      let lo = 0;
      let hi = count - 1;
      let firstVisible = 0;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const rect = children[mid].getBoundingClientRect();
        if (rect.bottom >= viewTop) {
          firstVisible = mid;
          hi = mid - 1;
        } else {
          lo = mid + 1;
        }
      }

      // Binary search for the last card whose top <= viewBottom
      lo = firstVisible;
      hi = count - 1;
      let lastVisible = firstVisible;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const rect = children[mid].getBoundingClientRect();
        if (rect.top <= viewBottom) {
          lastVisible = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }

      setViewportRange((prev) =>
        prev.start === firstVisible && prev.end === lastVisible
          ? prev
          : { start: firstVisible, end: lastVisible }
      );
    };

    const scheduleMeasure = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(measureViewportRange);
    };

    const handleResize = () => {
      const nextBuf = getPreviewBufferCount();
      setPreviewBuffer((prev) => (prev === nextBuf ? prev : nextBuf));
      scheduleMeasure();
    };

    measureViewportRange();
    rootEl.addEventListener('scroll', scheduleMeasure, { passive: true });
    window.addEventListener('resize', handleResize);

    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      rootEl.removeEventListener('scroll', scheduleMeasure);
      window.removeEventListener('resize', handleResize);
    };
  }, [visibleItems.length, viewMode, scopeKey, isSidebarCollapsed]);

  const preloadWindowStart = Math.max(0, viewportRange.start - previewBuffer);
  const preloadWindowEnd = Math.min(
    Math.max(0, visibleItems.length - 1),
    viewportRange.end + previewBuffer
  );

  // Actively fetch & decode the 4 (mobile) / 8 (tablet+) thumbnails above and below the viewport
  useEffect(() => {
    if (visibleItems.length === 0) return;

    // Warm items closest to viewport first: below buffer, then above buffer
    for (let i = viewportRange.end + 1; i <= preloadWindowEnd; i++) {
      warmDecodedThumbnail(visibleItems[i]?.image.thumbnailUrl);
    }
    for (let i = viewportRange.start - 1; i >= preloadWindowStart; i--) {
      warmDecodedThumbnail(visibleItems[i]?.image.thumbnailUrl);
    }
    for (let i = viewportRange.start; i <= Math.min(viewportRange.end, visibleItems.length - 1); i++) {
      warmDecodedThumbnail(visibleItems[i]?.image.thumbnailUrl);
    }
  }, [visibleItems, viewportRange.start, viewportRange.end, preloadWindowStart, preloadWindowEnd]);

  useEffect(() => {
    if (remainingCount <= 0) return;

    const rootEl = (gridRootRef.current?.closest('.overflow-y-auto') ||
      loadMoreSentinelRef.current?.closest('.overflow-y-auto')) as HTMLElement | null;
    if (!rootEl) return;

    let rafId: number | null = null;
    const checkLookahead = () => {
      rafId = null;
      const { scrollTop, clientHeight, scrollHeight } = rootEl;
      if (scrollTop <= 24 && scrollHeight > clientHeight + 240) {
        return;
      }
      const currentVisible = Math.min(items.length, visibleCount);
      if (currentVisible >= items.length) return;

      const viewedRatio = Math.min(1, (scrollTop + clientHeight) / Math.max(1, scrollHeight));
      const viewedEndIndex = Math.ceil(viewedRatio * currentVisible);
      const targetCount = Math.min(
        items.length,
        Math.ceil((viewedEndIndex + LOOKAHEAD_BUFFER) / LOAD_MORE_STEP) * LOAD_MORE_STEP
      );

      if (targetCount > currentVisible) {
        setVisibleCount((prev) => Math.max(prev, targetCount));
      }
    };

    const handleScroll = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(checkLookahead);
    };

    rootEl.addEventListener('scroll', handleScroll, { passive: true });

    const sentinel = loadMoreSentinelRef.current;
    const observer = sentinel
      ? new IntersectionObserver(
          (entries) => {
            if (entries.some((entry) => entry.isIntersecting)) {
              setVisibleCount((prev) => Math.min(items.length, prev + LOAD_MORE_STEP));
            }
          },
          {
            root: rootEl,
            rootMargin: '800px 0px',
          }
        )
      : null;

    if (sentinel && observer) {
      observer.observe(sentinel);
    }

    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      rootEl.removeEventListener('scroll', handleScroll);
      observer?.disconnect();
    };
  }, [remainingCount, items.length, visibleCount, viewMode, scopeKey]);

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    pressOriginRef.current = null;
  };

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  const handleCardPointerDown = (e: React.PointerEvent, id: string) => {
    if (!onLongPressSelect) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    clearLongPressTimer();
    pressOriginRef.current = { x: e.clientX, y: e.clientY, id };
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      pressOriginRef.current = null;
      suppressNextClickIdRef.current = id;
      onLongPressSelect(id);
      try {
        navigator.vibrate?.(12);
      } catch {
        // Ignore unsupported vibration
      }
    }, 420);
  };

  const handleCardPointerMove = (e: React.PointerEvent) => {
    const origin = pressOriginRef.current;
    if (!origin || !longPressTimerRef.current) return;
    if (Math.hypot(e.clientX - origin.x, e.clientY - origin.y) > 10) {
      clearLongPressTimer();
    }
  };

  const handleCardClick = (id: string) => {
    if (suppressNextClickIdRef.current === id) {
      suppressNextClickIdRef.current = null;
      return;
    }
    if (isBatchMode) {
      onToggleSelect(id);
    } else {
      onOpenImage(id);
    }
  };

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-zinc-50/50 px-6 py-16 text-center dark:border-zinc-800 dark:bg-zinc-900/30">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          <ImageIcon className="h-6 w-6" />
        </div>
        <h3 className="font-display text-base font-semibold text-zinc-900 dark:text-zinc-100">
          {hasActiveFilters
            ? 'Không có ảnh mẫu nào khớp bộ lọc'
            : 'Thư viện ảnh mẫu đang trống'}
        </h3>
        <p className="mt-1.5 max-w-md text-sm text-zinc-500 dark:text-zinc-400">
          {hasActiveFilters
            ? 'Hãy thử đổi từ khóa tìm kiếm, nới lỏng thẻ tag hoặc xóa bộ lọc đang chọn.'
            : canUpload
            ? 'Kéo thả tệp ảnh vào đây, dán ảnh từ clipboard (Ctrl+V) hoặc nhấn nút thêm ảnh để lưu lên server.'
            : 'Chưa có ảnh mẫu nào trong thư viện. Vào Cài đặt để xác thực Admin nếu cần thêm ảnh.'}
        </p>
        {(hasActiveFilters || canUpload) && (
          <div className="mt-5 flex items-center gap-3">
            {hasActiveFilters ? (
              <button
                type="button"
                onClick={onClearFilters}
                className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Xóa toàn bộ bộ lọc
              </button>
            ) : (
              <button
                type="button"
                onClick={onOpenUpload}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                <Upload className="h-4 w-4" />
                <span>Thêm ảnh mẫu đầu tiên</span>
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  if (viewMode === 'list') {
    return (
      <div
        ref={gridRootRef}
        className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50/70 text-xs font-medium text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400">
                {isBatchMode && <th className="w-10 px-3 py-2.5">Chọn</th>}
                <th className="px-4 py-2.5">Ảnh mẫu</th>
                <th className="px-4 py-2.5">Danh mục</th>
                <th className="px-4 py-2.5 text-right">Kích thước</th>
                <th className="px-4 py-2.5 text-right">Dung lượng</th>
              </tr>
            </thead>
            <tbody ref={listBodyRef} className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {visibleItems.map(({ image }, index) => {
                const isSelected = selectedIdSet.has(image.id);
                const isInPreloadWindow =
                  index >= preloadWindowStart && index <= preloadWindowEnd;
                const catIds = getImageCategoryIds(image);
                const catName =
                  catIds.length > 0
                    ? catIds
                        .map((cid) => categoryMap.get(cid))
                        .filter(Boolean)
                        .join(', ') || 'Chưa phân loại'
                    : 'Chưa phân loại';

                return (
                  <tr
                    key={image.id}
                    onClick={() =>
                      isBatchMode ? onToggleSelect(image.id) : onOpenImage(image.id)
                    }
                    className={`cursor-pointer transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900/60 ${
                      isSelected ? 'bg-blue-50/60 dark:bg-blue-950/30' : ''
                    }`}
                  >
                    {isBatchMode && (
                      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => onToggleSelect(image.id)}
                          aria-label={`Chọn ${image.title}`}
                          className={`flex h-5 w-5 items-center justify-center rounded border ${
                            isSelected
                              ? 'border-blue-600 bg-blue-600 text-white'
                              : 'border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-900'
                          }`}
                        >
                          {isSelected && <Check className="h-3.5 w-3.5" />}
                        </button>
                      </td>
                    )}
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <div
                          data-image-card={image.id}
                          className="h-11 w-14 shrink-0 overflow-hidden rounded-md border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900"
                        >
                          <ResilientThumbnail
                            src={image.thumbnailUrl}
                            alt={image.title}
                            priority={isInPreloadWindow}
                            highFetchPriority={
                              index >= viewportRange.start && index <= viewportRange.end
                            }
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-zinc-900 dark:text-zinc-100 max-w-xs">
                            {image.title}
                          </p>
                          <p className="truncate text-xs text-zinc-500 dark:text-zinc-400 max-w-xs">
                            {image.fileName}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-zinc-600 dark:text-zinc-300 whitespace-nowrap">
                      {catName}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                      {image.width}×{image.height}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                      {formatFileSize(image.size)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {remainingCount > 0 && (
          <div
            ref={loadMoreSentinelRef}
            className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200 px-4 py-3 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400"
          >
            <span className="tabular-nums">
              Đang hiển thị {visibleItems.length} / {items.length} ảnh gần nhất
            </span>
            <button
              type="button"
              onClick={() =>
                setVisibleCount((prev) => Math.min(items.length, prev + LOAD_MORE_STEP))
              }
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              <ChevronDown className="h-3.5 w-3.5" />
              <span>
                Tải thêm {Math.min(LOAD_MORE_STEP, remainingCount)} ảnh (còn {remainingCount})
              </span>
            </button>
          </div>
        )}
      </div>
    );
  }

  const isMasonry = viewMode === 'masonry';
  const gridColsClass = isSidebarCollapsed
    ? 'grid-cols-2 md:portrait:grid-cols-4 md:landscape:grid-cols-6'
    : 'grid-cols-2 md:portrait:grid-cols-3 md:landscape:grid-cols-5';
  const masonryColsClass = isSidebarCollapsed
    ? 'columns-2 md:portrait:columns-4 md:landscape:columns-6'
    : 'columns-2 md:portrait:columns-3 md:landscape:columns-5';

  return (
    <div ref={gridRootRef} className="space-y-3">
      <div
        ref={itemsContainerRef}
        className={
          isMasonry
            ? `${masonryColsClass} gap-1.5 md:portrait:gap-2 md:landscape:gap-2`
            : `grid ${gridColsClass} gap-1.5 md:portrait:gap-2 md:landscape:gap-2`
        }
      >
        {visibleItems.map(({ image }, index) => {
          const isSelected = selectedIdSet.has(image.id);
          const isInPreloadWindow =
            index >= preloadWindowStart && index <= preloadWindowEnd;

          return (
            <article
              key={image.id}
              data-image-card={image.id}
              className={`group relative overflow-hidden rounded-lg border bg-white transition-[transform,border-color] duration-150 hover:-translate-y-0.5 active:scale-[0.97] dark:bg-zinc-950 ${
                isMasonry ? 'mb-1.5 break-inside-avoid md:portrait:mb-2 md:landscape:mb-2' : 'flex flex-col'
              } ${
                isSelected
                  ? 'border-blue-600 ring-2 ring-blue-600/35 dark:border-blue-500'
                  : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-800/80 dark:hover:border-zinc-700'
              }`}
            >
              {/* Image Container */}
              <div
                role="button"
                tabIndex={0}
                onMouseEnter={() => {
                  if (!isBatchMode) warmImageUrl(image.fullUrl);
                }}
                onPointerDown={(e) => {
                  if (!isBatchMode && e.pointerType === 'mouse') warmImageUrl(image.fullUrl);
                  handleCardPointerDown(e, image.id);
                }}
                onPointerMove={handleCardPointerMove}
                onPointerUp={clearLongPressTimer}
                onPointerCancel={clearLongPressTimer}
                onPointerLeave={clearLongPressTimer}
                onContextMenu={(e) => {
                  if (onLongPressSelect) e.preventDefault();
                }}
                onClick={() => handleCardClick(image.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    if (isBatchMode) onToggleSelect(image.id);
                    else onOpenImage(image.id);
                  }
                }}
                className={`relative w-full cursor-pointer overflow-hidden bg-zinc-100 focus-visible:outline-2 focus-visible:outline-blue-600 dark:bg-zinc-900 ${
                  onLongPressSelect ? 'select-none [-webkit-touch-callout:none]' : ''
                } ${
                  isMasonry ? '' : 'aspect-[4/3]'
                }`}
              >
                <ResilientThumbnail
                  src={image.thumbnailUrl}
                  alt={image.title}
                  priority={isInPreloadWindow}
                  highFetchPriority={
                    index >= viewportRange.start && index <= viewportRange.end
                  }
                  className={`w-full transition-transform duration-200 group-hover:scale-[1.02] ${
                    isMasonry ? 'h-auto block' : 'h-full object-cover'
                  }`}
                />

                {/* Hover Scrim & Quick Actions */}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/20 opacity-0 transition-opacity duration-150 group-hover:opacity-100" />

                {isBatchMode && (
                  <div className="pointer-events-none absolute bottom-2 right-2">
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full transition-colors ${
                        isSelected
                          ? 'bg-[#0A84FF] text-white ring-2 ring-white shadow-md'
                          : 'border-2 border-white/85 bg-black/40 text-transparent shadow-sm'
                      }`}
                    >
                      <Check className="h-3.5 w-3.5" strokeWidth={2.75} />
                    </span>
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {remainingCount > 0 && (
        <div
          ref={loadMoreSentinelRef}
          className="flex flex-col items-center justify-center gap-2.5 rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-4 py-4 text-center"
        >
          <p className="text-xs text-zinc-400 tabular-nums">
            Đang hiển thị {visibleItems.length} / {items.length} ảnh gần nhất
          </p>
          <button
            type="button"
            onClick={() =>
              setVisibleCount((prev) => Math.min(items.length, prev + LOAD_MORE_STEP))
            }
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-900 px-4 text-xs font-medium text-zinc-200 transition-colors hover:bg-zinc-800"
          >
            <ChevronDown className="h-3.5 w-3.5" />
            <span>
              Tải thêm {Math.min(LOAD_MORE_STEP, remainingCount)} ảnh (còn {remainingCount})
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
