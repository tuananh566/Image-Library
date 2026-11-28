import { ArrowLeft, Plus, Settings } from 'lucide-react';

interface TopBarProps {
  title: string;
  onBack?: () => void;
  canGoBack?: boolean;
  onOpenSettings: () => void;
  canAdd?: boolean;
  onAddClick?: () => void;
  addTitle?: string;
}

export function TopBar({
  title,
  onBack,
  canGoBack = false,
  onOpenSettings,
  canAdd = false,
  onAddClick,
  addTitle = 'Thêm mới',
}: TopBarProps) {
  return (
    <header className="standalone-safe-top sticky top-0 z-30 shrink-0 border-b border-zinc-800 bg-zinc-950/92 backdrop-blur-md">
      <div className="relative mx-auto flex h-14 max-w-[1600px] items-center justify-between gap-2 px-3 sm:h-16 sm:gap-2.5 sm:px-6">
        {/* Top-Left Back Button (only shown when navigating back) */}
        <div className="z-10 flex min-w-11 shrink-0 items-center sm:min-w-12">
          {onBack && canGoBack && (
            <button
              type="button"
              onClick={onBack}
              title="Trở lại"
              aria-label="Trở lại"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900/85 text-zinc-200 transition-colors hover:bg-zinc-800 hover:text-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 sm:h-11 sm:w-11"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Center Title */}
        <h1 className="min-w-0 flex-1 truncate px-1 text-center font-display text-base font-bold tracking-tight text-zinc-50 sm:pointer-events-none sm:absolute sm:left-1/2 sm:max-w-[42vw] sm:-translate-x-1/2 sm:px-2 sm:text-lg md:max-w-md">
          {title}
        </h1>

        {/* Top-Right Actions: Admin Add + Settings */}
        <div className="z-10 inline-flex h-10 shrink-0 items-center gap-0.5 rounded-full border border-zinc-800 bg-zinc-900/85 p-1 sm:h-11">
          {canAdd && onAddClick && (
            <button
              type="button"
              onClick={onAddClick}
              title={addTitle}
              aria-label={addTitle}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-zinc-200 transition-colors hover:bg-zinc-800 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 sm:h-9 sm:w-9"
            >
              <Plus className="h-[19px] w-[19px]" />
            </button>
          )}
          <button
            type="button"
            onClick={onOpenSettings}
            title="Cài đặt"
            aria-label="Cài đặt"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 sm:h-9 sm:w-9"
          >
            <Settings className="h-[19px] w-[19px]" />
          </button>
        </div>
      </div>
    </header>
  );
}
