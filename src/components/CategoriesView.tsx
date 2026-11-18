import { ArrowRight, Check, Folder, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import type { Category } from '../types/vault';

interface CategoriesViewProps {
  categories: Category[];
  categoryCounts: Record<string, number>;
  uncategorizedCount: number;
  onCreateCategory: (data: {
    name: string;
    description: string;
    color: string;
  }) => Promise<void>;
  onUpdateCategory: (category: Category) => Promise<void>;
  onDeleteCategory: (id: string) => Promise<void>;
  onOpenCategoryInLibrary: (categoryId: string | 'uncategorized') => void;
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

export function CategoriesView({
  categories,
  categoryCounts,
  uncategorizedCount,
  onCreateCategory,
  onUpdateCategory,
  onDeleteCategory,
  onOpenCategoryInLibrary,
}: CategoriesViewProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editColor, setEditColor] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

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
    } finally {
      setIsSubmitting(false);
    }
  };

  const startEdit = (cat: Category) => {
    setEditingId(cat.id);
    setEditName(cat.name);
    setEditDesc(cat.description);
    setEditColor(cat.color);
    setConfirmDeleteId(null);
  };

  const saveEdit = async (cat: Category) => {
    if (!editName.trim()) return;
    await onUpdateCategory({
      ...cat,
      name: editName.trim(),
      description: editDesc.trim(),
      color: editColor,
    });
    setEditingId(null);
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 space-y-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50">
            Quản lý danh mục phân loại
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Tạo, đổi tên và sắp xếp các nhóm ảnh mẫu theo dự án, phong cách hoặc chủ đề của riêng bạn.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onOpenCategoryInLibrary('uncategorized')}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          <span>Chưa phân loại:</span>
          <span className="tabular-nums font-semibold text-zinc-950 dark:text-zinc-100">
            {uncategorizedCount} ảnh
          </span>
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      {/* Create New Category Form */}
      <form
        onSubmit={handleCreate}
        className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"
      >
        <h2 className="mb-4 font-display text-sm font-semibold text-zinc-950 dark:text-zinc-100">
          Tạo danh mục mới
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
          <div className="md:col-span-4">
            <label className="mb-1.5 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Tên danh mục
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ví dụ: UI Dashboard, Ánh sáng..."
              required
              className="h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 focus:border-blue-600 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </div>
          <div className="md:col-span-5">
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
          <div className="md:col-span-3 flex flex-col justify-between">
            <span className="mb-1.5 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Màu biểu tượng
            </span>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                {PRESET_COLORS.slice(0, 6).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    aria-label={`Chọn màu ${c}`}
                    className={`h-6 w-6 rounded-full transition-transform ${
                      color === c ? 'scale-110 ring-2 ring-blue-600 ring-offset-2' : ''
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <button
                type="submit"
                disabled={!name.trim() || isSubmitting}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <Plus className="h-4 w-4" />
                <span>Tạo</span>
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* Categories List */}
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        {categories.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-zinc-500 dark:text-zinc-400">
            Bạn chưa tạo danh mục nào. Hãy tạo danh mục đầu tiên ở biểu mẫu phía trên.
          </div>
        ) : (
          <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {categories.map((cat) => {
              const count = categoryCounts[cat.id] || 0;
              const isEditing = editingId === cat.id;
              const isDeleting = confirmDeleteId === cat.id;

              return (
                <div
                  key={cat.id}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  {isEditing ? (
                    <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="h-9 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-900 focus:border-blue-600 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                      />
                      <input
                        type="text"
                        value={editDesc}
                        onChange={(e) => setEditDesc(e.target.value)}
                        placeholder="Mô tả..."
                        className="h-9 flex-1 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-700 focus:border-blue-600 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                      />
                      <div className="flex items-center gap-1.5">
                        {PRESET_COLORS.slice(0, 5).map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setEditColor(c)}
                            className={`h-5 w-5 rounded-full ${
                              editColor === c ? 'ring-2 ring-blue-600 ring-offset-1' : ''
                            }`}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => saveEdit(cat)}
                          className="inline-flex h-9 items-center gap-1 rounded-lg bg-blue-600 px-3 text-xs font-medium text-white"
                        >
                          <Check className="h-3.5 w-3.5" />
                          <span>Lưu</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 dark:border-zinc-700"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-900">
                          <Folder className="h-4 w-4" style={{ color: cat.color }} />
                        </div>
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={() => onOpenCategoryInLibrary(cat.id)}
                            className="font-display text-sm font-semibold text-zinc-950 hover:text-blue-600 dark:text-zinc-100 dark:hover:text-blue-400 text-left"
                          >
                            {cat.name}
                          </button>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400">
                            {cat.description || 'Không có mô tả'}
                            <span aria-hidden="true"> · </span>
                            <span className="tabular-nums font-medium text-zinc-700 dark:text-zinc-300">
                              {count} ảnh mẫu
                            </span>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {isDeleting ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-rose-600 dark:text-rose-400">
                              Xóa danh mục (ảnh vẫn giữ)?
                            </span>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
                            >
                              Hủy
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                await onDeleteCategory(cat.id);
                                setConfirmDeleteId(null);
                              }}
                              className="rounded-md bg-rose-600 px-2.5 py-1 text-xs font-medium text-white"
                            >
                              Xác nhận
                            </button>
                          </div>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => onOpenCategoryInLibrary(cat.id)}
                              className="h-8 rounded-lg border border-zinc-200 px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
                            >
                              Xem ảnh
                            </button>
                            <button
                              type="button"
                              onClick={() => startEdit(cat)}
                              aria-label={`Sửa ${cat.name}`}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(cat.id)}
                              aria-label={`Xóa ${cat.name}`}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-rose-50 hover:text-rose-600 dark:text-zinc-400 dark:hover:bg-rose-950/40"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
