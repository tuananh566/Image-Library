import { Check, ImageIcon, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { formatFileSize, warmImageUrl } from '../lib/imageProcessor';
import type { Category, ScoredImage, ViewMode } from '../types/vault';

interface GalleryGridProps {
  items: ScoredImage[];
  categories: Category[];
  viewMode: ViewMode;
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
      decoding="async"
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
  const categoryMap = new Map(categories.map((c) => [c.id, c.name]));
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressOriginRef = useRef<{ x: number; y: number; id: string } | null>(null);
  const suppressNextClickIdRef = useRef<string | null>(null);

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
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
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
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {items.map(({ image }) => {
                const isSelected = selectedIds.includes(image.id);
                const catName = image.categoryId
                  ? categoryMap.get(image.categoryId) || 'Chưa phân loại'
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
    <div
      className={
        isMasonry
          ? `${masonryColsClass} gap-1.5 md:portrait:gap-2 md:landscape:gap-2`
          : `grid ${gridColsClass} gap-1.5 md:portrait:gap-2 md:landscape:gap-2`
      }
    >
      {items.map(({ image }, index) => {
        const isSelected = selectedIds.includes(image.id);

        return (
          <article
            key={image.id}
            data-image-card={image.id}
            className={`group relative overflow-hidden rounded-lg border bg-white [content-visibility:auto] [contain-intrinsic-size:auto_180px] transition-[transform,border-color] duration-150 hover:-translate-y-0.5 active:scale-[0.97] dark:bg-zinc-950 ${
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
                if (!isBatchMode) warmImageUrl(image.fullUrl);
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
                priority={index < 12}
                highFetchPriority={index < 6}
                className={`w-full transition-transform duration-200 group-hover:scale-[1.02] ${
                  isMasonry ? 'h-auto block' : 'h-full object-cover'
                }`}
              />

              {/* Hover Scrim & Quick Actions */}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/20 opacity-0 transition-opacity duration-150 group-hover:opacity-100" />

              {isBatchMode && (
                <div className="pointer-events-none absolute left-2.5 top-2.5">
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-md border transition-colors ${
                      isSelected
                        ? 'border-blue-500 bg-blue-600 text-white shadow'
                        : 'border-white/80 bg-black/45 text-transparent'
                    }`}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </span>
                </div>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
