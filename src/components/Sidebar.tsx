import { Images, LayoutGrid, Settings, ShoppingBag, X } from 'lucide-react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { useRef, useState } from 'react';
import type { AppTab, Category } from '../types/vault';

export const SIDEBAR_WIDTH_STEPS = [
  { px: 176, className: 'md:w-44', innerClassName: 'w-44' },
  { px: 192, className: 'md:w-48', innerClassName: 'w-48' },
  { px: 208, className: 'md:w-52', innerClassName: 'w-52' },
  { px: 224, className: 'md:w-56', innerClassName: 'w-56' },
  { px: 240, className: 'md:w-60', innerClassName: 'w-60' },
  { px: 256, className: 'md:w-64', innerClassName: 'w-64' },
  { px: 288, className: 'md:w-72', innerClassName: 'w-72' },
  { px: 320, className: 'md:w-80', innerClassName: 'w-80' },
  { px: 352, className: 'md:w-88', innerClassName: 'w-88' },
  { px: 384, className: 'md:w-96', innerClassName: 'w-96' },
] as const;

export const DEFAULT_SIDEBAR_STEP = 5; // 256px (lg:w-64)

interface SidebarProps {
  activeTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
  categories: Category[];
  totalCount: number;
  ordersCount: number;
  categoryCounts: Record<string, number>;
  selectedCategoryId: string | 'all' | 'uncategorized';
  onSelectCategory: (id: string | 'all' | 'uncategorized') => void;
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
  ordersCount,
  categoryCounts,
  selectedCategoryId,
  onSelectCategory,
  onOpenSettings,
  isOpenMobile,
  onCloseMobile,
  isDesktopCollapsed,
  onSetDesktopCollapsed,
  widthStepIndex,
  onWidthStepChange,
}: SidebarProps) {
  const [isResizing, setIsResizing] = useState(false);

  const asideRef = useRef<HTMLElement>(null);
  const mobileTouchStartXRef = useRef<number | null>(null);

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

  const renderScrollableContent = () => {
    return (
      <div className="flex min-h-full flex-col justify-between gap-4 px-4 py-4">
        {/* Navigation & Sub-categories */}
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => {
              onSelectTab('categories');
              onCloseMobile();
            }}
            className={`flex h-11 items-center justify-between rounded-xl px-3 text-[15px] font-medium transition-colors duration-150 ${
              activeTab === 'categories'
                ? 'bg-zinc-100 text-zinc-950'
                : 'text-zinc-300 hover:bg-zinc-900'
            }`}
          >
            <span className="flex items-center gap-2.5 truncate">
              <LayoutGrid className="h-[18px] w-[18px] shrink-0" />
              <span className="truncate">Album</span>
            </span>
            <span className="tabular-nums text-xs font-semibold opacity-75">
              {categories.length}
            </span>
          </button>

            {/* Compact Album sub-list nested underneath "Album" */}
            <div className="mb-2 ml-3.5 mt-1 border-l border-zinc-800 pl-2.5">
              <div className="flex flex-col gap-1">
                {categories.length === 0 ? (
                  <p className="px-2 py-1.5 text-xs text-zinc-500">
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
                        className={`flex h-9 items-center justify-between rounded-lg px-2.5 text-[13px] transition-colors duration-150 ${
                          isSelected
                            ? 'bg-blue-950/60 font-semibold text-blue-300'
                            : 'font-medium text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
                        }`}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            aria-hidden="true"
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: cat.color || '#2563EB' }}
                          />
                          <span className="truncate">{cat.name}</span>
                        </span>
                        <span className="tabular-nums text-xs text-zinc-500">
                          {count}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                onSelectTab('library');
                onSelectCategory('all');
                onCloseMobile();
              }}
              className={`flex h-11 items-center justify-between rounded-xl px-3 text-[15px] font-medium transition-colors duration-150 ${
                activeTab === 'library' && selectedCategoryId === 'all'
                  ? 'bg-zinc-100 text-zinc-950'
                  : 'text-zinc-300 hover:bg-zinc-900'
              }`}
            >
              <span className="flex items-center gap-2.5 truncate">
                <Images className="h-[18px] w-[18px] shrink-0" />
                <span className="truncate">Tất cả ảnh mẫu</span>
              </span>
              <span className="tabular-nums text-xs font-semibold opacity-75">{totalCount}</span>
            </button>
        </div>

        {/* Bottom of Upper Section: Larger White-Bordered Orders Button */}
        <button
          type="button"
          onClick={() => {
            onSelectTab('orders');
            onCloseMobile();
          }}
          className={`flex h-14 w-full shrink-0 items-center justify-between rounded-xl border border-white/90 px-4 text-base font-semibold transition-colors duration-150 sm:text-[17px] ${
            activeTab === 'orders'
              ? 'bg-zinc-100 text-zinc-950'
              : 'bg-zinc-900/60 text-zinc-50 hover:bg-zinc-900'
          }`}
        >
          <span className="flex items-center gap-2.5 truncate">
            <ShoppingBag className="h-5 w-5 shrink-0" />
            <span className="truncate">Đơn hàng</span>
          </span>
          <span className="tabular-nums text-sm font-bold opacity-85">
            {ordersCount}
          </span>
        </button>
      </div>
    );
  };

  const settingsFooter = (
    <div className="shrink-0 border-t border-zinc-800 p-3">
      <button
        type="button"
        onClick={() => {
          onOpenSettings();
          onCloseMobile();
        }}
        className="flex h-11 w-full items-center gap-2.5 rounded-xl px-3 text-[15px] font-medium text-zinc-300 transition-colors hover:bg-zinc-900"
      >
        <Settings className="h-[18px] w-[18px] shrink-0" />
        <span>Cài đặt</span>
      </button>
    </div>
  );

  const currentStep = SIDEBAR_WIDTH_STEPS[widthStepIndex] || SIDEBAR_WIDTH_STEPS[DEFAULT_SIDEBAR_STEP];
  const widthClass = isDesktopCollapsed
    ? 'md:w-0 md:border-r-transparent dark:md:border-r-transparent'
    : `${currentStep.className} border-zinc-200 dark:border-zinc-800`;

  return (
    <>
      {/* Tablet & Desktop Sidebar — independently scrollable & resizable/collapsible */}
      <aside
        ref={asideRef}
        aria-hidden={isDesktopCollapsed}
        className={`hidden h-full shrink-0 flex-col overflow-hidden border-r bg-zinc-50/60 md:flex dark:bg-zinc-950 ${widthClass} ${
          isResizing
            ? 'select-none transition-none'
            : 'transition-[width,border-color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]'
        }`}
      >
        <div
          className={`flex h-full min-h-0 shrink-0 flex-col will-change-transform ${currentStep.innerClassName} ${
            isResizing
              ? 'transition-none'
              : 'transition-[transform,opacity] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]'
          } ${
            isDesktopCollapsed
              ? 'pointer-events-none -translate-x-full opacity-0'
              : 'translate-x-0 opacity-100'
          }`}
        >
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
            {renderScrollableContent()}
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
        className={`group relative z-20 hidden h-full shrink-0 cursor-col-resize touch-none items-center justify-center transition-[width,margin] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] md:flex ${
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

      {/* Mobile Drawer — slide-in/slide-out drawer + backdrop fade + swipe-left to close */}
      <MotionConfig reducedMotion="user">
        <AnimatePresence>
          {isOpenMobile && (
            <div className="fixed inset-0 z-50 flex md:hidden">
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
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
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
                <div className="standalone-safe-top flex shrink-0 items-center justify-between border-b border-zinc-800 px-4">
                  <div className="flex h-14 w-full items-center justify-between">
                    <span className="font-display text-base font-semibold text-zinc-50">
                      Album & Bộ lọc
                    </span>
                    <button
                      type="button"
                      onClick={onCloseMobile}
                      aria-label="Đóng thanh danh mục"
                      className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  {renderScrollableContent()}
                </div>
                {settingsFooter}
              </motion.aside>
            </div>
          )}
        </AnimatePresence>
      </MotionConfig>
    </>
  );
}
