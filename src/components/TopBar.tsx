import { ArrowLeft, ClipboardPlus, Menu } from 'lucide-react';
import type { AppTab } from '../types/vault';

interface TopBarProps {
  title: string;
  onSelectTab: (tab: AppTab) => void;
  onBack?: () => void;
  canGoBack?: boolean;
  isMobileSidebarOpen?: boolean;
  onToggleMobileSidebar?: () => void;
  isDesktopSidebarCollapsed?: boolean;
  onToggleDesktopSidebar?: () => void;
  onOpenCreateOrder?: () => void;
}

export function TopBar({
  title,
  onBack,
  canGoBack = false,
  isMobileSidebarOpen = false,
  onToggleMobileSidebar,
  isDesktopSidebarCollapsed = false,
  onToggleDesktopSidebar,
  onOpenCreateOrder,
}: TopBarProps) {
  const showBackMobile = canGoBack && !isMobileSidebarOpen;
  const showBackDesktop = canGoBack && isDesktopSidebarCollapsed;

  let backVisibilityClass = 'hidden';
  let dividerVisibilityClass = 'hidden';
  if (showBackMobile && showBackDesktop) {
    backVisibilityClass = 'inline-flex';
    dividerVisibilityClass = 'block';
  } else if (showBackMobile && !showBackDesktop) {
    backVisibilityClass = 'inline-flex md:hidden';
    dividerVisibilityClass = 'block md:hidden';
  } else if (!showBackMobile && showBackDesktop) {
    backVisibilityClass = 'hidden md:inline-flex';
    dividerVisibilityClass = 'hidden md:block';
  }

  return (
    <header className="sticky top-0 z-30 h-12 shrink-0 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur-sm">
      <div className="relative mx-auto flex h-full max-w-[1600px] items-center justify-between gap-2 px-4 sm:px-6">
        {/* Top-Left Capsule: Menu (3 lines) on left, Back arrow on right when inside a category */}
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
                className={`${dividerVisibilityClass} mx-0.5 h-4 w-px bg-zinc-700`}
              />
              <button
                type="button"
                onClick={onBack}
                title="Trở lại"
                aria-label="Trở lại"
                className={`${backVisibilityClass} h-7 w-8 shrink-0 items-center justify-center rounded-full text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500`}
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            </>
          )}
        </div>

        {/* Center: Selected Section / Category Title */}
        <h1 className="min-w-0 flex-1 truncate px-1 text-center font-display text-sm font-bold tracking-tight text-zinc-50 sm:pointer-events-none sm:absolute sm:left-1/2 sm:max-w-[42vw] sm:-translate-x-1/2 sm:px-2 sm:text-base md:max-w-md">
          {title}
        </h1>

        {/* Right: Create Order Button */}
        {onOpenCreateOrder ? (
          <button
            type="button"
            onClick={onOpenCreateOrder}
            className="z-10 inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-blue-500/70 bg-zinc-900/50 px-2.5 text-xs font-semibold text-blue-300 backdrop-blur-md transition-colors hover:border-blue-400 hover:bg-blue-500/15 hover:text-blue-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 sm:px-3.5 whitespace-nowrap"
          >
            <ClipboardPlus className="h-4 w-4 shrink-0" />
            <span>Tạo đơn hàng</span>
          </button>
        ) : (
          <div className="w-9 shrink-0" />
        )}
      </div>
    </header>
  );
}
