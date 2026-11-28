import { FolderPlus, X } from 'lucide-react';
import { useEffect, useState } from 'react';

interface MergeAlbumModalProps {
  isOpen: boolean;
  mode: 'albums' | 'images';
  selectedCount: number;
  estimatedImageCount: number;
  selectedAlbumNames?: string[];
  onClose: () => void;
  onConfirm: (data: {
    name: string;
    description: string;
    color: string;
  }) => Promise<void>;
}

const PRESET_COLORS = [
  '#2563EB',
  '#0284C7',
  '#16A34A',
  '#D97706',
  '#DC2626',
  '#7C3AED',
];

export function MergeAlbumModal({
  isOpen,
  mode,
  selectedCount,
  estimatedImageCount,
  selectedAlbumNames = [],
  onClose,
  onConfirm,
}: MergeAlbumModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setName('');
    setDescription('');
    setColor(PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)]);
    setError(null);
    setIsSubmitting(false);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await onConfirm({
        name: name.trim(),
        description: description.trim(),
        color,
      });
    } catch (err) {
      const detail = err instanceof Error && err.message ? ` (${err.message})` : '';
      setError(`Không thể tạo album mới${detail}. Vui lòng thử lại.`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/75 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[calc(0.75rem+var(--app-safe-top))] sm:px-4"
      onClick={() => {
        if (!isSubmitting) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="merge-album-modal-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <h2
            id="merge-album-modal-title"
            className="font-display text-base font-bold text-zinc-50"
          >
            Tạo thành album mới
          </h2>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            aria-label="Đóng"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100 disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-3.5 py-2.5 text-xs text-zinc-300">
            {mode === 'albums' ? (
              <div className="space-y-1">
                <p className="font-medium text-zinc-100">
                  Gộp {selectedCount} album ({estimatedImageCount} ảnh) thành 1 album mới. Các album cũ vẫn được giữ nguyên.
                </p>
                {selectedAlbumNames.length > 0 && (
                  <p className="truncate text-zinc-400">
                    Từ: {selectedAlbumNames.join(', ')}
                  </p>
                )}
              </div>
            ) : (
              <p className="font-medium text-zinc-100">
                Gộp {selectedCount} ảnh đã chọn thành 1 album mới.
              </p>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-zinc-400">
              Tên album mới <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                mode === 'albums'
                  ? 'Ví dụ: Tổng hợp bánh kem...'
                  : 'Ví dụ: Bộ sưu tập chọn lọc...'
              }
              autoFocus
              required
              className="h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-zinc-400">
              Mô tả ngắn (tùy chọn)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ghi chú ngắn cho album mới..."
              className="h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div>
            <span className="mb-2 block text-xs font-medium text-zinc-400">
              Màu biểu tượng
            </span>
            <div className="flex items-center gap-2.5">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={`Chọn màu ${c}`}
                  className={`h-7 w-7 rounded-full transition-transform ${
                    color === c
                      ? 'scale-110 ring-2 ring-blue-500 ring-offset-2 ring-offset-zinc-950'
                      : ''
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {error && (
            <p className="rounded-lg border border-rose-900 bg-rose-950/50 px-3 py-2 text-xs font-medium text-rose-300">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-zinc-800 pt-4">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onClose}
              className="h-10 rounded-lg border border-zinc-800 px-4 text-sm font-medium text-zinc-300 hover:bg-zinc-900 disabled:opacity-50"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={!name.trim() || isSubmitting}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <FolderPlus className="h-4 w-4" />
              <span>{isSubmitting ? 'Đang tạo...' : 'Tạo album mới'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
