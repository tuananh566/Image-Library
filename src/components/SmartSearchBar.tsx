import {
  CheckSquare,
  Columns3,
  LayoutGrid,
  List,
  Plus,
  Search,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { normalizeVietnamese } from '../lib/smartSearch';
import type { Category, ViewMode } from '../types/vault';

export interface SearchSortOption {
  value: string;
  label: string;
}

interface SmartSearchBarProps {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  query: string;
  onQueryChange: (q: string) => void;
  placeholder: string;
  ariaLabel: string;
  viewMode: ViewMode;
  onViewModeChange: (v: ViewMode) => void;
  sortValue: string;
  sortOptions: SearchSortOption[];
  onSortChange: (value: string) => void;
  categories?: Category[];
  enableSmartHints?: boolean;
  isBatchMode: boolean;
  onToggleBatchMode: () => void;
  onAddClick: () => void;
  addTitle: string;
  canAdd?: boolean;
  canBatch?: boolean;
  disableShortcuts?: boolean;
}

const SYNTAX_HINTS = [
  { syntax: 'cat:hoa', desc: 'Lọc theo tên danh mục' },
  { syntax: 'ratio:ngang', desc: 'Khổ ngang, dọc hoặc vuông' },
  { syntax: '-chữ', desc: 'Loại trừ từ khóa khỏi kết quả' },
];

export function SmartSearchBar({
  isOpen,
  onOpen,
  onClose,
  query,
  onQueryChange,
  placeholder,
  ariaLabel,
  viewMode,
  onViewModeChange,
  sortValue,
  sortOptions,
  onSortChange,
  categories = [],
  enableSmartHints = false,
  isBatchMode,
  onToggleBatchMode,
  onAddClick,
  addTitle,
  canAdd = true,
  canBatch = true,
  disableShortcuts = false,
}: SmartSearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const autocompleteRef = useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  const hasActiveControls =
    query.trim() !== '' || sortValue !== 'relevance' || isBatchMode;

  useEffect(() => {
    if (isOpen) {
      const id = window.setTimeout(() => {
        inputRef.current?.focus();
      }, 20);
      return () => window.clearTimeout(id);
    } else {
      setIsFocused(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (disableShortcuts) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        setIsFocused(false);
        onClose();
        return;
      }

      const target = e.target as HTMLElement | null;
      const isInput =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        target?.isContentEditable;

      if (
        (e.key === '/' && !isInput) ||
        ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')
      ) {
        e.preventDefault();
        if (!isOpen) {
          onOpen();
        } else {
          inputRef.current?.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [disableShortcuts, isOpen, onOpen, onClose]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        autocompleteRef.current &&
        !autocompleteRef.current.contains(e.target as Node)
      ) {
        setIsFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const suggestions = useMemo(() => {
    if (!enableSmartHints) return null;
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
  }, [enableSmartHints, query, categories]);

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

  if (!isOpen) {
    if (!canAdd) {
      return (
        <div className="absolute bottom-6 right-6 z-30 inline-flex h-12 w-12 items-center justify-center rounded-full border border-zinc-200/80 bg-white/75 p-1 shadow-xl backdrop-blur-xl dark:border-zinc-700/75 dark:bg-zinc-900/75">
          <button
            type="button"
            onClick={onOpen}
            title="Tìm kiếm & bộ lọc (/)"
            aria-label="Mở thanh tìm kiếm và bộ lọc"
            className={`inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
              hasActiveControls
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'text-zinc-700 hover:bg-zinc-950/5 hover:text-zinc-950 dark:text-zinc-200 dark:hover:bg-white/10 dark:hover:text-white'
            }`}
          >
            <Search className="h-5 w-5" />
          </button>
        </div>
      );
    }

    return (
      <div className="absolute bottom-6 right-6 z-30 inline-flex h-12 items-center rounded-full border border-zinc-200/80 bg-white/75 p-1 shadow-xl backdrop-blur-xl dark:border-zinc-700/75 dark:bg-zinc-900/75">
        <button
          type="button"
          onClick={onOpen}
          title="Tìm kiếm & bộ lọc (/)"
          aria-label="Mở thanh tìm kiếm và bộ lọc"
          className={`inline-flex h-10 items-center justify-center rounded-full px-4 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
            hasActiveControls
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'text-zinc-700 hover:bg-zinc-950/5 hover:text-zinc-950 dark:text-zinc-200 dark:hover:bg-white/10 dark:hover:text-white'
          }`}
        >
          <Search className="h-5 w-5" />
        </button>

        <span
          aria-hidden="true"
          className="mx-0.5 h-5 w-px bg-zinc-300/80 dark:bg-zinc-700/80"
        />

        <button
          type="button"
          onClick={onAddClick}
          title={addTitle}
          aria-label={addTitle}
          className="inline-flex h-10 items-center justify-center rounded-full px-4 text-zinc-800 transition-colors hover:bg-zinc-950/5 hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:text-zinc-100 dark:hover:bg-white/10 dark:hover:text-white"
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>
    );
  }

  return (
    <div
      ref={barRef}
      role="region"
      aria-label="Thanh tìm kiếm và bộ lọc"
      className="absolute inset-x-3 bottom-3 z-40 mx-auto max-w-5xl rounded-2xl border border-zinc-200/80 bg-white/80 p-2.5 shadow-2xl backdrop-blur-xl sm:inset-x-6 sm:bottom-5 sm:p-3 dark:border-zinc-700/75 dark:bg-zinc-900/80"
    >
      <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
        {/* Search Input */}
        <div ref={autocompleteRef} className="relative min-w-0 flex-1">
          {/* Upward Smart Autocomplete Dropdown */}
          {enableSmartHints && isFocused && suggestions && (
            <div className="absolute bottom-full left-0 right-0 z-50 mb-2.5 rounded-xl border border-zinc-200/90 bg-white/95 p-3 shadow-xl backdrop-blur-xl dark:border-zinc-700/80 dark:bg-zinc-900/95">
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
                              applySuggestionToken(
                                `cat:${cat.name.split(/\s+/)[0].toLowerCase()}`
                              )
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

          <div className="relative flex items-center">
            <Search className="pointer-events-none absolute left-3.5 h-4 w-4 text-zinc-500 dark:text-zinc-400" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onFocus={() => setIsFocused(true)}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder={placeholder}
              aria-label={ariaLabel}
              className="h-10 w-full rounded-xl border border-zinc-300/75 bg-white/70 pl-10 pr-16 text-sm text-zinc-900 placeholder:text-zinc-500 transition-colors focus:border-blue-600 focus:bg-white focus:outline-none dark:border-zinc-700/75 dark:bg-zinc-950/65 dark:text-zinc-100 dark:placeholder:text-zinc-400 dark:focus:border-blue-500 dark:focus:bg-zinc-950"
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
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-200/70 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : (
                <kbd className="hidden rounded border border-zinc-300/80 bg-white/80 px-1.5 py-0.5 font-mono text-[11px] text-zinc-500 sm:inline-block dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-400">
                  /
                </kbd>
              )}
            </div>
          </div>
        </div>

        {/* Workspace Controls + Close */}
        <div className="flex flex-wrap items-center justify-between gap-2 shrink-0 lg:justify-end">
          <div className="flex flex-wrap items-center gap-2">
            {/* Sort Select */}
            <select
              value={sortValue}
              onChange={(e) => onSortChange(e.target.value)}
              aria-label="Bộ lọc và sắp xếp kết quả"
              className="h-9 rounded-xl border border-zinc-200/80 bg-white/75 px-2.5 text-xs font-medium text-zinc-800 focus:border-blue-600 focus:outline-none dark:border-zinc-700/75 dark:bg-zinc-950/65 dark:text-zinc-200"
            >
              {sortOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            {/* View Mode Segmented Buttons */}
            <div
              role="group"
              aria-label="Chế độ hiển thị"
              className="flex items-center rounded-xl bg-zinc-200/70 p-1 dark:bg-zinc-800/80"
            >
              <button
                type="button"
                onClick={() => onViewModeChange('grid')}
                title="Lưới đều"
                aria-label="Chế độ lưới đều"
                className={`inline-flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                  viewMode === 'grid'
                    ? 'bg-white text-zinc-950 shadow-xs dark:bg-zinc-950 dark:text-zinc-50'
                    : 'text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100'
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onViewModeChange('masonry')}
                title="Lưới so le (Masonry)"
                aria-label="Chế độ Masonry"
                className={`inline-flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                  viewMode === 'masonry'
                    ? 'bg-white text-zinc-950 shadow-xs dark:bg-zinc-950 dark:text-zinc-50'
                    : 'text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100'
                }`}
              >
                <Columns3 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onViewModeChange('list')}
                title="Danh sách chi tiết"
                aria-label="Chế độ danh sách"
                className={`inline-flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                  viewMode === 'list'
                    ? 'bg-white text-zinc-950 shadow-xs dark:bg-zinc-950 dark:text-zinc-50'
                    : 'text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100'
                }`}
              >
                <List className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Batch Selection Toggle */}
            {canBatch && (
              <button
                type="button"
                onClick={onToggleBatchMode}
                className={`inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                  isBatchMode
                    ? 'border-blue-600 bg-blue-600 text-white dark:border-blue-500 dark:bg-blue-600 dark:text-white'
                    : 'border-zinc-200/80 bg-white/75 text-zinc-800 hover:bg-white dark:border-zinc-700/75 dark:bg-zinc-950/65 dark:text-zinc-200 dark:hover:bg-zinc-800'
                }`}
              >
                <CheckSquare className="h-3.5 w-3.5" />
                <span>Chọn nhiều</span>
              </button>
            )}
          </div>

          {/* Close Floating Search Bar */}
          <button
            type="button"
            onClick={onClose}
            title="Đóng thanh tìm kiếm (Esc)"
            aria-label="Đóng thanh tìm kiếm"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-zinc-200/80 bg-white/75 text-zinc-600 transition-colors hover:bg-white hover:text-zinc-950 dark:border-zinc-700/75 dark:bg-zinc-950/65 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
