import {
  Camera,
  Check,
  ChevronRight,
  History,
  ImageIcon,
  ImagePlus,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { generateId, isImageFile, stripFileExtension } from '../lib/imageProcessor';
import { getImageCategoryIds, type Category, type VaultImageView } from '../types/vault';

interface PendingAlbumFile {
  localId: string;
  file: File;
  previewUrl: string;
  title: string;
}

interface CategoriesViewProps {
  categories: Category[];
  images: VaultImageView[];
  onCreateCategory: (data: {
    name: string;
    description: string;
    color: string;
    newFiles?: File[];
    existingImageIds?: string[];
    onProgress?: (done: number, total: number) => void;
  }) => Promise<void>;
  onUpdateCategory: (category: Category) => Promise<void>;
  onDeleteCategory: (id: string) => Promise<void>;
  onOpenCategoryInLibrary: (categoryId: string, sourceRect?: DOMRect) => void;
  canManage?: boolean;
  recentImages?: VaultImageView[];
  totalRecentCount?: number;
  onOpenRecentImage?: (id: string) => void;
  onOpenRecentTab?: () => void;
  createRequestVersion?: number;
  isBatchMode?: boolean;
  onSetBatchMode?: (active: boolean) => void;
  selectedIds?: string[];
  onSetSelectedIds?: (updater: string[] | ((prev: string[]) => string[])) => void;
  showOnlySelected?: boolean;
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
  onCreateCategory,
  onUpdateCategory,
  onDeleteCategory,
  onOpenCategoryInLibrary,
  canManage = true,
  recentImages = [],
  totalRecentCount = 0,
  onOpenRecentImage,
  onOpenRecentTab,
  createRequestVersion = 0,
  isBatchMode = false,
  onSetBatchMode,
  selectedIds = [],
  onSetSelectedIds,
  showOnlySelected = false,
}: CategoriesViewProps) {
  const createFileInputId = useId();
  const createCameraInputId = useId();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(() => getRandomPresetColor());
  const [pendingFiles, setPendingFiles] = useState<PendingAlbumFile[]>([]);
  const [selectedLibraryIds, setSelectedLibraryIds] = useState<string[]>([]);
  const [showLibraryPicker, setShowLibraryPicker] = useState(false);
  const [libraryQuery, setLibraryQuery] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createUploadProgress, setCreateUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const pendingFilesRef = useRef<PendingAlbumFile[]>([]);
  pendingFilesRef.current = pendingFiles;

  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editColor, setEditColor] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressOriginRef = useRef<{ x: number; y: number; id: string } | null>(null);
  const suppressNextClickIdRef = useRef<string | null>(null);

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    pressOriginRef.current = null;
  };

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
      pendingFilesRef.current.forEach((pf) => URL.revokeObjectURL(pf.previewUrl));
    };
  }, []);

  useEffect(() => {
    if (!canManage) {
      pendingFilesRef.current.forEach((pf) => URL.revokeObjectURL(pf.previewUrl));
      setPendingFiles([]);
      setSelectedLibraryIds([]);
      setShowLibraryPicker(false);
      setLibraryQuery('');
      setCreateError(null);
      setIsCreateOpen(false);
      setEditingCategory(null);
    }
  }, [canManage]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (editingCategory) setEditingCategory(null);
        else if (isCreateOpen) closeCreateModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCreateOpen, editingCategory]);

  const imagesByCategory = useMemo(() => {
    const map = new Map<string, VaultImageView[]>();
    for (const img of images) {
      for (const cid of getImageCategoryIds(img)) {
        const list = map.get(cid);
        if (list) list.push(img);
        else map.set(cid, [img]);
      }
    }
    return map;
  }, [images]);

  const categoryNameMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories]
  );

  const filteredLibraryImages = useMemo(() => {
    const q = libraryQuery.trim().toLowerCase();
    const list = q
      ? images.filter(
          (img) =>
            img.title.toLowerCase().includes(q) ||
            img.fileName.toLowerCase().includes(q) ||
            getImageCategoryIds(img).some((cid) =>
              (categoryNameMap.get(cid) || '').toLowerCase().includes(q)
            )
        )
      : images;
    return list.slice(0, 80);
  }, [images, libraryQuery, categoryNameMap]);

  const selectedLibraryImages = useMemo(() => {
    const idSet = new Set(selectedLibraryIds);
    return images.filter((img) => idSet.has(img.id));
  }, [images, selectedLibraryIds]);

  const orderedCategories = useMemo(
    () => [...categories].sort((a, b) => a.order - b.order || a.createdAt - b.createdAt),
    [categories]
  );

  const displayedCategories = useMemo(() => {
    if (isBatchMode && showOnlySelected && selectedIds.length > 0) {
      const idSet = new Set(selectedIds);
      return orderedCategories.filter((c) => idSet.has(c.id));
    }
    return orderedCategories;
  }, [orderedCategories, isBatchMode, showOnlySelected, selectedIds]);

  const resetCreateDraft = () => {
    pendingFilesRef.current.forEach((pf) => URL.revokeObjectURL(pf.previewUrl));
    setPendingFiles([]);
    setSelectedLibraryIds([]);
    setShowLibraryPicker(false);
    setLibraryQuery('');
    setCreateError(null);
    setName('');
    setDescription('');
    setColor((prev) => getRandomPresetColor(prev));
  };

  const lastHandledCreateVersionRef = useRef(0);

  const openCreateModal = () => {
    if (!canManage) return;
    resetCreateDraft();
    setIsCreateOpen(true);
  };

  useEffect(() => {
    if (createRequestVersion > 0 && createRequestVersion !== lastHandledCreateVersionRef.current) {
      lastHandledCreateVersionRef.current = createRequestVersion;
      if (canManage) {
        resetCreateDraft();
        setIsCreateOpen(true);
      }
    }
  }, [createRequestVersion, canManage]);

  const closeCreateModal = () => {
    if (isSubmitting) return;
    resetCreateDraft();
    setIsCreateOpen(false);
  };

  const handleAddCreateFiles = (files: File[]) => {
    const valid = files.filter((f) => isImageFile(f));
    if (valid.length === 0) {
      setCreateError('Vui lòng chọn tệp hình ảnh hợp lệ (JPG, PNG, WebP, HEIC, SVG, GIF).');
      return;
    }
    setCreateError(null);
    const mapped: PendingAlbumFile[] = valid.map((file) => ({
      localId: generateId(),
      file,
      previewUrl: URL.createObjectURL(file),
      title: stripFileExtension(file.name) || 'Ảnh mẫu mới',
    }));
    setPendingFiles((prev) => [...prev, ...mapped]);
  };

  const removePendingFile = (localId: string) => {
    setPendingFiles((prev) => {
      const target = prev.find((p) => p.localId === localId);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.localId !== localId);
    });
  };

  const toggleLibrarySelection = (id: string) => {
    setSelectedLibraryIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage || !name.trim() || isSubmitting) return;
    setIsSubmitting(true);
    setCreateUploadProgress(
      pendingFiles.length > 0 ? { done: 0, total: pendingFiles.length } : null
    );
    setCreateError(null);
    try {
      await onCreateCategory({
        name: name.trim(),
        description: description.trim(),
        color,
        newFiles: pendingFiles.map((pf) => pf.file),
        existingImageIds: selectedLibraryIds,
        onProgress: (done, total) => setCreateUploadProgress({ done, total }),
      });
      resetCreateDraft();
      setIsCreateOpen(false);
    } catch (err) {
      const detail = err instanceof Error && err.message ? ` (${err.message})` : '';
      setCreateError(`Không thể tạo album hoặc tải ảnh lên${detail}. Vui lòng thử lại.`);
    } finally {
      setIsSubmitting(false);
      setCreateUploadProgress(null);
    }
  };

  const openEditModal = (cat: Category) => {
    if (!canManage) return;
    setEditingCategory(cat);
    setEditName(cat.name);
    setEditDesc(cat.description);
    setEditColor(cat.color || PRESET_COLORS[0]);
    setConfirmDelete(false);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage || !editingCategory || !editName.trim() || isSavingEdit) return;
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
    if (!canManage || !editingCategory || isSavingEdit) return;
    setIsSavingEdit(true);
    try {
      await onDeleteCategory(editingCategory.id);
      setEditingCategory(null);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const gridColsClass = 'grid-cols-2 md:portrait:grid-cols-2 md:landscape:grid-cols-3';

  const toggleSelectAlbum = (id: string) => {
    onSetSelectedIds?.((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleAlbumPointerDown = (e: React.PointerEvent, id: string) => {
    if (!canManage) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    clearLongPressTimer();
    pressOriginRef.current = { x: e.clientX, y: e.clientY, id };
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      pressOriginRef.current = null;
      suppressNextClickIdRef.current = id;
      onSetBatchMode?.(true);
      onSetSelectedIds?.((prev) => (prev.includes(id) ? prev : [...prev, id]));
      try {
        navigator.vibrate?.(12);
      } catch {
        // Ignore unsupported vibration
      }
    }, 420);
  };

  const handleAlbumPointerMove = (e: React.PointerEvent) => {
    const origin = pressOriginRef.current;
    if (!origin || !longPressTimerRef.current) return;
    if (Math.hypot(e.clientX - origin.x, e.clientY - origin.y) > 10) {
      clearLongPressTimer();
    }
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {/* Scrollable Category Area */}
      <div className="min-h-0 flex-1 overflow-y-auto touch-pan-y p-1.5 pb-[calc(6.75rem+env(safe-area-inset-bottom))] sm:p-2.5 sm:pb-28">

        {!isBatchMode && recentImages.length > 0 && (
          <section
            aria-label="Đã xem gần đây"
            className="mb-3 rounded-xl border border-zinc-800/90 bg-zinc-900/50 p-2.5 sm:mb-3.5 sm:p-3"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <History className="h-4 w-4 shrink-0 text-zinc-400" />
                <h2 className="truncate text-xs font-semibold tracking-wide text-zinc-200 sm:text-sm">
                  Đã xem gần đây
                </h2>
                <span className="tabular-nums text-[11px] font-medium text-zinc-500">
                  {totalRecentCount > 0 ? totalRecentCount : recentImages.length}
                </span>
              </div>
              {onOpenRecentTab && (
                <button
                  type="button"
                  onClick={onOpenRecentTab}
                  className="inline-flex shrink-0 items-center gap-0.5 rounded-lg px-2 py-1 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
                >
                  <span>Xem tất cả</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {recentImages.slice(0, 12).map((img) => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => onOpenRecentImage?.(img.id)}
                  title={img.title || img.fileName}
                  className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900 transition-transform active:scale-95 sm:h-20 sm:w-20"
                >
                  <img
                    src={img.thumbnailUrl}
                    alt={img.title}
                    loading="eager"
                    decoding="async"
                    draggable={false}
                    className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                  />
                </button>
              ))}
            </div>
          </section>
        )}

        {displayedCategories.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
            {canManage
              ? 'Bạn chưa tạo danh mục nào. Nhấn nút dấu + ở thanh dưới cùng để tạo danh mục mới.'
              : 'Chưa có danh mục nào. Vào Cài đặt để xác thực Admin nếu cần tạo danh mục mới.'}
          </div>
        ) : (
          <div className={`grid ${gridColsClass} gap-1.5 sm:gap-2.5`}>
            {displayedCategories.map((cat, idx) => {
              const catImages = imagesByCategory.get(cat.id) || [];
              const previewImages = catImages.slice(0, 4);
              const remainingCount = Math.max(0, catImages.length - 4);
              const isSelected = isBatchMode && selectedIds.includes(cat.id);

              return (
                <article
                  key={cat.id}
                  data-category-card={cat.id}
                  role="button"
                  tabIndex={0}
                  onPointerDown={(e) => handleAlbumPointerDown(e, cat.id)}
                  onPointerMove={handleAlbumPointerMove}
                  onPointerUp={clearLongPressTimer}
                  onPointerCancel={clearLongPressTimer}
                  onPointerLeave={clearLongPressTimer}
                  onContextMenu={(e) => {
                    if (canManage) e.preventDefault();
                  }}
                  onClick={(e) => {
                    if (suppressNextClickIdRef.current === cat.id) {
                      suppressNextClickIdRef.current = null;
                      return;
                    }
                    if (canManage && isBatchMode) {
                      toggleSelectAlbum(cat.id);
                      return;
                    }
                    onOpenCategoryInLibrary(cat.id, e.currentTarget.getBoundingClientRect());
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      if (canManage && isBatchMode) {
                        toggleSelectAlbum(cat.id);
                      } else {
                        onOpenCategoryInLibrary(cat.id, e.currentTarget.getBoundingClientRect());
                      }
                    }
                  }}
                  className={`group relative flex w-full cursor-pointer flex-col overflow-hidden rounded-lg border bg-zinc-200 transition-[transform,border-color,opacity] duration-150 hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-blue-600 active:scale-[0.97] dark:bg-zinc-800 ${
                    canManage ? 'select-none [-webkit-touch-callout:none]' : ''
                  } ${
                    isSelected
                      ? 'border-blue-500 ring-2 ring-blue-500/40'
                      : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-800/80 dark:hover:border-zinc-700'
                  }`}
                >
                  {/* Image / Collage Preview */}
                  <div className="relative aspect-[4/3] w-full overflow-hidden bg-zinc-100 dark:bg-zinc-900">
                    {previewImages.length === 0 ? (
                      <div className="flex h-full w-full items-center justify-center">
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
                        loading={idx < 4 ? 'eager' : 'lazy'}
                        fetchPriority={idx < 2 ? 'high' : undefined}
                        decoding="async"
                        draggable={false}
                        className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                      />
                    ) : previewImages.length === 2 ? (
                      <div className="grid h-full w-full grid-cols-2 gap-0.5">
                        {previewImages.map((img) => (
                          <img
                            key={img.id}
                            src={img.thumbnailUrl}
                            alt={img.title}
                            loading={idx < 4 ? 'eager' : 'lazy'}
                            fetchPriority={idx < 2 ? 'high' : undefined}
                            decoding="async"
                            draggable={false}
                            className="h-full w-full object-cover"
                          />
                        ))}
                      </div>
                    ) : previewImages.length === 3 ? (
                      <div className="grid h-full w-full grid-cols-2 grid-rows-2 gap-0.5">
                        <img
                          src={previewImages[0].thumbnailUrl}
                          alt={previewImages[0].title}
                          loading={idx < 4 ? 'eager' : 'lazy'}
                          fetchPriority={idx < 2 ? 'high' : undefined}
                          decoding="async"
                          draggable={false}
                          className="row-span-2 h-full w-full object-cover"
                        />
                        <img
                          src={previewImages[1].thumbnailUrl}
                          alt={previewImages[1].title}
                          loading={idx < 4 ? 'eager' : 'lazy'}
                          decoding="async"
                          draggable={false}
                          className="h-full w-full object-cover"
                        />
                        <img
                          src={previewImages[2].thumbnailUrl}
                          alt={previewImages[2].title}
                          loading={idx < 4 ? 'eager' : 'lazy'}
                          decoding="async"
                          draggable={false}
                          className="h-full w-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="grid h-full w-full grid-cols-2 grid-rows-2 gap-0.5">
                        {previewImages.map((img, thumbIdx) => {
                          const isLastWithMore = thumbIdx === 3 && remainingCount > 0;
                          return (
                            <div key={img.id} className="relative h-full w-full overflow-hidden">
                              <img
                                src={img.thumbnailUrl}
                                alt={img.title}
                                loading={idx < 4 ? 'eager' : 'lazy'}
                                fetchPriority={idx < 2 && thumbIdx === 0 ? 'high' : undefined}
                                decoding="async"
                                draggable={false}
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

                    {/* Selection Checkbox Badge in Batch Mode */}
                    {canManage && isBatchMode && (
                      <div className="pointer-events-none absolute bottom-2 right-2">
                        <span
                          className={`flex h-6 w-6 items-center justify-center rounded-full transition-colors ${
                            isSelected
                              ? 'bg-[#0A84FF] text-white ring-2 ring-white shadow-md'
                              : 'border-2 border-white/85 bg-black/40 text-transparent shadow-sm'
                          }`}
                        >
                          <Check className="h-3.5 w-3.5" strokeWidth={2.75} />
                        </span>
                      </div>
                    )}

                    {/* Square Edit Button inside image */}
                    {canManage && !isBatchMode && (
                      <button
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditModal(cat);
                        }}
                        aria-label={`Chỉnh sửa ${cat.name}`}
                        title={`Chỉnh sửa ${cat.name}`}
                        className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-lg bg-black/60 text-white transition-colors hover:bg-black/80 sm:right-2.5 sm:top-2.5 sm:h-8 sm:w-8"
                      >
                        <Pencil className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      </button>
                    )}
                  </div>

                  {/* Solid Gray Footer for Album Name */}
                  <div className="border-t border-zinc-300/80 bg-zinc-200 px-2.5 py-2 dark:border-zinc-700/80 dark:bg-zinc-800 sm:px-3 sm:py-2">
                    <span className="font-display block truncate text-xs font-semibold text-zinc-900 dark:text-zinc-100 sm:text-sm">
                      {cat.name}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Album Modal (with optional image upload & library selection) */}
      {isCreateOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/75 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[calc(0.75rem+var(--app-safe-top))] sm:px-4 sm:pb-[max(1rem,env(safe-area-inset-bottom))] sm:pt-[calc(1rem+var(--app-safe-top))]"
          onClick={closeCreateModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-category-title"
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-full w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl sm:max-h-[min(92vh,calc(100dvh-2rem-var(--app-safe-top)))]"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-5 py-4">
              <h2
                id="create-category-title"
                className="font-display text-base font-bold text-zinc-50"
              >
                Tạo album mới
              </h2>
              <button
                type="button"
                onClick={closeCreateModal}
                aria-label="Đóng"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              id="create-album-form"
              onSubmit={handleCreate}
              className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5"
            >
              <div>
                <label className="mb-1.5 block text-xs font-medium text-zinc-400">
                  Tên album <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ví dụ: Bánh kem, Bánh mì..."
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
                  placeholder="Mục đích lưu trữ của album này..."
                  className="h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <span className="mb-2 block text-xs font-medium text-zinc-400">
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
                        color === c ? 'scale-110 ring-2 ring-blue-500 ring-offset-2 ring-offset-zinc-950' : ''
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              {/* Add Images into New Album */}
              <div className="space-y-3 border-t border-zinc-800 pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="block text-xs font-semibold text-zinc-200">
                      Thêm ảnh vào album ({pendingFiles.length + selectedLibraryIds.length})
                    </span>
                    <span className="text-xs text-zinc-400">
                      Tải ảnh mới lên hoặc chọn ảnh sẵn có trong kho (tùy chọn).
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowLibraryPicker((v) => !v)}
                      className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                        showLibraryPicker
                          ? 'border-blue-500 bg-blue-950/60 text-blue-300'
                          : 'border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800'
                      }`}
                    >
                      <ImageIcon className="h-3.5 w-3.5" />
                      <span>{showLibraryPicker ? 'Ẩn thư viện' : 'Chọn từ thư viện'}</span>
                    </button>

                    <label
                      htmlFor={createFileInputId}
                      className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-xs font-medium text-zinc-200 transition-colors hover:bg-zinc-800 whitespace-nowrap shrink-0"
                    >
                      <ImagePlus className="h-3.5 w-3.5" />
                      <span>Tải ảnh lên</span>
                    </label>

                    <label
                      htmlFor={createCameraInputId}
                      className="hidden h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-xs font-medium text-zinc-200 transition-colors hover:bg-zinc-800 whitespace-nowrap shrink-0 [@media(pointer:coarse)]:inline-flex"
                    >
                      <Camera className="h-3.5 w-3.5" />
                      <span>Chụp ảnh</span>
                    </label>

                    <input
                      id={createFileInputId}
                      type="file"
                      accept="image/*"
                      multiple
                      className="sr-only"
                      onChange={(e) => {
                        if (e.target.files?.length) {
                          handleAddCreateFiles(Array.from(e.target.files));
                          e.target.value = '';
                        }
                      }}
                    />
                    <input
                      id={createCameraInputId}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="sr-only"
                      onChange={(e) => {
                        if (e.target.files?.length) {
                          handleAddCreateFiles(Array.from(e.target.files));
                          e.target.value = '';
                        }
                      }}
                    />
                  </div>
                </div>

                {/* Drag & drop prompt or preview grid */}
                {pendingFiles.length + selectedLibraryIds.length === 0 ? (
                  <label
                    htmlFor={createFileInputId}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (e.dataTransfer.files?.length) {
                        handleAddCreateFiles(Array.from(e.dataTransfer.files));
                      }
                    }}
                    className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-zinc-700 bg-zinc-900/40 px-4 py-5 text-center transition-colors hover:border-blue-500 hover:bg-blue-950/20"
                  >
                    <ImagePlus className="mb-1.5 h-6 w-6 text-blue-400" />
                    <p className="text-xs font-medium text-zinc-200">
                      Nhấn để chọn nhiều ảnh từ thiết bị hoặc kéo thả vào đây
                    </p>
                  </label>
                ) : (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {selectedLibraryImages.map((img) => (
                      <div
                        key={`lib-${img.id}`}
                        className="group relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900"
                      >
                        <div className="aspect-square w-full overflow-hidden">
                          <img
                            src={img.thumbnailUrl}
                            alt={img.title}
                            referrerPolicy="no-referrer"
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleLibrarySelection(img.id)}
                          aria-label={`Bỏ ảnh ${img.title}`}
                          className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-zinc-950/80 text-zinc-200 transition-colors hover:bg-rose-600 hover:text-white"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}

                    {pendingFiles.map((pf) => (
                      <div
                        key={pf.localId}
                        className="group relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900"
                      >
                        <div className="aspect-square w-full overflow-hidden">
                          <img
                            src={pf.previewUrl}
                            alt={pf.title}
                            decoding="async"
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removePendingFile(pf.localId)}
                          aria-label={`Bỏ ảnh ${pf.title}`}
                          className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-zinc-950/80 text-zinc-200 transition-colors hover:bg-rose-600 hover:text-white"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Library Picker */}
                {showLibraryPicker && (
                  <div className="space-y-2.5 rounded-xl border border-zinc-800 bg-zinc-900/70 p-3">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
                      <input
                        type="text"
                        value={libraryQuery}
                        onChange={(e) => setLibraryQuery(e.target.value)}
                        placeholder="Tìm ảnh có sẵn theo tên hoặc album..."
                        className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-950 pl-8 pr-3 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none"
                      />
                    </div>

                    {filteredLibraryImages.length === 0 ? (
                      <p className="py-4 text-center text-xs text-zinc-400">
                        Không có ảnh nào phù hợp.
                      </p>
                    ) : (
                      <div className="grid max-h-52 grid-cols-4 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-5">
                        {filteredLibraryImages.map((img) => {
                          const isChecked = selectedLibraryIds.includes(img.id);
                          return (
                            <button
                              key={img.id}
                              type="button"
                              onClick={() => toggleLibrarySelection(img.id)}
                              title={img.title}
                              className={`relative aspect-square overflow-hidden rounded-lg border transition-all ${
                                isChecked
                                  ? 'border-blue-500 ring-2 ring-blue-500/40'
                                  : 'border-zinc-800 hover:border-zinc-600'
                              }`}
                            >
                              <img
                                src={img.thumbnailUrl}
                                alt={img.title}
                                loading="lazy"
                                referrerPolicy="no-referrer"
                                className="h-full w-full object-cover"
                              />
                              <span
                                className={`absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-md border ${
                                  isChecked
                                    ? 'border-blue-500 bg-blue-600 text-white'
                                    : 'border-white/70 bg-black/45 text-transparent'
                                }`}
                              >
                                <Check className="h-3 w-3" />
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {createError && (
                  <p className="rounded-lg border border-rose-900 bg-rose-950/50 px-3 py-2 text-xs font-medium text-rose-300">
                    {createError}
                  </p>
                )}
              </div>
            </form>

            <div className="shrink-0 space-y-2.5 border-t border-zinc-800 px-5 py-3.5">
              {isSubmitting && createUploadProgress && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-medium text-zinc-300">
                    <span>Đang tối ưu & tải ảnh lên album...</span>
                    <span className="font-mono tabular-nums">
                      {createUploadProgress.done}/{createUploadProgress.total}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                    <div
                      className="h-full rounded-full bg-blue-500 transition-[width] duration-150"
                      style={{
                        width: `${
                          createUploadProgress.total > 0
                            ? Math.max(
                                6,
                                Math.round(
                                  (createUploadProgress.done / createUploadProgress.total) * 100
                                )
                              )
                            : 100
                        }%`,
                      }}
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={closeCreateModal}
                  disabled={isSubmitting}
                  className="h-10 rounded-lg border border-zinc-800 px-4 text-sm font-medium text-zinc-300 hover:bg-zinc-900 disabled:opacity-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  form="create-album-form"
                  disabled={!name.trim() || isSubmitting}
                  className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                  <span>
                    {isSubmitting
                      ? createUploadProgress
                        ? `Đang tải (${createUploadProgress.done}/${createUploadProgress.total})...`
                        : 'Đang tạo...'
                      : pendingFiles.length + selectedLibraryIds.length > 0
                      ? `Tạo album (${pendingFiles.length + selectedLibraryIds.length} ảnh)`
                      : 'Tạo album'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit / Delete Category Modal */}
      {editingCategory && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/75 p-4"
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
