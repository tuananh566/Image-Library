import { History, Images, Search, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { AppTab } from '../types/vault';

interface BottomDockProps {
  activeTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  onClearSearch: () => void;
  isSearchOpen: boolean;
  onToggleSearch: () => void;
  onCloseSearch: () => void;
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
  searchQuery,
  onSearchQueryChange,
  onClearSearch,
  isSearchOpen,
  onToggleSearch,
  onCloseSearch,
}: BottomDockProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isSearchOpen) return;
    const id = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [isSearchOpen]);

  const hasQuery = searchQuery.trim().length > 0;
  const searchActive = isSearchOpen || hasQuery;

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

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 flex flex-col items-center gap-2 px-3 sm:bottom-5">
      {isSearchOpen && (
        <div className="pointer-events-auto w-full max-w-md rounded-full border border-zinc-700/75 bg-zinc-900/85 p-1.5 shadow-xl backdrop-blur-xl">
          <div className="flex items-center gap-2 pl-3 pr-1">
            <Search className="h-4 w-4 shrink-0 text-zinc-400" />
            <input
              ref={searchInputRef}
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  onCloseSearch();
                }
              }}
              placeholder="Tìm tên mẫu, ghi chú, album..."
              aria-label="Tìm kiếm ảnh mẫu"
              className="h-9 min-w-0 flex-1 bg-transparent text-sm text-zinc-100 placeholder:text-zinc-400 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
            />
            {hasQuery && (
              <button
                type="button"
                onClick={onClearSearch}
                className="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white"
              >
                Xóa
              </button>
            )}
            <button
              type="button"
              onClick={onCloseSearch}
              aria-label="Đóng tìm kiếm"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-300 hover:bg-zinc-800 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

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
                className={`flex min-h-[48px] min-w-[80px] shrink-0 flex-col items-center justify-center gap-0.5 whitespace-nowrap rounded-full px-3.5 py-1.5 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 sm:min-w-[94px] sm:px-5 ${
                  isActive
                    ? 'bg-zinc-100 text-zinc-950 shadow-sm'
                    : 'text-zinc-300 hover:bg-zinc-800/70 hover:text-white'
                }`}
              >
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

        {/* Standalone Circular Search Button */}
        <button
          type="button"
          onClick={onToggleSearch}
          aria-label={isSearchOpen ? 'Đóng tìm kiếm' : 'Tìm kiếm ảnh mẫu'}
          aria-expanded={isSearchOpen}
          title="Tìm kiếm"
          className={`pointer-events-auto inline-flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-full border shadow-xl backdrop-blur-xl transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${
            searchActive
              ? 'border-zinc-100 bg-zinc-100 text-zinc-950'
              : 'border-zinc-700/75 bg-zinc-900/80 text-zinc-200 hover:bg-zinc-800/85 hover:text-white'
          }`}
        >
          <Search className="h-5 w-5" strokeWidth={2.1} />
        </button>
      </div>
    </div>
  );
}
