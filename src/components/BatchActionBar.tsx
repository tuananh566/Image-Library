import { FolderInput, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import type { Category } from '../types/vault';

interface BatchActionBarProps {
  selectedCount: number;
  categories: Category[];
  onSelectAll: () => void;
  onClearSelection: () => void;
  onExitBatchMode: () => void;
  onAssignCategory: (categoryId: string | null) => Promise<void>;
  onDeleteSelected: () => Promise<void>;
}

export function BatchActionBar({
  selectedCount,
  categories,
  onSelectAll,
  onClearSelection,
  onExitBatchMode,
  onAssignCategory,
  onDeleteSelected,
}: BatchActionBarProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (selectedCount === 0) {
    return (
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-800 bg-zinc-900/90 px-3.5 py-2.5 text-xs">
        <span className="text-zinc-300">
          Chế độ chọn nhiều đang bật — chạm vào ảnh để chọn hàng loạt.
        </span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onSelectAll}
            className="font-medium text-blue-400 hover:underline"
          >
            Chọn tất cả
          </button>
          <button
            type="button"
            onClick={onExitBatchMode}
            className="inline-flex h-7 items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 font-medium text-zinc-200 hover:bg-zinc-800"
          >
            <X className="h-3.5 w-3.5" />
            <span>Xong</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-900/80 bg-blue-950/40 px-3.5 py-2.5 sm:px-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="tabular-nums text-xs font-semibold text-blue-200">
          Đã chọn {selectedCount} ảnh
        </span>
        <button
          type="button"
          onClick={onSelectAll}
          className="text-xs font-medium text-blue-300 hover:underline"
        >
          Chọn tất cả
        </button>
        <button
          type="button"
          onClick={onClearSelection}
          className="text-xs text-zinc-400 hover:text-zinc-200 hover:underline"
        >
          Bỏ chọn
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Batch Move to Category */}
        <div className="flex items-center gap-1.5">
          <FolderInput className="h-3.5 w-3.5 text-zinc-400" />
          <select
            defaultValue=""
            onChange={async (e) => {
              const val = e.target.value;
              if (!val) return;
              await onAssignCategory(val === '__none__' ? null : val);
              e.target.value = '';
            }}
            aria-label="Chuyển danh mục hàng loạt"
            className="h-8 rounded-lg border border-zinc-700 bg-zinc-900 px-2 text-xs font-medium text-zinc-100 focus:border-blue-500 focus:outline-none"
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
              className="inline-flex h-8 items-center rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
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
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-rose-900/70 bg-zinc-900 px-2.5 text-xs font-medium text-rose-300 hover:bg-rose-950/40"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Xóa</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            setConfirmDelete(false);
            onExitBatchMode();
          }}
          className="inline-flex h-8 items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
        >
          <X className="h-3.5 w-3.5" />
          <span>Xong</span>
        </button>
      </div>
    </div>
  );
}
