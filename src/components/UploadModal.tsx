import { ImagePlus, Plus, Trash2, Upload, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { formatFileSize, stripFileExtension } from '../lib/imageProcessor';
import type { Category } from '../types/vault';

interface PendingFile {
  localId: string;
  file: File;
  previewUrl: string;
  title: string;
  notes: string;
}

interface UploadModalProps {
  isOpen: boolean;
  initialFiles?: File[];
  categories: Category[];
  defaultCategoryId: string | null;
  onClose: () => void;
  onCreateCategory: (name: string) => Promise<Category>;
  onConfirmUpload: (
    items: Array<{
      file: File;
      title: string;
      notes: string;
      categoryId: string | null;
    }>
  ) => Promise<void>;
}

export function UploadModal({
  isOpen,
  initialFiles,
  categories,
  defaultCategoryId,
  onClose,
  onCreateCategory,
  onConfirmUpload,
}: UploadModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [categoryId, setCategoryId] = useState<string>(defaultCategoryId || '');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setCategoryId(defaultCategoryId || '');
    setErrorMsg(null);
  }, [isOpen, defaultCategoryId]);

  useEffect(() => {
    if (isOpen && initialFiles && initialFiles.length > 0) {
      addFiles(initialFiles);
    }
  }, [isOpen, initialFiles]);

  useEffect(() => {
    return () => {
      pendingFiles.forEach((pf) => URL.revokeObjectURL(pf.previewUrl));
    };
  }, []);

  if (!isOpen) return null;

  const addFiles = (files: File[]) => {
    const valid = files.filter((f) => f.type.startsWith('image/'));
    if (valid.length === 0) {
      setErrorMsg('Vui lòng chọn tệp hình ảnh hợp lệ (JPG, PNG, WebP, SVG, GIF).');
      return;
    }
    setErrorMsg(null);
    const mapped: PendingFile[] = valid.map((file) => ({
      localId: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
      title: stripFileExtension(file.name) || 'Ảnh mẫu mới',
      notes: '',
    }));
    setPendingFiles((prev) => [...prev, ...mapped]);
  };

  const removePending = (localId: string) => {
    setPendingFiles((prev) => {
      const target = prev.find((p) => p.localId === localId);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.localId !== localId);
    });
  };

  const handleCreateInlineCategory = async () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;
    const created = await onCreateCategory(trimmed);
    setCategoryId(created.id);
    setNewCategoryName('');
    setShowNewCategory(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pendingFiles.length === 0 || isSaving) return;

    setIsSaving(true);
    setErrorMsg(null);
    try {
      await onConfirmUpload(
        pendingFiles.map((pf) => ({
          file: pf.file,
          title: pf.title.trim() || stripFileExtension(pf.file.name) || 'Ảnh mẫu',
          notes: pf.notes.trim(),
          categoryId: categoryId || null,
        }))
      );

      pendingFiles.forEach((pf) => URL.revokeObjectURL(pf.previewUrl));
      setPendingFiles([]);
      onClose();
    } catch {
      setErrorMsg('Không thể xử lý một số ảnh. Vui lòng thử lại.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/60 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upload-modal-title"
    >
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <div>
            <h2
              id="upload-modal-title"
              className="font-display text-lg font-semibold text-zinc-950 dark:text-zinc-50"
            >
              Thêm ảnh mẫu vào kho cục bộ
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Dữ liệu được xử lý và lưu trực tiếp trong trình duyệt (IndexedDB), không tải lên máy chủ ngoài.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng hộp thoại thêm ảnh"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Dropzone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (e.dataTransfer.files?.length) {
                addFiles(Array.from(e.dataTransfer.files));
              }
            }}
            onClick={() => fileInputRef.current?.click()}
            className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-zinc-50/60 px-6 py-8 text-center transition-colors hover:border-blue-500 hover:bg-blue-50/40 dark:border-zinc-700 dark:bg-zinc-900/40 dark:hover:border-blue-500 dark:hover:bg-blue-950/20"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) {
                  addFiles(Array.from(e.target.files));
                  e.target.value = '';
                }
              }}
            />
            <ImagePlus className="mb-2.5 h-8 w-8 text-blue-600 dark:text-blue-400" />
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              Chọn ảnh từ máy tính hoặc kéo thả nhiều ảnh vào đây
            </p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Hỗ trợ JPG, PNG, WebP, GIF, SVG · Lưu trữ ngoại tuyến và tạo ảnh thu gọn tự động
            </p>
          </div>

          {errorMsg && (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-medium text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300">
              {errorMsg}
            </p>
          )}

          {/* Category Assignment */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Phân loại danh mục
              </label>
              <button
                type="button"
                onClick={() => setShowNewCategory((v) => !v)}
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
              >
                <Plus className="h-3 w-3" />
                <span>Danh mục mới</span>
              </button>
            </div>
            {showNewCategory ? (
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="Tên danh mục mới..."
                  className="h-10 min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 focus:border-blue-600 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                />
                <button
                  type="button"
                  onClick={handleCreateInlineCategory}
                  className="h-10 rounded-lg bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-700"
                >
                  Tạo
                </button>
              </div>
            ) : (
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 focus:border-blue-600 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              >
                <option value="">Chưa phân loại</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Pending Files List */}
          {pendingFiles.length > 0 && (
            <div className="space-y-2.5">
              <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Danh sách chờ lưu ({pendingFiles.length} ảnh)
              </p>
              <div className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                {pendingFiles.map((pf) => (
                  <div key={pf.localId} className="flex items-start gap-3.5 p-3">
                    <img
                      src={pf.previewUrl}
                      alt={pf.title}
                      className="h-16 w-20 shrink-0 rounded-lg border border-zinc-200 object-cover dark:border-zinc-800"
                    />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <input
                        type="text"
                        value={pf.title}
                        onChange={(e) =>
                          setPendingFiles((prev) =>
                            prev.map((x) =>
                              x.localId === pf.localId ? { ...x, title: e.target.value } : x
                            )
                          )
                        }
                        placeholder="Tiêu đề ảnh mẫu..."
                        className="h-8 w-full rounded-md border border-zinc-200 bg-white px-2.5 text-sm font-medium text-zinc-900 focus:border-blue-600 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                      />
                      <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                        <span className="truncate">{pf.file.name}</span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums font-mono shrink-0">
                          {formatFileSize(pf.file.size)}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removePending(pf.localId)}
                      aria-label="Xóa ảnh khỏi danh sách chờ"
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-rose-600 dark:hover:bg-zinc-900"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-lg border border-zinc-300 px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            Hủy
          </button>
          <button
            type="button"
            disabled={pendingFiles.length === 0 || isSaving}
            onClick={handleSubmit}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Upload className="h-4 w-4" />
            <span>
              {isSaving
                ? 'Đang xử lý & lưu...'
                : `Lưu ${pendingFiles.length > 0 ? pendingFiles.length : ''} ảnh vào kho`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
