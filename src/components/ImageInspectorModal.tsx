import {
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Heart,
  Maximize2,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { getImageById } from '../lib/db';
import { formatFileSize } from '../lib/imageProcessor';
import type { Category, VaultImageView } from '../types/vault';

interface ImageInspectorModalProps {
  image: VaultImageView | null;
  categories: Category[];
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onUpdate: (
    id: string,
    patch: Partial<{
      title: string;
      notes: string;
      categoryId: string | null;
      isFavorite: boolean;
    }>
  ) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onCreateCategory: (name: string) => Promise<Category>;
}

export function ImageInspectorModal({
  image,
  categories,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  onClose,
  onUpdate,
  onDelete,
  onCreateCategory,
}: ImageInspectorModalProps) {
  const [fullUrl, setFullUrl] = useState<string>('');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [isZoomed, setIsZoomed] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState(false);
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');

  useEffect(() => {
    if (!image) return;
    setTitle(image.title);
    setNotes(image.notes);
    setCategoryId(image.categoryId || '');
    setConfirmDelete(false);
    setIsZoomed(false);
    setSaveFeedback(false);

    let activeUrl = '';
    let cancelled = false;
    getImageById(image.id).then((rec) => {
      if (cancelled || !rec) return;
      activeUrl = URL.createObjectURL(rec.blob);
      setFullUrl(activeUrl);
    });

    return () => {
      cancelled = true;
      if (activeUrl) URL.revokeObjectURL(activeUrl);
      setFullUrl('');
    };
  }, [image?.id]);

  useEffect(() => {
    if (!image) return;
    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditing =
        target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA';

      if (e.key === 'Escape') {
        onClose();
      } else if (!isEditing && e.key === 'ArrowLeft' && hasPrev) {
        onPrev();
      } else if (!isEditing && e.key === 'ArrowRight' && hasNext) {
        onNext();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [image, hasPrev, hasNext, onClose, onPrev, onNext]);

  if (!image) return null;

  const triggerSave = async (
    nextPatch: Partial<{
      title: string;
      notes: string;
      categoryId: string | null;
    }>
  ) => {
    await onUpdate(image.id, nextPatch);
    setSaveFeedback(true);
    setTimeout(() => setSaveFeedback(false), 1400);
  };

  const handleCreateCategory = async () => {
    const trimmed = newCatName.trim();
    if (!trimmed) return;
    const created = await onCreateCategory(trimmed);
    setCategoryId(created.id);
    setNewCatName('');
    setShowNewCat(false);
    await triggerSave({ categoryId: created.id });
  };

  const handleDownload = async () => {
    const rec = await getImageById(image.id);
    if (!rec) return;
    const url = URL.createObjectURL(rec.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = image.fileName || `${image.title}.jpg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const displaySrc = fullUrl || image.thumbnailUrl;
  const formattedDate = new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(image.createdAt));

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-zinc-950/90 backdrop-blur-sm lg:flex-row"
      role="dialog"
      aria-modal="true"
      aria-label={`Chi tiết ảnh ${image.title}`}
    >
      {/* Left/Center Unobstructed Image Viewport */}
      <div className="relative flex flex-1 items-center justify-center overflow-auto p-4 sm:p-8">
        <div className="absolute left-4 right-4 top-4 z-10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsZoomed((z) => !z)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-zinc-900/80 px-3 text-xs font-medium text-zinc-100 backdrop-blur-xs hover:bg-zinc-800"
            >
              <Maximize2 className="h-3.5 w-3.5" />
              <span>{isZoomed ? 'Vừa khung' : 'Phóng to'}</span>
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-zinc-900/80 px-3 text-xs font-medium text-zinc-100 backdrop-blur-xs hover:bg-zinc-800"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Tải gốc</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng trình xem ảnh"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-900/80 text-zinc-100 backdrop-blur-xs hover:bg-zinc-800 lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {hasPrev && (
          <button
            type="button"
            onClick={onPrev}
            aria-label="Ảnh trước"
            className="absolute left-4 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-zinc-900/75 text-white hover:bg-zinc-800"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        {hasNext && (
          <button
            type="button"
            onClick={onNext}
            aria-label="Ảnh tiếp theo"
            className="absolute right-4 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-zinc-900/75 text-white hover:bg-zinc-800"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        )}

        <img
          src={displaySrc}
          alt={image.title}
          onClick={() => setIsZoomed((z) => !z)}
          className={`rounded-lg transition-transform duration-200 ${
            isZoomed
              ? 'max-h-none max-w-none cursor-zoom-out scale-100'
              : 'max-h-[82vh] max-w-full cursor-zoom-in object-contain'
          }`}
        />
      </div>

      {/* Right Metadata Drawer */}
      <aside className="flex w-full flex-col border-t border-zinc-200 bg-white lg:h-full lg:w-[380px] lg:border-l lg:border-t-0 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-3.5 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onUpdate(image.id, { isFavorite: !image.isFavorite })}
              className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors ${
                image.isFavorite
                  ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300'
                  : 'border-zinc-200 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900'
              }`}
            >
              <Heart
                className="h-3.5 w-3.5"
                fill={image.isFavorite ? 'currentColor' : 'none'}
              />
              <span>{image.isFavorite ? 'Đã thích' : 'Yêu thích'}</span>
            </button>
            {saveFeedback && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                <Check className="h-3.5 w-3.5" />
                Đã lưu
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="hidden h-9 w-9 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 lg:inline-flex dark:text-zinc-400 dark:hover:bg-zinc-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {/* Title */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Tiêu đề ảnh mẫu
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => {
                if (title.trim() && title !== image.title) {
                  triggerSave({ title: title.trim() });
                }
              }}
              className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-950 focus:border-blue-600 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </div>

          {/* Category */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Danh mục
              </label>
              <button
                type="button"
                onClick={() => setShowNewCat((v) => !v)}
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
              >
                <Plus className="h-3 w-3" />
                <span>Tạo danh mục</span>
              </button>
            </div>
            {showNewCat ? (
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="Tên danh mục mới..."
                  className="h-10 min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 focus:border-blue-600 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                />
                <button
                  type="button"
                  onClick={handleCreateCategory}
                  className="h-10 rounded-lg bg-blue-600 px-3 text-xs font-medium text-white"
                >
                  Lưu
                </button>
              </div>
            ) : (
              <select
                value={categoryId}
                onChange={(e) => {
                  const val = e.target.value;
                  setCategoryId(val);
                  triggerSave({ categoryId: val || null });
                }}
                className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 focus:border-blue-600 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
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

          {/* Notes */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Ghi chú tham khảo
            </label>
            <textarea
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => {
                if (notes !== image.notes) {
                  triggerSave({ notes: notes.trim() });
                }
              }}
              placeholder="Ghi chú về ánh sáng, bố cục, chất liệu..."
              className="w-full rounded-lg border border-zinc-200 bg-white p-3 text-sm text-zinc-900 focus:border-blue-600 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </div>

          {/* File Specs */}
          <div className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <dl className="grid grid-cols-2 gap-y-2 text-xs">
              <dt className="text-zinc-500 dark:text-zinc-400">Kích thước</dt>
              <dd className="text-right font-mono tabular-nums text-zinc-900 dark:text-zinc-200">
                {image.width} × {image.height} px
              </dd>
              <dt className="text-zinc-500 dark:text-zinc-400">Dung lượng</dt>
              <dd className="text-right font-mono tabular-nums text-zinc-900 dark:text-zinc-200">
                {formatFileSize(image.size)}
              </dd>
              <dt className="text-zinc-500 dark:text-zinc-400">Định dạng</dt>
              <dd className="text-right font-mono text-zinc-900 dark:text-zinc-200">
                {image.mimeType.replace('image/', '').toUpperCase()}
              </dd>
              <dt className="text-zinc-500 dark:text-zinc-400">Ngày lưu</dt>
              <dd className="text-right tabular-nums text-zinc-900 dark:text-zinc-200">
                {formattedDate}
              </dd>
            </dl>
          </div>
        </div>

        {/* Delete Footer */}
        <div className="border-t border-zinc-200 p-4 dark:border-zinc-800">
          {confirmDelete ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-rose-600 dark:text-rose-400">
                Xác nhận xóa vĩnh viễn ảnh này?
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(image.id)}
                  className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700"
                >
                  Xóa ngay
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-200 py-2 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-50 dark:border-zinc-800 dark:text-rose-400 dark:hover:bg-rose-950/30"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Xóa ảnh mẫu khỏi kho cục bộ</span>
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}
