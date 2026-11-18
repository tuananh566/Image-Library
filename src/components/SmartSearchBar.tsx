import {
  CheckSquare,
  Columns3,
  LayoutGrid,
  List,
  Moon,
  Search,
  Sun,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { normalizeVietnamese } from '../lib/smartSearch';
import type { AspectFilter, Category, SortOption, ViewMode } from '../types/vault';

interface SmartSearchBarProps {
  query: string;
  onQueryChange: (q: string) => void;
  aspectFilter: AspectFilter;
  onAspectFilterChange: (f: AspectFilter) => void;
  viewMode: ViewMode;
  onViewModeChange: (v: ViewMode) => void;
  sortBy: SortOption;
  onSortByChange: (s: SortOption) => void;
  categories: Category[];
  isDark: boolean;
  onToggleTheme: () => void;
  isBatchMode: boolean;
  onToggleBatchMode: () => void;
}

const SYNTAX_HINTS = [
  { syntax: 'cat:kiến trúc', desc: 'Lọc theo tên danh mục' },
  { syntax: 'ratio:ngang', desc: 'Khổ ngang, dọc hoặc vuông' },
  { syntax: 'fav:true', desc: 'Chỉ hiển thị ảnh yêu thích' },
  { syntax: '-chữ', desc: 'Loại trừ từ khóa khỏi kết quả' },
];

export function SmartSearchBar({
  query,
  onQueryChange,
  aspectFilter,
  onAspectFilterChange,
  viewMode,
  onViewModeChange,
  sortBy,
  onSortByChange,
  categories,
  isDark,
  onToggleTheme,
  isBatchMode,
  onToggleBatchMode,
}: SmartSearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable;

      if ((e.key === '/' && !isInput) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const suggestions = useMemo(() => {
    const trimmed = query.trim();
    const lastToken = trimmed.split(/\s+/).pop() || '';
    const normLast = normalizeVietnamese(lastToken);

    if (normLast.length >= 1) {
      const matchedCats = categories
        .filter((c) => normalizeVietnamese(c.name).includes(normLast))
        .slice(0, 4);
      return { type: 'cats' as const, categories: matchedCats };
    }

    return { type: 'hints' as const };
  }, [query, categories]);

  const applySuggestionToken = (replacement: string) => {
    const tokens = query.split(/\s+/);
    if (tokens.length > 0 && tokens[tokens.length - 1] !== '') {
      tokens[tokens.length - 1] = replacement;
    } else {
      tokens.push(replacement);
    }
    onQueryChange(tokens.filter(Boolean).join(' ') + ' ');
    inputRef.current?.focus();
  };

  return (
    <div className="border-b border-zinc-200 bg-white px-4 py-3.5 sm:px-6 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        {/* Smart Search Input */}
        <div ref={containerRef} className="relative flex-1 max-w-2xl">
          <div className="relative flex items-center">
            <Search className="pointer-events-none absolute left-3.5 h-4 w-4 text-zinc-400" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onFocus={() => setIsFocused(true)}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Tìm từ khóa, cat:danh mục, ratio:ngang (hỗ trợ không dấu)..."
              aria-label="Tìm kiếm thông minh theo từ khóa"
              className="h-10 w-full rounded-lg border border-zinc-300 bg-zinc-50/70 pl-10 pr-20 text-sm text-zinc-900 placeholder:text-zinc-400 transition-colors focus:border-blue-600 focus:bg-white focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-blue-500 dark:focus:bg-zinc-950"
            />
            <div className="absolute right-2.5 flex items-center gap-1.5">
              {query ? (
                <button
                  type="button"
                  onClick={() => {
                    onQueryChange('');
                    inputRef.current?.focus();
                  }}
                  aria-label="Xóa từ khóa tìm kiếm"
                  className="inline-flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : (
                <kbd className="hidden rounded border border-zinc-300 bg-white px-1.5 py-0.5 font-mono text-[11px] text-zinc-500 sm:inline-block dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
                  /
                </kbd>
              )}
            </div>
          </div>

          {/* Smart Autocomplete Dropdown */}
          {isFocused && (
            <div className="absolute left-0 right-0 top-11 z-40 rounded-xl border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
              {suggestions.type === 'cats' ? (
                <div>
                  {suggestions.categories.length > 0 ? (
                    <div>
                      <p className="mb-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                        Lọc theo danh mục
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {suggestions.categories.map((cat) => (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() =>
                              applySuggestionToken(`cat:${cat.name.split(/\s+/)[0].toLowerCase()}`)
                            }
                            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-medium text-zinc-800 hover:border-blue-500 hover:bg-blue-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-blue-950/60"
                          >
                            <span>cat:{cat.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      Đang tìm mờ không dấu trên tiêu đề, ghi chú, danh mục và tên tệp...
                    </p>
                  )}
                </div>
              ) : (
                <div>
                  <p className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    Cú pháp tìm kiếm thông minh (nhấn để chèn)
                  </p>
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {SYNTAX_HINTS.map((hint) => (
                      <button
                        key={hint.syntax}
                        type="button"
                        onClick={() => applySuggestionToken(hint.syntax)}
                        className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      >
                        <code className="font-mono font-medium text-blue-600 dark:text-blue-400">
                          {hint.syntax}
                        </code>
                        <span className="truncate pl-2 text-zinc-500 dark:text-zinc-400">
                          {hint.desc}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Workspace Controls */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {/* Aspect Ratio Segmented Control */}
          <div
            role="group"
            aria-label="Lọc tỷ lệ ảnh"
            className="flex items-center rounded-lg bg-zinc-100 p-1 dark:bg-zinc-900"
          >
            {(
              [
                { id: 'all', label: 'Tất cả' },
                { id: 'landscape', label: 'Ngang' },
                { id: 'portrait', label: 'Dọc' },
                { id: 'square', label: 'Vuông' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => onAspectFilterChange(opt.id)}
                className={`rounded-md px-2.5 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                  aspectFilter === opt.id
                    ? 'bg-white text-zinc-950 shadow-xs dark:bg-zinc-800 dark:text-zinc-50'
                    : 'text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Sort Select */}
          <select
            value={sortBy}
            onChange={(e) => onSortByChange(e.target.value as SortOption)}
            aria-label="Sắp xếp kết quả"
            className="h-9 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-700 focus:border-blue-600 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
          >
            <option value="relevance">Độ liên quan</option>
            <option value="newest">Mới lưu nhất</option>
            <option value="oldest">Cũ nhất</option>
            <option value="title">Tên A–Z</option>
            <option value="size">Dung lượng</option>
          </select>

          {/* View Mode Segmented Buttons */}
          <div
            role="group"
            aria-label="Chế độ hiển thị"
            className="flex items-center rounded-lg bg-zinc-100 p-1 dark:bg-zinc-900"
          >
            <button
              type="button"
              onClick={() => onViewModeChange('grid')}
              title="Lưới đều"
              aria-label="Chế độ lưới đều"
              className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
                viewMode === 'grid'
                  ? 'bg-white text-zinc-950 shadow-xs dark:bg-zinc-800 dark:text-zinc-50'
                  : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange('masonry')}
              title="Lưới so le (Masonry)"
              aria-label="Chế độ Masonry"
              className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
                viewMode === 'masonry'
                  ? 'bg-white text-zinc-950 shadow-xs dark:bg-zinc-800 dark:text-zinc-50'
                  : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
              }`}
            >
              <Columns3 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange('list')}
              title="Danh sách chi tiết"
              aria-label="Chế độ danh sách"
              className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
                viewMode === 'list'
                  ? 'bg-white text-zinc-950 shadow-xs dark:bg-zinc-800 dark:text-zinc-50'
                  : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
              }`}
            >
              <List className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Batch Selection Toggle */}
          <button
            type="button"
            onClick={onToggleBatchMode}
            className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
              isBatchMode
                ? 'border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/60 dark:text-blue-300'
                : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800'
            }`}
          >
            <CheckSquare className="h-3.5 w-3.5" />
            <span>Chọn nhiều</span>
          </button>

          {/* Theme Toggle */}
          <button
            type="button"
            onClick={onToggleTheme}
            title={isDark ? 'Chuyển giao diện sáng' : 'Chuyển giao diện tối'}
            aria-label={isDark ? 'Chuyển giao diện sáng' : 'Chuyển giao diện tối'}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
