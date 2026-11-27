import { ArrowLeft, Menu } from 'lucide-react';

interface TopBarProps {
  title: string;
  onBack?: () => void;
  canGoBack?: boolean;
  onToggleMobileSidebar?: () => void;
  isDesktopSidebarCollapsed?: boolean;
  onToggleDesktopSidebar?: () => void;
}

export function TopBar({
  title,
  onBack,
  canGoBack = false,
  onToggleMobileSidebar,
  isDesktopSidebarCollapsed = false,
  onToggleDesktopSidebar,
}: TopBarProps) {
  return (
    <header className="standalone-safe-top sticky top-0 z-30 shrink-0 border-b border-zinc-800 bg-zinc-950">
      <div className="relative mx-auto flex h-15 max-w-[1600px] items-center justify-between gap-2 px-3 sm:h-16 sm:gap-2.5 sm:px-6">
        {/* Top-Left Control: Menu (3 lines) on left, Back arrow on right when inside a category */}
        <div className="z-10 inline-flex h-11 shrink-0 items-center rounded-xl border border-zinc-800 bg-zinc-900/80 p-1 sm:h-12">
          {onToggleMobileSidebar && (
            <button
              type="button"
              onClick={onToggleMobileSidebar}
              aria-label="Mở thanh danh mục"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 md:hidden"
            >
              <Menu className="h-[22px] w-[22px]" />
            </button>
          )}

          {onToggleDesktopSidebar && (
            <button
              type="button"
              onClick={onToggleDesktopSidebar}
              title={isDesktopSidebarCollapsed ? 'Mở thanh mục lục' : 'Thu gọn thanh mục lục'}
              aria-label={isDesktopSidebarCollapsed ? 'Mở thanh mục lục' : 'Thu gọn thanh mục lục'}
              className="hidden h-9 w-9 items-center justify-center rounded-lg text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 sm:h-10 sm:w-10 md:inline-flex"
            >
              <Menu className="h-[22px] w-[22px]" />
            </button>
          )}

          {onBack && canGoBack && (
            <>
              <span
                aria-hidden="true"
                className="mx-1 block h-6 w-px bg-zinc-700"
              />
              <button
                type="button"
                onClick={onBack}
                title="Trở lại"
                aria-label="Trở lại"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 sm:h-10 sm:w-10"
              >
                <ArrowLeft className="h-5 w-5 sm:h-[22px] sm:w-[22px]" />
              </button>
            </>
          )}
        </div>

        {/* Center Title */}
        <h1 className="min-w-0 flex-1 truncate px-1 text-center font-display text-base font-bold tracking-tight text-zinc-50 sm:pointer-events-none sm:absolute sm:left-1/2 sm:max-w-[42vw] sm:-translate-x-1/2 sm:px-2 sm:text-lg md:max-w-md">
          {title}
        </h1>

        <div className="w-11 shrink-0 sm:w-12" />
      </div>
    </header>
  );
}
