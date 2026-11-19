import {
  ArrowLeft,
  Calendar,
  Check,
  ChevronDown,
  ClipboardPlus,
  Menu,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  formatDateKeyDisplay,
  getLocalDateKey,
  getOrderFilterCounts,
  shiftDateKey,
} from '../lib/orderFilters';
import type { AppTab, OrderFilterMode, OrderRecord } from '../types/vault';

interface TopBarProps {
  title: string;
  onSelectTab: (tab: AppTab) => void;
  onBack?: () => void;
  canGoBack?: boolean;
  onToggleMobileSidebar?: () => void;
  isDesktopSidebarCollapsed?: boolean;
  onToggleDesktopSidebar?: () => void;
  onOpenCreateOrder?: () => void;
  isOrdersView?: boolean;
  orders?: OrderRecord[];
  orderFilterMode?: OrderFilterMode;
  orderFilterDate?: string;
  onChangeOrderFilterMode?: (mode: OrderFilterMode) => void;
  onChangeOrderFilterDate?: (dateKey: string) => void;
}

const ORDER_FILTER_OPTIONS: Array<{
  mode: Exclude<OrderFilterMode, 'by-date'>;
  label: string;
}> = [
  { mode: 'all', label: 'Tất cả đơn' },
  { mode: 'not-ready', label: 'Đơn chưa sẵn sàng' },
  { mode: 'unreceived', label: 'Đơn chưa nhận hàng' },
  { mode: 'received', label: 'Đơn đã nhận hàng' },
];

