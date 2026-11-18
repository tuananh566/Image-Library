import { ArrowLeft, Menu } from 'lucide-react';
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
}

export function TopBar({
  title,
  onSelectTab,
  onBack,
  canGoBack = false,
  isMobileSidebarOpen = false,
  onToggleMobileSidebar,
  isDesktopSidebarCollapsed = false,
  onToggleDesktopSidebar,
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
    <header className="sticky top-0 z-30 h-12 shrink-0 border-b border-zinc-200 bg-white/95 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/95">
      <div className="mx-auto flex h-full max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-6">
        {/* Top-Left Capsule: Menu (3 lines) on left, Back arrow on right when inside a category */}
        <div className="inline-flex h-9 shrink-0 items-center rounded-full border border-zinc-200 bg-zinc-50/80 p-1 dark:border-zinc-800 dark:bg-zinc-900/80">
          {onToggleMobileSidebar && (
            <button
              type="button"
              onClick={onToggleMobileSidebar}
              aria-label="Mở thanh danh mục"
              className="inline-flex h-7 w-8 items-center justify-center rounded-full text-zinc-700 transition-colors hover:bg-white hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 md:hidden dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
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
              className="hidden h-7 w-8 items-center justify-center rounded-full text-zinc-700 transition-colors hover:bg-white hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 md:inline-flex dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
            >
              <Menu className="h-4 w-4" />
            </button>
          )}

          {onBack && canGoBack && (
            <>
              <span
                aria-hidden="true"
                className={`${dividerVisibilityClass} mx-0.5 h-4 w-px bg-zinc-200 dark:bg-zinc-700`}
              />
              <button
                type="button"
                onClick={onBack}
                title="Trở lại"
                aria-label="Trở lại"
                className={`${backVisibilityClass} h-7 w-8 shrink-0 items-center justify-center rounded-full text-zinc-700 transition-colors hover:bg-white hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-50`}
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            </>
          )}
        </div>

        {/* Right-Aligned Selected Section Title */}
        <h1 className="max-w-[55vw] truncate font-display text-base font-bold tracking-tight text-zinc-950 whitespace-nowrap shrink-0 sm:max-w-sm dark:text-zinc-50">
          {title}
        </h1>
      </div>
    </header>
  );
}
