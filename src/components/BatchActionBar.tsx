import { FolderInput, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import type { Category } from '../types/vault';

interface BatchActionBarProps {
  selectedCount: number;
  categories: Category[];
  onSelectAll: () => void;
  onClearSelection: () => void;
  onAssignCategory: (categoryId: string | null) => Promise<void>;
  onDeleteSelected: () => Promise<void>;
}

export function BatchActionBar({
  selectedCount,
  categories,
  onSelectAll,
  onClearSelection,
  onAssignCategory,
  onDeleteSelected,
}: BatchActionBarProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (selectedCount === 0) {
    return (
      <div className="mb-4 flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-xs dark:border-zinc-800 dark:bg-zinc-900">
        <span className="text-zinc-600 dark:text-zinc-400">
          Chế độ chọn nhiều đang bật — nhấp vào các ảnh để chọn hàng loạt.
        </span>
        <button
          type="button"
          onClick={onSelectAll}
          className="font-medium text-blue-600 hover:underline dark:text-blue-400"
        >
          Chọn tất cả ảnh đang hiển thị
        </button>
      </div>
    );
  }

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50/70 px-4 py-2.5 dark:border-blue-900 dark:bg-blue-950/40">
      <div className="flex items-center gap-3">
        <span className="tabular-nums text-xs font-semibold text-blue-800 dark:text-blue-200">
          Đã chọn {selectedCount} ảnh
        </span>
        <button
          type="button"
          onClick={onSelectAll}
          className="text-xs font-medium text-blue-700 hover:underline dark:text-blue-300"
        >
          Chọn tất cả
        </button>
        <button
          type="button"
          onClick={onClearSelection}
          className="text-xs text-zinc-600 hover:underline dark:text-zinc-400"
        >
          Bỏ chọn
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Batch Move to Category */}
        <div className="flex items-center gap-1.5">
          <FolderInput className="h-3.5 w-3.5 text-zinc-500" />
          <select
            defaultValue=""
            onChange={async (e) => {
              const val = e.target.value;
              if (!val) return;
              await onAssignCategory(val === '__none__' ? null : val);
              e.target.value = '';
            }}
            aria-label="Chuyển danh mục hàng loạt"
            className="h-8 rounded-lg border border-zinc-300 bg-white px-2 text-xs font-medium text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            <option value="" disabled>
              Chuyển danh mục...
            </option>
            <option value="__none__">Chưa phân loại</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Batch Delete */}
        {confirmDelete ? (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="inline-flex h-8 items-center rounded-lg border border-zinc-300 bg-white px-2.5 text-xs font-medium dark:border-zinc-700 dark:bg-zinc-900"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={async () => {
                await onDeleteSelected();
                setConfirmDelete(false);
              }}
              className="h-8 rounded-lg bg-rose-600 px-3 text-xs font-medium text-white hover:bg-rose-700"
            >
              Xóa {selectedCount} ảnh
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-rose-200 bg-white px-2.5 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:border-rose-900 dark:bg-zinc-900 dark:text-rose-400"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Xóa</span>
          </button>
        )}
      </div>
    </div>
  );
}
