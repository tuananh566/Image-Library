import { Heart, Images, LayoutGrid, Plus, Settings, X } from 'lucide-react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { useRef, useState } from 'react';
import type { AppTab, Category } from '../types/vault';

export const SIDEBAR_WIDTH_STEPS = [
  { px: 176, className: 'lg:w-44' },
  { px: 192, className: 'lg:w-48' },
  { px: 208, className: 'lg:w-52' },
  { px: 224, className: 'lg:w-56' },
  { px: 240, className: 'lg:w-60' },
  { px: 256, className: 'lg:w-64' },
  { px: 288, className: 'lg:w-72' },
  { px: 320, className: 'lg:w-80' },
  { px: 352, className: 'lg:w-88' },
  { px: 384, className: 'lg:w-96' },
] as const;

export const DEFAULT_SIDEBAR_STEP = 5; // 256px (lg:w-64)

interface SidebarProps {
  activeTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
  categories: Category[];
  totalCount: number;
  favoriteCount: number;
  categoryCounts: Record<string, number>;
  selectedCategoryId: string | 'all' | 'uncategorized' | 'favorites';
  onSelectCategory: (id: string | 'all' | 'uncategorized' | 'favorites') => void;
  onCreateCategory: (name: string) => Promise<void>;
  onOpenSettings: () => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  isDesktopCollapsed: boolean;
  onSetDesktopCollapsed: (collapsed: boolean) => void;
  widthStepIndex: number;
  onWidthStepChange: (index: number) => void;
}

