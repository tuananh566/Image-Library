import { Folder, FolderOpen, Heart, Images, Plus, X } from 'lucide-react';
import { useState } from 'react';
import type { Category } from '../types/vault';

interface SidebarProps {
  categories: Category[];
  totalCount: number;
  favoriteCount: number;
  uncategorizedCount: number;
  categoryCounts: Record<string, number>;
  selectedCategoryId: string | 'all' | 'uncategorized' | 'favorites';
  onSelectCategory: (id: string | 'all' | 'uncategorized' | 'favorites') => void;
  onCreateCategory: (name: string) => Promise<void>;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({
  categories,
  totalCount,
  favoriteCount,
  uncategorizedCount,
  categoryCounts,
  selectedCategoryId,
  onSelectCategory,
  onCreateCategory,
  isOpenMobile,
  onCloseMobile,
}: SidebarProps) {
  const [isAddingCat, setIsAddingCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

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

  const content = (
    <div className="flex h-full flex-col gap-6 overflow-y-auto px-4 py-5">
      {/* Quick Views */}
      <div>
        <h2 className="mb-2 px-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
          Truy cập nhanh
        </h2>
        <div className="flex flex-col gap-0.5">
          <button
            type="button"
            onClick={() => {
              onSelectCategory('all');
              onCloseMobile();
            }}
            className={`flex h-10 items-center justify-between rounded-lg px-2.5 text-sm font-medium transition-colors ${
              selectedCategoryId === 'all'
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
              onSelectCategory('favorites');
              onCloseMobile();
            }}
            className={`flex h-10 items-center justify-between rounded-lg px-2.5 text-sm font-medium transition-colors ${
              selectedCategoryId === 'favorites'
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

          <button
            type="button"
            onClick={() => {
              onSelectCategory('uncategorized');
              onCloseMobile();
            }}
            className={`flex h-10 items-center justify-between rounded-lg px-2.5 text-sm font-medium transition-colors ${
              selectedCategoryId === 'uncategorized'
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950'
                : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900'
            }`}
          >
            <span className="flex items-center gap-2.5 truncate">
              <FolderOpen className="h-4 w-4 shrink-0" />
              <span className="truncate">Chưa phân loại</span>
            </span>
            <span className="tabular-nums text-xs opacity-75">{uncategorizedCount}</span>
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
              const isSelected = selectedCategoryId === cat.id;
              const count = categoryCounts[cat.id] || 0;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
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
                    <Folder
                      className="h-4 w-4 shrink-0"
                      style={{ color: cat.color || '#2563EB' }}
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

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-zinc-200 bg-zinc-50/60 lg:block dark:border-zinc-800 dark:bg-zinc-950">
        {content}
      </aside>

      {/* Mobile Drawer */}
      {isOpenMobile && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-zinc-950/50 backdrop-blur-xs"
            onClick={onCloseMobile}
          />
          <aside className="relative z-10 flex w-72 max-w-[85vw] flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex h-14 items-center justify-between border-b border-zinc-200 px-4 dark:border-zinc-800">
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
            <div className="flex-1 overflow-y-auto">{content}</div>
          </aside>
        </div>
      )}
    </>
  );
}
