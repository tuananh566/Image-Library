import {
  Check,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { normalizeVietnamese } from '../lib/smartSearch';
import type { Category, VaultImageView, ViewMode } from '../types/vault';
import { SmartSearchBar, type SearchSortOption } from './SmartSearchBar';

type CategorySortOption = 'relevance' | 'newest' | 'oldest' | 'title' | 'count';

const CATEGORY_SORT_OPTIONS: SearchSortOption[] = [
  { value: 'relevance', label: 'Bộ lọc' },
  { value: 'newest', label: 'Mới tạo nhất' },
  { value: 'oldest', label: 'Cũ nhất' },
  { value: 'title', label: 'Tên A–Z' },
  { value: 'count', label: 'Nhiều ảnh nhất' },
];

interface CategoriesViewProps {
  categories: Category[];
  images: VaultImageView[];
  isSearchOpen: boolean;
  onOpenSearch: () => void;
  onCloseSearch: () => void;
  disableShortcuts?: boolean;
  onCreateCategory: (data: {
    name: string;
    description: string;
    color: string;
  }) => Promise<void>;
  onUpdateCategory: (category: Category) => Promise<void>;
  onDeleteCategory: (id: string) => Promise<void>;
  onDeleteCategories?: (ids: string[]) => Promise<void>;
  onOpenCategoryInLibrary: (categoryId: string, sourceRect?: DOMRect) => void;
}

const PRESET_COLORS = [
  '#2563EB',
  '#0284C7',
  '#16A34A',
  '#D97706',
  '#DC2626',
  '#7C3AED',
  '#DB2777',
  '#0F172A',
];

function getRandomPresetColor(exclude?: string): string {
  const pool = PRESET_COLORS.slice(0, 6);
  const filtered = exclude ? pool.filter((c) => c !== exclude) : pool;
  const source = filtered.length > 0 ? filtered : pool;
  return source[Math.floor(Math.random() * source.length)];
}

export function CategoriesView({
  categories,
  images,
  isSearchOpen,
  onOpenSearch,
  onCloseSearch,
  disableShortcuts = false,
  onCreateCategory,
  onUpdateCategory,
  onDeleteCategory,
  onDeleteCategories,
  onOpenCategoryInLibrary,
}: CategoriesViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<CategorySortOption>('relevance');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmBatchDelete, setConfirmBatchDelete] = useState(false);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(() => getRandomPresetColor());
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editColor, setEditColor] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (editingCategory) setEditingCategory(null);
        else if (isCreateOpen) setIsCreateOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCreateOpen, editingCategory]);

  const imagesByCategory = useMemo(() => {
    const map = new Map<string, VaultImageView[]>();
    for (const img of images) {
      if (!img.categoryId) continue;
      const list = map.get(img.categoryId);
      if (list) list.push(img);
      else map.set(img.categoryId, [img]);
    }
    return map;
  }, [images]);

  const filteredCategories = useMemo(() => {
    const normQuery = normalizeVietnamese(searchQuery);
    const terms = normQuery ? normQuery.split(/\s+/).filter(Boolean) : [];

    const matched = terms.length
      ? categories.filter((cat) => {
          const hay = normalizeVietnamese(`${cat.name} ${cat.description}`);
          return terms.every((t) => hay.includes(t));
        })
      : [...categories];

    matched.sort((a, b) => {
      if (sortBy === 'newest') return b.createdAt - a.createdAt;
      if (sortBy === 'oldest') return a.createdAt - b.createdAt;
      if (sortBy === 'title') return a.name.localeCompare(b.name, 'vi');
      if (sortBy === 'count') {
        const countA = imagesByCategory.get(a.id)?.length || 0;
        const countB = imagesByCategory.get(b.id)?.length || 0;
        return countB - countA;
      }
      return a.order - b.order;
    });

    return matched;
  }, [categories, searchQuery, sortBy, imagesByCategory]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const openCreateModal = () => {
    setName('');
    setDescription('');
    setColor((prev) => getRandomPresetColor(prev));
    setIsCreateOpen(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onCreateCategory({
        name: name.trim(),
        description: description.trim(),
        color,
      });
      setName('');
      setDescription('');
      setColor((prev) => getRandomPresetColor(prev));
      setIsCreateOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditModal = (cat: Category) => {
    setEditingCategory(cat);
    setEditName(cat.name);
    setEditDesc(cat.description);
    setEditColor(cat.color || PRESET_COLORS[0]);
    setConfirmDelete(false);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory || !editName.trim() || isSavingEdit) return;
    setIsSavingEdit(true);
    try {
      await onUpdateCategory({
        ...editingCategory,
        name: editName.trim(),
        description: editDesc.trim(),
        color: editColor,
      });
      setEditingCategory(null);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDelete = async () => {
    if (!editingCategory || isSavingEdit) return;
    setIsSavingEdit(true);
    try {
      await onDeleteCategory(editingCategory.id);
      setEditingCategory(null);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) return;
    if (onDeleteCategories) {
      await onDeleteCategories(selectedIds);
    } else {
      for (const id of selectedIds) {
        await onDeleteCategory(id);
      }
    }
    setSelectedIds([]);
    setConfirmBatchDelete(false);
    setIsBatchMode(false);
  };

  const isMasonry = viewMode === 'masonry';
  const gridColsClass = 'grid-cols-2 md:portrait:grid-cols-2 md:landscape:grid-cols-3';
  const masonryColsClass = 'columns-2 md:portrait:columns-2 md:landscape:columns-3';

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {/* Scrollable Category Area */}
      <div className="min-h-0 flex-1 overflow-y-auto touch-pan-y p-4 pb-28 sm:p-6 sm:pb-28">
        {/* Batch Selection Bar */}
        {isBatchMode && (
          selectedIds.length === 0 ? (
            <div className="mb-4 flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-xs dark:border-zinc-800 dark:bg-zinc-900">
              <span className="text-zinc-600 dark:text-zinc-400">
                Chế độ chọn nhiều đang bật — nhấp vào các danh mục để chọn hàng loạt.
              </span>
              <button
                type="button"
                onClick={() => setSelectedIds(filteredCategories.map((c) => c.id))}
                className="font-medium text-blue-600 hover:underline dark:text-blue-400"
              >
                Chọn tất cả danh mục đang hiển thị
              </button>
            </div>
          ) : (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50/70 px-4 py-2.5 dark:border-blue-900 dark:bg-blue-950/40">
              <div className="flex items-center gap-3">
                <span className="tabular-nums text-xs font-semibold text-blue-800 dark:text-blue-200">
                  Đã chọn {selectedIds.length} danh mục
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedIds(filteredCategories.map((c) => c.id))}
                  className="text-xs font-medium text-blue-700 hover:underline dark:text-blue-300"
                >
                  Chọn tất cả
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedIds([])}
                  className="text-xs text-zinc-600 hover:underline dark:text-zinc-400"
                >
                  Bỏ chọn
                </button>
              </div>

              <div>
                {confirmBatchDelete ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setConfirmBatchDelete(false)}
                      className="inline-flex h-8 items-center rounded-lg border border-zinc-300 bg-white px-2.5 text-xs font-medium dark:border-zinc-700 dark:bg-zinc-900"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={handleBatchDelete}
                      className="h-8 rounded-lg bg-rose-600 px-3 text-xs font-medium text-white hover:bg-rose-700"
                    >
                      Xóa {selectedIds.length} danh mục
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmBatchDelete(true)}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-rose-200 bg-white px-2.5 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:border-rose-900 dark:bg-zinc-900 dark:text-rose-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Xóa</span>
                  </button>
                )}
              </div>
            </div>
          )
        )}

        {filteredCategories.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
            {searchQuery.trim()
              ? 'Không tìm thấy danh mục nào khớp từ khóa.'
              : 'Bạn chưa tạo danh mục nào. Nhấn nút dấu + ở góc dưới bên phải để tạo danh mục mới.'}
          </div>
        ) : viewMode === 'list' ? (
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50/70 text-xs font-medium text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400">
                    {isBatchMode && <th className="w-10 px-3 py-2.5">Chọn</th>}
                    <th className="px-4 py-2.5">Danh mục</th>
                    <th className="px-4 py-2.5 text-right">Số ảnh</th>
                    <th className="w-14 px-4 py-2.5 text-right">Sửa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {filteredCategories.map((cat) => {
                    const catImages = imagesByCategory.get(cat.id) || [];
                    const isSelected = selectedIds.includes(cat.id);

                    return (
                      <tr
                        key={cat.id}
                        data-category-card={cat.id}
                        onClick={(e) =>
                          isBatchMode
                            ? toggleSelect(cat.id)
                            : onOpenCategoryInLibrary(cat.id, e.currentTarget.getBoundingClientRect())
                        }
                        className={`cursor-pointer transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900/60 ${
                          isSelected ? 'bg-blue-50/60 dark:bg-blue-950/30' : ''
                        }`}
                      >
                        {isBatchMode && (
                          <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => toggleSelect(cat.id)}
                              aria-label={`Chọn ${cat.name}`}
                              className={`flex h-5 w-5 items-center justify-center rounded border ${
                                isSelected
                                  ? 'border-blue-600 bg-blue-600 text-white'
                                  : 'border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-900'
                              }`}
                            >
                              {isSelected && <Check className="h-3.5 w-3.5" />}
                            </button>
                          </td>
                        )}
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-3">
                            <div className="flex h-11 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900">
                              {catImages[0] ? (
                                <img
                                  src={catImages[0].thumbnailUrl}
                                  alt={cat.name}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <span
                                  aria-hidden="true"
                                  className="h-4 w-4 shrink-0 rounded-full"
                                  style={{ backgroundColor: cat.color || '#2563EB' }}
                                />
                              )}
                            </div>
                            <span className="truncate font-medium text-zinc-900 dark:text-zinc-100">
                              {cat.name}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                          {catImages.length}
                        </td>
                        <td
                          className="px-4 py-2.5 text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => openEditModal(cat)}
                            aria-label={`Chỉnh sửa ${cat.name}`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div
            className={
              isMasonry
                ? `${masonryColsClass} gap-3.5 sm:gap-5`
                : `grid ${gridColsClass} gap-3.5 sm:gap-5`
            }
          >
            {filteredCategories.map((cat) => {
              const catImages = imagesByCategory.get(cat.id) || [];
              const previewImages = catImages.slice(0, 4);
              const remainingCount = Math.max(0, catImages.length - 4);
              const isSelected = selectedIds.includes(cat.id);

              return (
                <article
                  key={cat.id}
                  data-category-card={cat.id}
                  role="button"
                  tabIndex={0}
                  onClick={(e) =>
                    isBatchMode
                      ? toggleSelect(cat.id)
                      : onOpenCategoryInLibrary(cat.id, e.currentTarget.getBoundingClientRect())
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      if (isBatchMode) toggleSelect(cat.id);
                      else onOpenCategoryInLibrary(cat.id, e.currentTarget.getBoundingClientRect());
                    }
                  }}
                  className={`group relative w-full cursor-pointer overflow-hidden rounded-xl border bg-zinc-100 transition-[transform,border-color,box-shadow] duration-150 hover:-translate-y-0.5 hover:shadow-md active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-blue-600 dark:bg-zinc-900 ${
                    isMasonry
                      ? 'mb-3.5 break-inside-avoid sm:mb-5'
                      : 'aspect-[4/3]'
                  } ${
                    isMasonry && previewImages.length !== 1 ? 'aspect-[4/3]' : ''
                  } ${
                    isSelected
                      ? 'border-blue-600 ring-2 ring-blue-600/20 dark:border-blue-500'
                      : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700'
                  }`}
                >
                  {/* Image / Collage Preview */}
                  {previewImages.length === 0 ? (
                    <div className="flex h-full min-h-[180px] w-full items-center justify-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/80 shadow-xs dark:bg-zinc-800/80">
                        <span
                          aria-hidden="true"
                          className="h-6 w-6 rounded-full"
                          style={{ backgroundColor: cat.color || '#2563EB' }}
                        />
                      </div>
                    </div>
                  ) : previewImages.length === 1 ? (
                    <img
                      src={previewImages[0].thumbnailUrl}
                      alt={cat.name}
                      loading="lazy"
                      className={`w-full transition-transform duration-200 group-hover:scale-[1.02] ${
                        isMasonry ? 'block h-auto' : 'h-full object-cover'
                      }`}
                    />
                  ) : previewImages.length === 2 ? (
                    <div className="grid h-full w-full grid-cols-2 gap-0.5">
                      {previewImages.map((img) => (
                        <img
                          key={img.id}
                          src={img.thumbnailUrl}
                          alt={img.title}
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      ))}
                    </div>
                  ) : previewImages.length === 3 ? (
                    <div className="grid h-full w-full grid-cols-2 grid-rows-2 gap-0.5">
                      <img
                        src={previewImages[0].thumbnailUrl}
                        alt={previewImages[0].title}
                        loading="lazy"
                        className="row-span-2 h-full w-full object-cover"
                      />
                      <img
                        src={previewImages[1].thumbnailUrl}
                        alt={previewImages[1].title}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                      <img
                        src={previewImages[2].thumbnailUrl}
                        alt={previewImages[2].title}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="grid h-full w-full grid-cols-2 grid-rows-2 gap-0.5">
                      {previewImages.map((img, idx) => {
                        const isLastWithMore = idx === 3 && remainingCount > 0;
                        return (
                          <div key={img.id} className="relative h-full w-full overflow-hidden">
                            <img
                              src={img.thumbnailUrl}
                              alt={img.title}
                              loading="lazy"
                              className="h-full w-full object-cover"
                            />
                            {isLastWithMore && (
                              <span className="absolute inset-0 flex items-center justify-center bg-black/50 font-mono text-sm font-semibold text-white">
                                +{remainingCount}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {isBatchMode && (
                    <div className="absolute left-2.5 top-2.5">
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded-md border transition-colors ${
                          isSelected
                            ? 'border-blue-600 bg-blue-600 text-white'
                            : 'border-white/80 bg-black/40 text-transparent'
                        }`}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    </div>
                  )}

                  {/* Frosted Category Name Overlay inside image */}
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 p-2 sm:p-2.5">
                    <span className="inline-block max-w-full truncate rounded-lg bg-black/45 px-2 py-0.5 font-display text-xs font-semibold text-white backdrop-blur-xs sm:px-2.5 sm:py-1 sm:text-sm">
                      {cat.name}
                    </span>
                  </div>

                  {/* Frosted Square Edit Button inside image */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openEditModal(cat);
                    }}
                    aria-label={`Chỉnh sửa ${cat.name}`}
                    title={`Chỉnh sửa ${cat.name}`}
                    className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-lg bg-black/45 text-white backdrop-blur-xs transition-colors hover:bg-black/65 sm:right-2.5 sm:top-2.5 sm:h-8 sm:w-8"
                  >
                    <Pencil className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {/* Combined Bottom Frosted Search + Add Capsule / Bottom Frosted Search Bar */}
      <SmartSearchBar
        isOpen={isSearchOpen}
        onOpen={onOpenSearch}
        onClose={onCloseSearch}
        query={searchQuery}
        onQueryChange={setSearchQuery}
        placeholder="Tìm kiếm danh mục (hỗ trợ không dấu)..."
        ariaLabel="Tìm kiếm danh mục"
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        sortValue={sortBy}
        sortOptions={CATEGORY_SORT_OPTIONS}
        onSortChange={(val) => setSortBy(val as CategorySortOption)}
        isBatchMode={isBatchMode}
        onToggleBatchMode={() => {
          setIsBatchMode((v) => !v);
          setSelectedIds([]);
          setConfirmBatchDelete(false);
        }}
        onAddClick={openCreateModal}
        addTitle="Tạo danh mục mới"
        disableShortcuts={disableShortcuts || isCreateOpen || Boolean(editingCategory)}
      />

      {/* Create Category Modal */}
      {isCreateOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/60 p-4 backdrop-blur-xs"
          onClick={() => setIsCreateOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-category-title"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950"
          >
            <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
              <h2
                id="create-category-title"
                className="font-display text-base font-bold text-zinc-950 dark:text-zinc-50"
              >
                Tạo danh mục mới
              </h2>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                aria-label="Đóng"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4 p-5">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  Tên danh mục
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ví dụ: Bánh kem, Bánh mì..."
                  autoFocus
                  required
                  className="h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 focus:border-blue-600 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  Mô tả ngắn (tùy chọn)
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Mục đích lưu trữ của danh mục này..."
                  className="h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 focus:border-blue-600 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                />
              </div>

              <div>
                <span className="mb-2 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  Màu biểu tượng
                </span>
                <div className="flex items-center gap-2.5">
                  {PRESET_COLORS.slice(0, 6).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      aria-label={`Chọn màu ${c}`}
                      className={`h-7 w-7 rounded-full transition-transform ${
                        color === c ? 'scale-110 ring-2 ring-blue-600 ring-offset-2' : ''
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="h-9 rounded-lg border border-zinc-200 px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={!name.trim() || isSubmitting}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                  <span>Tạo danh mục</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit / Delete Category Modal */}
      {editingCategory && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/60 p-4 backdrop-blur-xs"
          onClick={() => setEditingCategory(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-category-title"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950"
          >
            <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
              <h2
                id="edit-category-title"
                className="font-display text-base font-bold text-zinc-950 dark:text-zinc-50"
              >
                Chỉnh sửa danh mục
              </h2>
              <button
                type="button"
                onClick={() => setEditingCategory(null)}
                aria-label="Đóng"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4 p-5">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  Tên danh mục
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  autoFocus
                  required
                  className="h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 focus:border-blue-600 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  Mô tả ngắn (tùy chọn)
                </label>
                <input
                  type="text"
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  placeholder="Mục đích lưu trữ của danh mục này..."
                  className="h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 focus:border-blue-600 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                />
              </div>

              <div>
                <span className="mb-2 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  Màu biểu tượng
                </span>
                <div className="flex items-center gap-2.5">
                  {PRESET_COLORS.slice(0, 6).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setEditColor(c)}
                      aria-label={`Chọn màu ${c}`}
                      className={`h-7 w-7 rounded-full transition-transform ${
                        editColor === c ? 'scale-110 ring-2 ring-blue-600 ring-offset-2' : ''
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 border-t border-zinc-100 pt-4 dark:border-zinc-900">
                {confirmDelete ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-rose-600 dark:text-rose-400">
                      Xóa danh mục?
                    </span>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="h-8 rounded-lg border border-zinc-200 px-2.5 text-xs font-medium text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
                    >
                      Hủy
                    </button>
                    <button
                      type="button"
                      disabled={isSavingEdit}
                      onClick={handleDelete}
                      className="h-8 rounded-lg bg-rose-600 px-2.5 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-50"
                    >
                      Xác nhận
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-rose-200 px-3 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950/30"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Xóa</span>
                  </button>
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingCategory(null)}
                    className="h-9 rounded-lg border border-zinc-200 px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={!editName.trim() || isSavingEdit}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    <Check className="h-4 w-4" />
                    <span>Lưu</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