export function Sidebar({
  activeTab,
  onSelectTab,
  categories,
  totalCount,
  favoriteCount,
  categoryCounts,
  selectedCategoryId,
  onSelectCategory,
  onCreateCategory,
  onOpenSettings,
  isOpenMobile,
  onCloseMobile,
  isDesktopCollapsed,
  onSetDesktopCollapsed,
  widthStepIndex,
  onWidthStepChange,
}: SidebarProps) {
  const [isAddingCat, setIsAddingCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isResizing, setIsResizing] = useState(false);

  const asideRef = useRef<HTMLElement>(null);
  const mobileTouchStartXRef = useRef<number | null>(null);

  const handleQuickCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newCatName.trim();
    if (!trimmed || isSaving) return;
    setIsSaving(true);
    try {
      await onCreateCategory(trimmed);
      setNewCatName('');
      setIsAddingCat(false);
    } finally {
      setIsSaving(false);
    }
  };

  const startResizeDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startX = e.clientX;
    const startCollapsed = isDesktopCollapsed;
    const startWidth = startCollapsed
      ? 0
      : asideRef.current?.getBoundingClientRect().width ||
        SIDEBAR_WIDTH_STEPS[widthStepIndex].px;
    let moved = false;

    setIsResizing(true);

    const handleMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX;
      if (Math.abs(deltaX) > 4) moved = true;

      const candidateWidth = startWidth + deltaX;
      if (startCollapsed) {
        if (candidateWidth >= 48) {
          onSetDesktopCollapsed(false);
          let bestIdx = 0;
          let bestDiff = Infinity;
          for (let i = 0; i < SIDEBAR_WIDTH_STEPS.length; i++) {
            const diff = Math.abs(SIDEBAR_WIDTH_STEPS[i].px - Math.max(176, candidateWidth));
            if (diff < bestDiff) {
              bestDiff = diff;
              bestIdx = i;
            }
          }
          onWidthStepChange(bestIdx);
        }
      } else {
        if (candidateWidth < 110) {
          onSetDesktopCollapsed(true);
        } else {
          onSetDesktopCollapsed(false);
          let bestIdx = 0;
          let bestDiff = Infinity;
          for (let i = 0; i < SIDEBAR_WIDTH_STEPS.length; i++) {
            const diff = Math.abs(SIDEBAR_WIDTH_STEPS[i].px - candidateWidth);
            if (diff < bestDiff) {
              bestDiff = diff;
              bestIdx = i;
            }
          }
          onWidthStepChange(bestIdx);
        }
      }
    };

    const handleUp = () => {
      setIsResizing(false);
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);

      if (!moved && startCollapsed) {
        onSetDesktopCollapsed(false);
      }
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
  };

  const scrollableContent = (
    <div className="flex flex-col gap-6 px-4 py-5">
      {/* Quick Views */}
      <div>
        <h2 className="mb-2 px-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
          Truy cập nhanh
        </h2>
        <div className="flex flex-col gap-0.5">
          <button
            type="button"
            onClick={() => {
              onSelectTab('categories');
              onCloseMobile();
            }}
            className={`flex h-10 items-center justify-between rounded-lg px-2.5 text-sm font-medium transition-colors ${
              activeTab === 'categories'
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950'
                : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900'
            }`}
          >
            <span className="flex items-center gap-2.5 truncate">
              <LayoutGrid className="h-4 w-4 shrink-0" />
              <span className="truncate">Danh mục</span>
            </span>
            <span className="tabular-nums text-xs opacity-75">{categories.length}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onSelectTab('library');
              onSelectCategory('all');
              onCloseMobile();
            }}
            className={`flex h-10 items-center justify-between rounded-lg px-2.5 text-sm font-medium transition-colors ${
              activeTab === 'library' && selectedCategoryId === 'all'
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950'
                : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900'
            }`}
          >
            <span className="flex items-center gap-2.5 truncate">
              <Images className="h-4 w-4 shrink-0" />
              <span className="truncate">Tất cả ảnh mẫu</span>
            </span>
            <span className="tabular-nums text-xs opacity-75">{totalCount}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onSelectTab('library');
              onSelectCategory('favorites');
              onCloseMobile();
            }}
            className={`flex h-10 items-center justify-between rounded-lg px-2.5 text-sm font-medium transition-colors ${
              activeTab === 'library' && selectedCategoryId === 'favorites'
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950'
                : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900'
            }`}
          >
            <span className="flex items-center gap-2.5 truncate">
              <Heart className="h-4 w-4 shrink-0" />
              <span className="truncate">Yêu thích</span>
            </span>
            <span className="tabular-nums text-xs opacity-75">{favoriteCount}</span>
          </button>
        </div>
      </div>

      {/* Custom Categories */}
      <div className="border-t border-zinc-200 pt-5 dark:border-zinc-800">
        <div className="mb-2 flex items-center justify-between px-2">
          <h2 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
            Danh mục tùy biến
          </h2>
          <button
            type="button"
            onClick={() => setIsAddingCat((v) => !v)}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/50"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Tạo mới</span>
          </button>
        </div>

        {isAddingCat && (
          <form onSubmit={handleQuickCreate} className="mb-2.5 px-1">
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder="Tên danh mục..."
                autoFocus
                className="h-9 min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-2.5 text-sm text-zinc-900 focus:border-blue-600 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
              <button
                type="submit"
                disabled={!newCatName.trim() || isSaving}
                className="h-9 rounded-lg bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                Lưu
              </button>
            </div>
          </form>
        )}

        <div className="flex flex-col gap-0.5">
          {categories.length === 0 ? (
            <p className="px-2 py-2 text-xs text-zinc-500 dark:text-zinc-400">
              Chưa có danh mục nào.
            </p>
          ) : (
            categories.map((cat) => {
              const isSelected = activeTab === 'library' && selectedCategoryId === cat.id;
              const count = categoryCounts[cat.id] || 0;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    onSelectTab('library');
                    onSelectCategory(cat.id);
                    onCloseMobile();
                  }}
                  className={`flex h-10 items-center justify-between rounded-lg px-2.5 text-sm transition-colors ${
                    isSelected
                      ? 'bg-blue-50 font-semibold text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                      : 'font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900'
                  }`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <span
                      aria-hidden="true"
                      className="h-3.5 w-3.5 shrink-0 rounded-full"
                      style={{ backgroundColor: cat.color || '#2563EB' }}
                    />
                    <span className="truncate">{cat.name}</span>
                  </span>
                  <span className="tabular-nums text-xs text-zinc-500 dark:text-zinc-400">
                    {count}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );

  const settingsFooter = (
    <div className="shrink-0 border-t border-zinc-200 p-3 dark:border-zinc-800">
      <button
        type="button"
        onClick={() => {
          onOpenSettings();
          onCloseMobile();
        }}
        className="flex h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
      >
        <Settings className="h-4 w-4 shrink-0" />
        <span>Cài đặt</span>
      </button>
    </div>
  );

  const widthClass = isDesktopCollapsed
    ? 'lg:w-0 lg:border-r-0 lg:overflow-hidden'
    : SIDEBAR_WIDTH_STEPS[widthStepIndex]?.className || 'lg:w-64';

  return (
    <>
      {/* Desktop Sidebar — independently scrollable & resizable/collapsible */}
      <aside
        ref={asideRef}
        aria-hidden={isDesktopCollapsed}
        className={`hidden h-full shrink-0 flex-col border-r border-zinc-200 bg-zinc-50/60 lg:flex dark:border-zinc-800 dark:bg-zinc-950 ${widthClass} ${
          isResizing
            ? 'select-none transition-none'
            : 'transition-[width] duration-250 ease-[cubic-bezier(0.16,1,0.3,1)]'
        }`}
      >
        <div
          className={`flex h-full min-h-0 min-w-[176px] flex-col ${
            isResizing
              ? 'transition-none'
              : 'transition-[transform,opacity] duration-250 ease-[cubic-bezier(0.16,1,0.3,1)]'
          } ${
            isDesktopCollapsed
              ? '-translate-x-6 opacity-0 pointer-events-none'
              : 'translate-x-0 opacity-100'
          }`}
        >
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
            {scrollableContent}
          </div>
          {settingsFooter}
        </div>
      </aside>

      {/* Desktop Edge Drag Handle (resize, drag left to collapse, drag right or click to expand) */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={
          isDesktopCollapsed
            ? 'Kéo sang phải hoặc nhấn để mở thanh mục lục'
            : 'Kéo để thay đổi kích thước hoặc thu gọn thanh mục lục'
        }
        title={
          isDesktopCollapsed
            ? 'Kéo ra hoặc nhấn để mở mục lục'
            : 'Kéo để chỉnh độ rộng, kéo hết sang trái để thu gọn (nhấp đúp để thu/mở)'
        }
        onPointerDown={startResizeDrag}
        onDoubleClick={() => onSetDesktopCollapsed(!isDesktopCollapsed)}
        className={`group relative z-20 hidden h-full shrink-0 cursor-col-resize touch-none items-center justify-center lg:flex ${
          isDesktopCollapsed ? 'w-3' : '-ml-1.5 w-3'
        }`}
      >
        <div
          className={`rounded-full transition-all duration-150 ${
            isResizing
              ? 'h-16 w-1 bg-blue-600 opacity-100'
              : isDesktopCollapsed
              ? 'h-12 w-1 bg-zinc-300/80 opacity-80 group-hover:h-16 group-hover:bg-blue-600 group-hover:opacity-100 dark:bg-zinc-700'
              : 'h-10 w-1 bg-zinc-300 opacity-0 group-hover:opacity-100 dark:bg-zinc-600'
          }`}
        />
      </div>

      {/* Mobile Drawer — smooth slide-in/slide-out animation + swipe-left to close */}
      <MotionConfig reducedMotion="user">
        <AnimatePresence>
          {isOpenMobile && (
            <div className="fixed inset-0 z-50 flex lg:hidden">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="fixed inset-0 bg-zinc-950/50 backdrop-blur-xs"
                onClick={onCloseMobile}
              />
              <motion.aside
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                onTouchStart={(e) => {
                  if (e.touches.length === 1) {
                    mobileTouchStartXRef.current = e.touches[0].clientX;
                  }
                }}
                onTouchMove={(e) => {
                  if (mobileTouchStartXRef.current === null || e.touches.length !== 1) return;
                  const deltaX = e.touches[0].clientX - mobileTouchStartXRef.current;
                  if (deltaX < -50) {
                    mobileTouchStartXRef.current = null;
                    onCloseMobile();
                  }
                }}
                onTouchEnd={() => {
                  mobileTouchStartXRef.current = null;
                }}
                className="relative z-10 flex h-full w-72 max-w-[85vw] flex-col border-r border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950"
              >
                <div className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-200 px-4 dark:border-zinc-800">
                  <span className="font-display text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                    Danh mục & Bộ lọc
                  </span>
                  <button
                    type="button"
                    onClick={onCloseMobile}
                    aria-label="Đóng thanh danh mục"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">{scrollableContent}</div>
                {settingsFooter}
              </motion.aside>
            </div>
          )}
        </AnimatePresence>
      </MotionConfig>
    </>
  );
}
