import {
  FolderInput,
  History,
  Images,
  Plus,
  Trash2,
} from 'lucide-react';
import { MotionConfig, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { AppTab, Category } from '../types/vault';

interface BottomDockProps {
  activeTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
  canAdd?: boolean;
  onAddClick?: () => void;
  addTitle?: string;
  isBatchMode?: boolean;
  selectedCount?: number;
  showOnlySelected?: boolean;
  onToggleShowOnlySelected?: () => void;
  categories?: Category[];
  isAlbumBatchMode?: boolean;
  onAssignCategory?: (categoryId: string | null) => Promise<void>;
  onDeleteSelected?: () => Promise<void>;
  openMoveMenuVersion?: number;
}

function AlbumStackIcon({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-5 w-5 shrink-0"
      fill="none"
    >
      <rect
        x="6.25"
        y="3"
        width="11.5"
        height="1.8"
        rx="0.9"
        fill="currentColor"
        opacity={active ? 0.75 : 0.55}
      />
      <rect
        x="4.5"
        y="5.9"
        width="15"
        height="2"
        rx="1"
        fill="currentColor"
        opacity={active ? 0.9 : 0.75}
      />
      {active ? (
        <rect x="3" y="9" width="18" height="12" rx="2.75" fill="currentColor" />
      ) : (
        <rect
          x="3.75"
          y="9.75"
          width="16.5"
          height="10.5"
          rx="2.25"
          stroke="currentColor"
          strokeWidth="1.8"
        />
      )}
    </svg>
  );
}

export function BottomDock({
  activeTab,
  onSelectTab,
  canAdd = false,
  onAddClick,
  addTitle = 'Thêm mới',
  isBatchMode = false,
  selectedCount = 0,
  showOnlySelected = false,
  onToggleShowOnlySelected,
  categories = [],
  isAlbumBatchMode = false,
  onAssignCategory,
  onDeleteSelected,
  openMoveMenuVersion = 0,
}: BottomDockProps) {
  const [showMovePopover, setShowMovePopover] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const lastMoveVersionRef = useRef(0);

  useEffect(() => {
    if (!isBatchMode || selectedCount === 0) {
      setShowMovePopover(false);
      setShowDeleteConfirm(false);
    }
  }, [isBatchMode, selectedCount]);

  useEffect(() => {
    if (
      openMoveMenuVersion > 0 &&
      openMoveMenuVersion !== lastMoveVersionRef.current
    ) {
      lastMoveVersionRef.current = openMoveMenuVersion;
      if (isBatchMode && selectedCount > 0 && !isAlbumBatchMode) {
        setShowDeleteConfirm(false);
        setShowMovePopover(true);
      }
    }
  }, [openMoveMenuVersion, isBatchMode, selectedCount, isAlbumBatchMode]);

  const tabs: Array<{
    id: AppTab;
    label: string;
    renderIcon: (active: boolean) => React.ReactNode;
  }> = [
    {
      id: 'library',
      label: 'Thư viện',
      renderIcon: (active) => (
        <Images
          className="h-5 w-5 shrink-0"
          strokeWidth={active ? 2.2 : 1.85}
        />
      ),
    },
    {
      id: 'categories',
      label: 'Album',
      renderIcon: (active) => <AlbumStackIcon active={active} />,
    },
    {
      id: 'recent',
      label: 'Gần đây',
      renderIcon: (active) => (
        <History
          className="h-5 w-5 shrink-0"
          strokeWidth={active ? 2.2 : 1.85}
        />
      ),
    },
  ];

  if (isBatchMode) {
    return (
      <div className="pointer-events-none fixed inset-x-0 bottom-[max(0.45rem,calc(env(safe-area-inset-bottom)*0.55))] z-40 flex flex-col items-center gap-2 px-3 sm:bottom-3">
        {showMovePopover && !isAlbumBatchMode && onAssignCategory && (
          <div className="pointer-events-auto w-full max-w-xs overflow-hidden rounded-2xl border border-zinc-700/80 bg-zinc-900/95 p-1.5 shadow-2xl backdrop-blur-xl">
            <div className="px-2.5 py-1.5 text-xs font-semibold text-zinc-400">
              Chuyển {selectedCount} ảnh vào danh mục
            </div>
            <div className="max-h-56 overflow-y-auto">
              <button
                type="button"
                disabled={isProcessing}
                onClick={async () => {
                  setIsProcessing(true);
                  try {
                    await onAssignCategory(null);
                    setShowMovePopover(false);
                  } finally {
                    setIsProcessing(false);
                  }
                }}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-zinc-200 transition-colors hover:bg-zinc-800 disabled:opacity-50"
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-zinc-500" />
                <span className="truncate">Chưa phân loại</span>
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  disabled={isProcessing}
                  onClick={async () => {
                    setIsProcessing(true);
                    try {
                      await onAssignCategory(cat.id);
                      setShowMovePopover(false);
                    } finally {
                      setIsProcessing(false);
                    }
                  }}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-zinc-100 transition-colors hover:bg-zinc-800 disabled:opacity-50"
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: cat.color || '#2563EB' }}
                  />
                  <span className="truncate">{cat.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {showDeleteConfirm && onDeleteSelected && (
          <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-zinc-700/80 bg-zinc-900/95 py-1.5 pl-4 pr-1.5 shadow-2xl backdrop-blur-xl">
            <span className="tabular-nums text-xs font-medium text-zinc-200 sm:text-sm">
              Xóa {selectedCount} {isAlbumBatchMode ? 'album' : 'ảnh'}?
            </span>
            <button
              type="button"
              disabled={isProcessing}
              onClick={() => setShowDeleteConfirm(false)}
              className="rounded-full px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white"
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={isProcessing}
              onClick={async () => {
                setIsProcessing(true);
                try {
                  await onDeleteSelected();
                  setShowDeleteConfirm(false);
                } finally {
                  setIsProcessing(false);
                }
              }}
              className="rounded-full bg-rose-600 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-rose-500 disabled:opacity-50"
            >
              {isProcessing ? 'Đang xóa...' : 'Xóa'}
            </button>
          </div>
        )}

        <div className="flex w-full max-w-md items-center justify-between gap-2.5">
          {/* Bottom-Left Action Circle (Move to Album for photos; spacer for albums) */}
          {isAlbumBatchMode ? (
            <div className="h-[52px] w-[52px] shrink-0" aria-hidden="true" />
          ) : (
            <button
              type="button"
              disabled={selectedCount === 0 || isProcessing}
              onClick={() => {
                setShowDeleteConfirm(false);
                setShowMovePopover((v) => !v);
              }}
              title="Chuyển danh mục"
              aria-label="Chuyển danh mục"
              className={`pointer-events-auto inline-flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full border shadow-xl backdrop-blur-xl transition-colors disabled:opacity-40 ${
                showMovePopover
                  ? 'border-zinc-100 bg-zinc-100 text-zinc-950'
                  : 'border-zinc-700/75 bg-zinc-900/85 text-zinc-100 hover:bg-zinc-800'
              }`}
            >
              <FolderInput className="h-5 w-5" />
            </button>
          )}

          {/* Bottom-Center "Hiển thị mục đã chọn (N)" Pill */}
          <button
            type="button"
            disabled={selectedCount === 0}
            onClick={() => onToggleShowOnlySelected?.()}
            className={`pointer-events-auto h-[52px] min-w-0 flex-1 truncate rounded-full border px-4 text-center text-sm font-medium shadow-xl backdrop-blur-xl transition-colors disabled:opacity-65 ${
              showOnlySelected && selectedCount > 0
                ? 'border-zinc-100 bg-zinc-100 text-zinc-950 font-semibold'
                : 'border-zinc-700/75 bg-zinc-900/85 text-zinc-100 hover:bg-zinc-800'
            }`}
          >
            {selectedCount === 0
              ? `Chạm để chọn ${isAlbumBatchMode ? 'album' : 'ảnh'}`
              : showOnlySelected
                ? `Đang hiện đã chọn (${selectedCount})`
                : `Hiển thị mục đã chọn (${selectedCount})`}
          </button>

          {/* Bottom-Right Trash Circle */}
          <button
            type="button"
            disabled={selectedCount === 0 || isProcessing}
            onClick={() => {
              setShowMovePopover(false);
              setShowDeleteConfirm((v) => !v);
            }}
            title="Xóa các mục đã chọn"
            aria-label="Xóa các mục đã chọn"
            className={`pointer-events-auto inline-flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full border shadow-xl backdrop-blur-xl transition-colors disabled:opacity-40 ${
              showDeleteConfirm
                ? 'border-rose-500/80 bg-rose-600 text-white'
                : 'border-zinc-700/75 bg-zinc-900/85 text-zinc-100 hover:bg-zinc-800'
            }`}
          >
            <Trash2 className="h-5 w-5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="pointer-events-none fixed inset-x-0 bottom-[max(0.25rem,calc(env(safe-area-inset-bottom)*0.55))] z-40 flex flex-col items-center gap-1.5 px-2 sm:bottom-2 sm:px-3">
        <div className="flex max-w-full items-center justify-center gap-2.5 sm:gap-3">
          {/* Main Dark Frosted Dock */}
          <nav
            aria-label="Mục lục điều hướng"
            className="pointer-events-auto flex items-center gap-1 rounded-full border border-zinc-700/75 bg-zinc-900/80 p-1 shadow-xl backdrop-blur-xl"
          >
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onSelectTab(tab.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`relative z-10 flex min-h-[48px] min-w-[80px] shrink-0 flex-col items-center justify-center gap-0.5 whitespace-nowrap rounded-full px-3.5 py-1.5 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 sm:min-w-[94px] sm:px-5 ${
                    isActive
                      ? 'text-zinc-950'
                      : 'text-zinc-300 hover:text-white'
                  }`}
                >
                  {isActive && (
                    <motion.span
                      layoutId="bottom-dock-active-pill"
                      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                      className="pointer-events-none absolute inset-0 -z-10 rounded-full bg-zinc-100 shadow-sm"
                    />
                  )}
                  {tab.renderIcon(isActive)}
                  <span
                    className={`text-[11px] leading-tight tracking-tight ${
                      isActive ? 'font-semibold' : 'font-medium'
                    }`}
                  >
                    {tab.label}
                  </span>
                </button>
              );
            })}
          </nav>

          {/* Standalone Circular + (Add) Button replacing Search */}
          {canAdd && onAddClick && (
            <button
              type="button"
              onClick={onAddClick}
              aria-label={addTitle}
              title={addTitle}
              className="pointer-events-auto inline-flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-full border border-zinc-700/75 bg-zinc-900/80 text-zinc-100 shadow-xl backdrop-blur-xl transition-colors duration-150 hover:bg-zinc-800/85 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
            >
              <Plus className="h-6 w-6" strokeWidth={2.1} />
            </button>
          )}
        </div>
      </div>
    </MotionConfig>
  );
}
