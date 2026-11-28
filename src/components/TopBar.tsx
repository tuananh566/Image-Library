import { ArrowLeft, MoreHorizontal, Settings, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface TopBarProps {
  title: string;
  onBack?: () => void;
  canGoBack?: boolean;
  onOpenSettings: () => void;
  canSelect?: boolean;
  isBatchMode?: boolean;
  selectedCount?: number;
  totalSelectableCount?: number;
  onEnterBatchMode?: () => void;
  onExitBatchMode?: () => void;
  onSelectAll?: () => void;
  onClearSelection?: () => void;
  onOpenMoveMenu?: () => void;
  onCreateAlbumFromSelected?: () => void;
}

export function TopBar({
  title,
  onBack,
  canGoBack = false,
  onOpenSettings,
  canSelect = false,
  isBatchMode = false,
  selectedCount = 0,
  totalSelectableCount = 0,
  onEnterBatchMode,
  onExitBatchMode,
  onSelectAll,
  onClearSelection,
  onOpenMoveMenu,
  onCreateAlbumFromSelected,
}: TopBarProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isBatchMode) {
      setIsMenuOpen(false);
    }
  }, [isBatchMode]);

  useEffect(() => {
    if (!isMenuOpen) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (
        menuContainerRef.current &&
        !menuContainerRef.current.contains(e.target as Node)
      ) {
        setIsMenuOpen(false);
      }
    };
    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [isMenuOpen]);

  const allSelected =
    totalSelectableCount > 0 && selectedCount >= totalSelectableCount;

  if (isBatchMode) {
    return (
      <header className="standalone-safe-top sticky top-0 z-30 shrink-0 border-b border-zinc-800/80 bg-zinc-950/92 backdrop-blur-md">
        <div className="relative mx-auto flex h-14 max-w-[1600px] items-center justify-between gap-2 px-3 sm:h-16 sm:px-6">
          {/* Top-Left Select All / Deselect All Pill */}
          <button
            type="button"
            onClick={() => {
              if (allSelected) {
                onClearSelection?.();
              } else {
                onSelectAll?.();
              }
            }}
            disabled={totalSelectableCount === 0}
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-full border border-zinc-700/75 bg-zinc-900/85 px-4 text-sm font-medium text-zinc-100 backdrop-blur-xl transition-colors hover:bg-zinc-800 disabled:opacity-45 sm:h-11"
          >
            {allSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
          </button>

          {/* Top-Right [... | X] Pill */}
          <div ref={menuContainerRef} className="relative z-10 shrink-0">
            <div className="inline-flex h-10 items-center gap-0.5 rounded-full border border-zinc-700/75 bg-zinc-900/85 p-1 backdrop-blur-xl sm:h-11">
              <button
                type="button"
                onClick={() => setIsMenuOpen((v) => !v)}
                aria-label="Tùy chọn chọn nhiều"
                aria-expanded={isMenuOpen}
                className="inline-flex h-8 w-9 items-center justify-center rounded-full text-zinc-100 transition-colors hover:bg-zinc-800 sm:h-9 sm:w-10"
              >
                <MoreHorizontal className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  onExitBatchMode?.();
                }}
                aria-label="Thoát chế độ chọn"
                className="inline-flex h-8 w-9 items-center justify-center rounded-full text-zinc-100 transition-colors hover:bg-zinc-800 sm:h-9 sm:w-10"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {isMenuOpen && (
              <div className="absolute right-0 top-12 z-40 w-52 overflow-hidden rounded-2xl border border-zinc-700/80 bg-zinc-900/95 p-1.5 text-sm shadow-2xl backdrop-blur-xl">
                {selectedCount < totalSelectableCount && onSelectAll && (
                  <button
                    type="button"
                    onClick={() => {
                      onSelectAll();
                      setIsMenuOpen(false);
                    }}
                    className="flex w-full items-center rounded-xl px-3 py-2 text-left text-zinc-100 transition-colors hover:bg-zinc-800"
                  >
                    Chọn tất cả
                  </button>
                )}
                {selectedCount > 0 && onClearSelection && (
                  <button
                    type="button"
                    onClick={() => {
                      onClearSelection();
                      setIsMenuOpen(false);
                    }}
                    className="flex w-full items-center rounded-xl px-3 py-2 text-left text-zinc-100 transition-colors hover:bg-zinc-800"
                  >
                    Bỏ chọn tất cả
                  </button>
                )}
                {onCreateAlbumFromSelected && (
                  <button
                    type="button"
                    disabled={selectedCount === 0}
                    onClick={() => {
                      setIsMenuOpen(false);
                      onCreateAlbumFromSelected();
                    }}
                    className="flex w-full items-center rounded-xl px-3 py-2 text-left text-zinc-100 transition-colors hover:bg-zinc-800 disabled:opacity-40"
                  >
                    Tạo thành album mới
                  </button>
                )}
                {onOpenMoveMenu && (
                  <button
                    type="button"
                    disabled={selectedCount === 0}
                    onClick={() => {
                      setIsMenuOpen(false);
                      onOpenMoveMenu();
                    }}
                    className="flex w-full items-center rounded-xl px-3 py-2 text-left text-zinc-100 transition-colors hover:bg-zinc-800 disabled:opacity-40"
                  >
                    Chuyển danh mục...
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    onExitBatchMode?.();
                  }}
                  className="flex w-full items-center rounded-xl px-3 py-2 text-left text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white"
                >
                  Xong
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="standalone-safe-top sticky top-0 z-30 shrink-0 border-b border-zinc-800 bg-zinc-950/92 backdrop-blur-md">
      <div className="relative mx-auto flex h-14 max-w-[1600px] items-center justify-between gap-2 px-3 sm:h-16 sm:gap-2.5 sm:px-6">
        {/* Top-Left: Optional Back Arrow + Select ("Chọn") Pill */}
        <div className="z-10 flex min-w-10 shrink-0 items-center sm:min-w-11">
          {canGoBack && onBack && canSelect && onEnterBatchMode ? (
            <div className="inline-flex h-10 items-center gap-0.5 rounded-full border border-zinc-700/75 bg-zinc-900/85 p-1 backdrop-blur-xl sm:h-11">
              <button
                type="button"
                onClick={onBack}
                title="Trở lại"
                aria-label="Trở lại"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-zinc-200 transition-colors hover:bg-zinc-800 hover:text-white sm:h-9 sm:w-9"
              >
                <ArrowLeft className="h-[19px] w-[19px]" />
              </button>
              <span aria-hidden="true" className="h-4 w-px bg-zinc-700/80" />
              <button
                type="button"
                onClick={onEnterBatchMode}
                className="inline-flex h-8 items-center rounded-full px-2.5 text-xs font-semibold text-zinc-100 transition-colors hover:bg-zinc-800 sm:h-9 sm:px-3 sm:text-sm"
              >
                Chọn
              </button>
            </div>
          ) : canGoBack && onBack ? (
            <button
              type="button"
              onClick={onBack}
              title="Trở lại"
              aria-label="Trở lại"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-zinc-700/75 bg-zinc-900/85 text-zinc-200 backdrop-blur-xl transition-colors hover:bg-zinc-800 hover:text-white sm:h-11 sm:w-11"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          ) : canSelect && onEnterBatchMode ? (
            <button
              type="button"
              onClick={onEnterBatchMode}
              className="inline-flex h-10 shrink-0 items-center justify-center rounded-full border border-zinc-700/75 bg-zinc-900/85 px-4 text-sm font-semibold text-zinc-100 backdrop-blur-xl transition-colors hover:bg-zinc-800 sm:h-11"
            >
              Chọn
            </button>
          ) : null}
        </div>

        {/* Center Title */}
        <h1 className="min-w-0 flex-1 truncate px-1 text-center font-display text-base font-bold tracking-tight text-zinc-50 sm:pointer-events-none sm:absolute sm:left-1/2 sm:max-w-[42vw] sm:-translate-x-1/2 sm:px-2 sm:text-lg md:max-w-md">
          {title}
        </h1>

        {/* Top-Right Settings Button */}
        <div className="z-10 flex shrink-0 items-center">
          <button
            type="button"
            onClick={onOpenSettings}
            title="Cài đặt"
            aria-label="Cài đặt"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-700/75 bg-zinc-900/85 text-zinc-200 backdrop-blur-xl transition-colors hover:bg-zinc-800 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 sm:h-11 sm:w-11"
          >
            <Settings className="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>
  );
}