export function TopBar({
  title,
  onBack,
  canGoBack = false,
  onToggleMobileSidebar,
  isDesktopSidebarCollapsed = false,
  onToggleDesktopSidebar,
  onOpenCreateOrder,
  isOrdersView = false,
  orders = [],
  orderFilterMode = 'unreceived',
  orderFilterDate = getLocalDateKey(),
  onChangeOrderFilterMode,
  onChangeOrderFilterDate,
}: TopBarProps) {
  const [isOrderMenuOpen, setIsOrderMenuOpen] = useState(false);
  const orderMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOrdersView) {
      setIsOrderMenuOpen(false);
    }
  }, [isOrdersView]);

  useEffect(() => {
    if (!isOrderMenuOpen) return;

    const handlePointerDown = (e: PointerEvent) => {
      if (orderMenuRef.current && !orderMenuRef.current.contains(e.target as Node)) {
        setIsOrderMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOrderMenuOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOrderMenuOpen]);

  const filterCounts = useMemo(
    () => getOrderFilterCounts(orders, orderFilterDate),
    [orders, orderFilterDate]
  );

  const activeOrderLabel = useMemo(() => {
    if (!isOrdersView) return title;
    switch (orderFilterMode) {
      case 'unreceived':
        return 'Đơn chưa nhận';
      case 'not-ready':
        return 'Đơn chưa sẵn sàng';
      case 'received':
        return 'Đơn đã nhận';
      case 'by-date':
        return `Ngày ${formatDateKeyDisplay(orderFilterDate)}`;
      case 'all':
      default:
        return 'Tất cả đơn hàng';
    }
  }, [isOrdersView, orderFilterMode, orderFilterDate, title]);

  const todayKey = getLocalDateKey();
  const tomorrowKey = shiftDateKey(todayKey, 1);

  return (
    <header className="sticky top-0 z-30 shrink-0 border-b border-zinc-800 bg-zinc-950/95 pt-[env(safe-area-inset-top)] backdrop-blur-sm">
      <div className="relative mx-auto flex h-12 max-w-[1600px] items-center justify-between gap-1.5 px-3 sm:gap-2 sm:px-6">
        {/* Top-Left Capsule: Menu (3 lines) on left, Back arrow on right when inside a category or inside-opened orders */}
        <div className="z-10 inline-flex h-9 shrink-0 items-center rounded-full border border-zinc-800 bg-zinc-900/80 p-1">
          {onToggleMobileSidebar && (
            <button
              type="button"
              onClick={onToggleMobileSidebar}
              aria-label="Mở thanh danh mục"
              className="inline-flex h-7 w-8 items-center justify-center rounded-full text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 md:hidden"
            >
              <Menu className="h-4 w-4" />
            </button>
          )}

          {onToggleDesktopSidebar && (
            <button
              type="button"
              onClick={onToggleDesktopSidebar}
              title={isDesktopSidebarCollapsed ? 'Mở thanh mục lục' : 'Thu gọn thanh mục lục'}
              aria-label={isDesktopSidebarCollapsed ? 'Mở thanh mục lục' : 'Thu gọn thanh mục lục'}
              className="hidden h-7 w-8 items-center justify-center rounded-full text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 md:inline-flex"
            >
              <Menu className="h-4 w-4" />
            </button>
          )}

          {onBack && canGoBack && (
            <>
              <span
                aria-hidden="true"
                className="mx-0.5 block h-4 w-px bg-zinc-700"
              />
              <button
                type="button"
                onClick={onBack}
                title="Trở lại"
                aria-label="Trở lại"
                className="inline-flex h-7 w-8 shrink-0 items-center justify-center rounded-full text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            </>
          )}
        </div>

        {/* Center: Selected Section / Interactive Orders Filter Title */}
        {isOrdersView ? (
          <div
            ref={orderMenuRef}
            className="relative z-20 flex min-w-0 flex-1 justify-center sm:absolute sm:left-1/2 sm:flex-none sm:-translate-x-1/2"
          >
            <button
              type="button"
              onClick={() => setIsOrderMenuOpen((prev) => !prev)}
              aria-expanded={isOrderMenuOpen}
              aria-haspopup="menu"
              title="Chọn bộ lọc hiển thị đơn hàng"
              className="inline-flex h-9 max-w-full items-center gap-1 rounded-lg px-1.5 font-display text-[13px] font-bold tracking-tight text-zinc-50 transition-colors hover:text-blue-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 sm:gap-1.5 sm:px-2 sm:text-base"
            >
              <span className="truncate">{activeOrderLabel}</span>
              <span className="tabular-nums shrink-0 text-xs font-medium text-zinc-400">
                ({filterCounts[orderFilterMode]})
              </span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform duration-150 ${
                  isOrderMenuOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {isOrderMenuOpen && (
              <div
                role="menu"
                aria-label="Bộ lọc đơn hàng"
                className="fixed left-1/2 top-[calc(3.25rem+env(safe-area-inset-top))] z-50 w-[min(calc(100vw-2rem),20rem)] -translate-x-1/2 rounded-2xl border border-zinc-800 bg-zinc-950/98 p-1.5 shadow-2xl backdrop-blur-md sm:absolute sm:top-full sm:mt-2 sm:w-80"
              >
                <div className="px-2.5 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  Hiển thị đơn hàng
                </div>

                <div className="space-y-0.5">
                  {ORDER_FILTER_OPTIONS.map((opt) => {
                    const isSelected = orderFilterMode === opt.mode;
                    return (
                      <button
                        key={opt.mode}
                        type="button"
                        role="menuitemradio"
                        aria-checked={isSelected}
                        onClick={() => {
                          onChangeOrderFilterMode?.(opt.mode);
                          setIsOrderMenuOpen(false);
                        }}
                        className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                          isSelected
                            ? 'bg-blue-600/20 font-semibold text-blue-300'
                            : 'font-medium text-zinc-200 hover:bg-zinc-900'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <Check
                            className={`h-4 w-4 shrink-0 ${
                              isSelected ? 'text-blue-400' : 'opacity-0'
                            }`}
                          />
                          <span>{opt.label}</span>
                        </span>
                        <span className="tabular-nums rounded-md bg-zinc-900 px-1.5 py-0.5 text-xs font-semibold text-zinc-400">
                          {filterCounts[opt.mode]}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="my-1.5 border-t border-zinc-800/80" />

                {/* By-Date Section */}
                <div
                  className={`rounded-xl p-2 transition-colors ${
                    orderFilterMode === 'by-date' ? 'bg-blue-600/15' : 'bg-zinc-900/40'
                  }`}
                >
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={orderFilterMode === 'by-date'}
                    onClick={() => {
                      onChangeOrderFilterMode?.('by-date');
                      setIsOrderMenuOpen(false);
                    }}
                    className="flex w-full items-center justify-between gap-2 rounded-lg px-1 py-1 text-left text-sm font-medium text-zinc-100 hover:text-blue-300"
                  >
                    <span className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 shrink-0 text-blue-400" />
                      <span
                        className={
                          orderFilterMode === 'by-date'
                            ? 'font-semibold text-blue-300'
                            : ''
                        }
                      >
                        Đơn hàng theo ngày
                      </span>
                    </span>
                    <span className="tabular-nums rounded-md bg-zinc-900 px-1.5 py-0.5 text-xs font-semibold text-zinc-400">
                      {filterCounts['by-date']}
                    </span>
                  </button>

                  <div className="mt-2 flex items-center gap-1.5">
                    <input
                      type="date"
                      value={orderFilterDate}
                      aria-label="Chọn ngày xem đơn hàng"
                      onChange={(e) => {
                        const val = e.target.value;
                        if (!val) return;
                        onChangeOrderFilterDate?.(val);
                        onChangeOrderFilterMode?.('by-date');
                      }}
                      className="tabular-nums h-8 min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 text-xs text-zinc-100 focus:border-blue-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        onChangeOrderFilterDate?.(todayKey);
                        onChangeOrderFilterMode?.('by-date');
                        setIsOrderMenuOpen(false);
                      }}
                      className={`h-8 shrink-0 rounded-lg border px-2 text-xs font-medium transition-colors whitespace-nowrap ${
                        orderFilterMode === 'by-date' && orderFilterDate === todayKey
                          ? 'border-blue-500 bg-blue-600/25 text-blue-200'
                          : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800'
                      }`}
                    >
                      Hôm nay
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onChangeOrderFilterDate?.(tomorrowKey);
                        onChangeOrderFilterMode?.('by-date');
                        setIsOrderMenuOpen(false);
                      }}
                      className={`h-8 shrink-0 rounded-lg border px-2 text-xs font-medium transition-colors whitespace-nowrap ${
                        orderFilterMode === 'by-date' && orderFilterDate === tomorrowKey
                          ? 'border-blue-500 bg-blue-600/25 text-blue-200'
                          : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800'
                      }`}
                    >
                      Ngày mai
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <h1 className="min-w-0 flex-1 truncate px-1 text-center font-display text-sm font-bold tracking-tight text-zinc-50 sm:pointer-events-none sm:absolute sm:left-1/2 sm:max-w-[42vw] sm:-translate-x-1/2 sm:px-2 sm:text-base md:max-w-md">
            {title}
          </h1>
        )}

        {/* Right: Create Order Button */}
        {onOpenCreateOrder ? (
          <button
            type="button"
            onClick={onOpenCreateOrder}
            className="z-10 inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-blue-500/70 bg-zinc-900/50 px-2.5 text-xs font-semibold text-blue-300 backdrop-blur-md transition-colors hover:border-blue-400 hover:bg-blue-500/15 hover:text-blue-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 sm:px-3.5 whitespace-nowrap"
          >
            <ClipboardPlus className="h-4 w-4 shrink-0" />
            <span className="sm:hidden">Tạo đơn</span>
            <span className="hidden sm:inline">Tạo đơn hàng</span>
          </button>
        ) : (
          <div className="w-9 shrink-0" />
        )}
      </div>
    </header>
  );
}
