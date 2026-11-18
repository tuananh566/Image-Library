import { Upload } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackupView } from './components/BackupView';
import { BatchActionBar } from './components/BatchActionBar';
import { CategoriesView } from './components/CategoriesView';
import { GalleryGrid } from './components/GalleryGrid';
import { ImageInspectorModal } from './components/ImageInspectorModal';
import { Sidebar } from './components/Sidebar';
import { SmartSearchBar } from './components/SmartSearchBar';
import { TopBar } from './components/TopBar';
import { UploadModal } from './components/UploadModal';
import {
  batchUpdateImages,
  clearAllVaultData,
  deleteCategoryAndReassign,
  deleteImagesByIds,
  exportVaultBackup,
  getAllCategories,
  getAllImages,
  importVaultBackup,
  saveCategory,
  saveImageRecord,
  seedSampleVault,
  updateImageMetadata,
  type VaultBackupBundle,
} from './lib/db';
import { processImageBlob } from './lib/imageProcessor';
import { filterAndScoreImages } from './lib/smartSearch';
import type {
  AppTab,
  Category,
  SearchFilterState,
  StorageStats,
  VaultImageRecord,
  VaultImageView,
  ViewMode,
} from './types/vault';

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('library');
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('khoanh_theme') === 'dark';
  });

  const [isLoading, setIsLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [images, setImages] = useState<VaultImageView[]>([]);
  const objectUrlsRef = useRef<string[]>([]);

  const [viewMode, setViewMode] = useState<ViewMode>('masonry');
  const [filters, setFilters] = useState<SearchFilterState>({
    query: '',
    categoryId: 'all',
    aspectFilter: 'all',
    sortBy: 'relevance',
  });

  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState<File[]>([]);
  const [isDraggingGlobal, setIsDraggingGlobal] = useState(false);

  const [inspectedImageId, setInspectedImageId] = useState<string | null>(null);
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
      localStorage.setItem('khoanh_theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('khoanh_theme', 'light');
    }
  }, [isDark]);

  const reloadVault = useCallback(async () => {
    const [cats, recs] = await Promise.all([getAllCategories(), getAllImages()]);
    objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    const nextUrls: string[] = [];

    const viewItems: VaultImageView[] = recs.map((rec) => {
      const { blob: _b, thumbnailBlob, ...rest } = rec;
      const thumbnailUrl = URL.createObjectURL(thumbnailBlob || rec.blob);
      nextUrls.push(thumbnailUrl);
      return { ...rest, thumbnailUrl };
    });

    objectUrlsRef.current = nextUrls;
    setCategories(cats);
    setImages(viewItems);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await seedSampleVault(false);
        if (active) await reloadVault();
      } finally {
        if (active) setIsLoading(false);
      }
    })();

    return () => {
      active = false;
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [reloadVault]);

  // Global clipboard paste support for images
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return;

      const items = e.clipboardData?.items;
      if (!items) return;
      const pastedImages: File[] = [];
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const f = item.getAsFile();
          if (f) pastedImages.push(f);
        }
      }
      if (pastedImages.length > 0) {
        e.preventDefault();
        setDroppedFiles(pastedImages);
        setIsUploadOpen(true);
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  // Computed counts & storage stats
  const { categoryCounts, favoriteCount, uncategorizedCount, stats } = useMemo(() => {
    const cCounts: Record<string, number> = {};
    let favCount = 0;
    let uncatCount = 0;
    let totalBytes = 0;

    for (const img of images) {
      totalBytes += img.size;
      if (img.isFavorite) favCount++;
      if (!img.categoryId) uncatCount++;
      else cCounts[img.categoryId] = (cCounts[img.categoryId] || 0) + 1;
    }

    const storageStats: StorageStats = {
      imageCount: images.length,
      categoryCount: categories.length,
      totalBytes,
    };

    return {
      categoryCounts: cCounts,
      favoriteCount: favCount,
      uncategorizedCount: uncatCount,
      stats: storageStats,
    };
  }, [images, categories.length]);

  const scoredItems = useMemo(
    () => filterAndScoreImages(images, categories, filters),
    [images, categories, filters]
  );

  const hasActiveFilters =
    filters.query.trim() !== '' ||
    filters.categoryId !== 'all' ||
    filters.aspectFilter !== 'all';

  const clearAllFilters = () => {
    setFilters((prev) => ({
      ...prev,
      query: '',
      categoryId: 'all',
      aspectFilter: 'all',
    }));
  };

  // Handlers
  const handleQuickCreateCategory = async (name: string): Promise<Category> => {
    const newCat: Category = {
      id: `cat-${crypto.randomUUID().slice(0, 8)}`,
      name: name.trim(),
      description: '',
      color: '#2563EB',
      order: categories.length,
      createdAt: Date.now(),
    };
    await saveCategory(newCat);
    await reloadVault();
    return newCat;
  };

  const handleFullCreateCategory = async (data: {
    name: string;
    description: string;
    color: string;
  }) => {
    const newCat: Category = {
      id: `cat-${crypto.randomUUID().slice(0, 8)}`,
      name: data.name,
      description: data.description,
      color: data.color,
      order: categories.length,
      createdAt: Date.now(),
    };
    await saveCategory(newCat);
    await reloadVault();
  };

  const handleConfirmUpload = async (
    items: Array<{
      file: File;
      title: string;
      notes: string;
      categoryId: string | null;
    }>
  ) => {
    const now = Date.now();
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const processed = await processImageBlob(item.file);
      const record: VaultImageRecord = {
        id: crypto.randomUUID(),
        title: item.title,
        fileName: item.file.name,
        notes: item.notes,
        categoryId: item.categoryId,
        tags: [],
        width: processed.width,
        height: processed.height,
        size: item.file.size,
        mimeType: item.file.type || 'image/jpeg',
        aspectRatioType: processed.aspectRatioType,
        dominantColors: processed.dominantColors,
        colorFamilies: processed.colorFamilies,
        isFavorite: false,
        createdAt: now + i,
        updatedAt: now + i,
        blob: item.file,
        thumbnailBlob: processed.thumbnailBlob,
      };
      await saveImageRecord(record);
    }
    setDroppedFiles([]);
    await reloadVault();
  };

  const handleToggleFavorite = async (id: string, next: boolean) => {
    await updateImageMetadata(id, { isFavorite: next });
    setImages((prev) =>
      prev.map((img) => (img.id === id ? { ...img, isFavorite: next } : img))
    );
  };

  const handleUpdateImage = async (
    id: string,
    patch: Partial<{
      title: string;
      notes: string;
      categoryId: string | null;
      isFavorite: boolean;
    }>
  ) => {
    const updated = await updateImageMetadata(id, patch);
    if (!updated) return;
    setImages((prev) =>
      prev.map((img) =>
        img.id === id
          ? {
              ...img,
              title: updated.title,
              notes: updated.notes,
              categoryId: updated.categoryId,
              isFavorite: updated.isFavorite,
              updatedAt: updated.updatedAt,
            }
          : img
      )
    );
  };

  const handleDeleteImage = async (id: string) => {
    await deleteImagesByIds([id]);
    setInspectedImageId(null);
    await reloadVault();
  };

  const handleExportBackup = async () => {
    const bundle = await exportVaultBackup();
    const json = JSON.stringify(bundle, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const dateStr = new Date().toISOString().slice(0, 10);
    const a = document.createElement('a');
    a.href = url;
    a.download = `khoanh-sao-luu-${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleImportBackup = async (file: File, mode: 'merge' | 'replace') => {
    const text = await file.text();
    const parsed = JSON.parse(text) as VaultBackupBundle;
    if (!parsed || !Array.isArray(parsed.images)) {
      throw new Error('Invalid backup format');
    }
    const res = await importVaultBackup(parsed, mode);
    await reloadVault();
    return res;
  };

  const inspectedIndex = useMemo(
    () => scoredItems.findIndex((s) => s.image.id === inspectedImageId),
    [scoredItems, inspectedImageId]
  );
  const inspectedImage =
    inspectedIndex >= 0 ? scoredItems[inspectedIndex].image : null;

  const activeCategoryLabel = useMemo(() => {
    if (filters.categoryId === 'all') return 'Tất cả ảnh mẫu';
    if (filters.categoryId === 'favorites') return 'Ảnh yêu thích';
    if (filters.categoryId === 'uncategorized') return 'Chưa phân loại';
    return categories.find((c) => c.id === filters.categoryId)?.name || 'Danh mục';
  }, [filters.categoryId, categories]);

  return (
    <div
      className="min-h-screen bg-zinc-50 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-100"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setIsDraggingGlobal(true);
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node)) {
          setIsDraggingGlobal(false);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDraggingGlobal(false);
        if (e.dataTransfer.files?.length) {
          const imgs = Array.from(e.dataTransfer.files).filter((f) =>
            f.type.startsWith('image/')
          );
          if (imgs.length > 0) {
            setDroppedFiles(imgs);
            setIsUploadOpen(true);
          }
        }
      }}
    >
      {/* Global Drag Overlay */}
      {isDraggingGlobal && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-blue-600/15 backdrop-blur-xs">
          <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-blue-600 bg-white px-10 py-8 shadow-xl dark:bg-zinc-900">
            <Upload className="h-9 w-9 text-blue-600" />
            <p className="font-display text-base font-semibold text-zinc-950 dark:text-zinc-50">
              Thả ảnh vào đây để lưu vào kho cục bộ
            </p>
          </div>
        </div>
      )}

      <TopBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenUpload={() => {
          setDroppedFiles([]);
          setIsUploadOpen(true);
        }}
        onToggleMobileSidebar={() => setIsMobileSidebarOpen((v) => !v)}
      />

      {activeTab === 'library' && (
        <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-[1600px]">
          <Sidebar
            categories={categories}
            totalCount={images.length}
            favoriteCount={favoriteCount}
            uncategorizedCount={uncategorizedCount}
            categoryCounts={categoryCounts}
            selectedCategoryId={filters.categoryId}
            onSelectCategory={(id) =>
              setFilters((prev) => ({ ...prev, categoryId: id }))
            }
            onCreateCategory={async (name) => {
              await handleQuickCreateCategory(name);
            }}
            isOpenMobile={isMobileSidebarOpen}
            onCloseMobile={() => setIsMobileSidebarOpen(false)}
          />

          <main className="flex min-w-0 flex-1 flex-col">
            <SmartSearchBar
              query={filters.query}
              onQueryChange={(q) => setFilters((prev) => ({ ...prev, query: q }))}
              aspectFilter={filters.aspectFilter}
              onAspectFilterChange={(aspectFilter) =>
                setFilters((prev) => ({ ...prev, aspectFilter }))
              }
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              sortBy={filters.sortBy}
              onSortByChange={(sortBy) => setFilters((prev) => ({ ...prev, sortBy }))}
              categories={categories}
              isDark={isDark}
              onToggleTheme={() => setIsDark((d) => !d)}
              isBatchMode={isBatchMode}
              onToggleBatchMode={() => {
                setIsBatchMode((v) => !v);
                setSelectedIds([]);
              }}
            />

            <div className="flex-1 p-4 sm:p-6">
              {/* Context Heading & Active Filter Summary */}
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="font-display text-lg font-bold tracking-tight text-zinc-950 dark:text-zinc-50">
                    {activeCategoryLabel}
                  </h1>
                  <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-700">
                    ·
                  </span>
                  <span className="tabular-nums text-sm text-zinc-500 dark:text-zinc-400">
                    {scoredItems.length} kết quả
                  </span>
                </div>

                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={clearAllFilters}
                    className="px-2 py-1 text-xs font-medium text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100"
                  >
                    Xóa bộ lọc
                  </button>
                )}
              </div>

              {isBatchMode && (
                <BatchActionBar
                  selectedCount={selectedIds.length}
                  categories={categories}
                  onSelectAll={() =>
                    setSelectedIds(scoredItems.map((s) => s.image.id))
                  }
                  onClearSelection={() => setSelectedIds([])}
                  onAssignCategory={async (catId) => {
                    await batchUpdateImages(selectedIds, (img) => ({
                      ...img,
                      categoryId: catId,
                    }));
                    setSelectedIds([]);
                    await reloadVault();
                  }}
                  onDeleteSelected={async () => {
                    await deleteImagesByIds(selectedIds);
                    setSelectedIds([]);
                    setIsBatchMode(false);
                    await reloadVault();
                  }}
                />
              )}

              {isLoading ? (
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
                  {[0, 1, 2, 3].map((n) => (
                    <div
                      key={n}
                      className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
                    >
                      <div className="aspect-[4/3] animate-pulse bg-zinc-200 dark:bg-zinc-800" />
                      <div className="space-y-2 p-3.5">
                        <div className="h-4 w-3/4 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
                        <div className="h-3 w-1/2 animate-pulse rounded bg-zinc-100 dark:bg-zinc-900" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <GalleryGrid
                  items={scoredItems}
                  categories={categories}
                  viewMode={viewMode}
                  isBatchMode={isBatchMode}
                  selectedIds={selectedIds}
                  onToggleSelect={(id) =>
                    setSelectedIds((prev) =>
                      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
                    )
                  }
                  onOpenImage={(id) => setInspectedImageId(id)}
                  onToggleFavorite={handleToggleFavorite}
                  onOpenUpload={() => {
                    setDroppedFiles([]);
                    setIsUploadOpen(true);
                  }}
                  hasActiveFilters={hasActiveFilters}
                  onClearFilters={clearAllFilters}
                />
              )}
            </div>
          </main>
        </div>
      )}

      {activeTab === 'categories' && (
        <CategoriesView
          categories={categories}
          categoryCounts={categoryCounts}
          uncategorizedCount={uncategorizedCount}
          onCreateCategory={handleFullCreateCategory}
          onUpdateCategory={async (cat) => {
            await saveCategory(cat);
            await reloadVault();
          }}
          onDeleteCategory={async (id) => {
            await deleteCategoryAndReassign(id);
            if (filters.categoryId === id) {
              setFilters((prev) => ({ ...prev, categoryId: 'all' }));
            }
            await reloadVault();
          }}
          onOpenCategoryInLibrary={(catId) => {
            setFilters((prev) => ({ ...prev, categoryId: catId }));
            setActiveTab('library');
          }}
        />
      )}

      {activeTab === 'backup' && (
        <BackupView
          stats={stats}
          onExportBackup={handleExportBackup}
          onImportBackup={handleImportBackup}
          onRestoreSampleVault={async () => {
            await seedSampleVault(true);
            await reloadVault();
          }}
          onClearAllData={async () => {
            await clearAllVaultData();
            clearAllFilters();
            await reloadVault();
          }}
        />
      )}

      <UploadModal
        isOpen={isUploadOpen}
        initialFiles={droppedFiles}
        categories={categories}
        defaultCategoryId={
          filters.categoryId !== 'all' &&
          filters.categoryId !== 'favorites' &&
          filters.categoryId !== 'uncategorized'
            ? filters.categoryId
            : null
        }
        onClose={() => {
          setIsUploadOpen(false);
          setDroppedFiles([]);
        }}
        onCreateCategory={handleQuickCreateCategory}
        onConfirmUpload={handleConfirmUpload}
      />

      <ImageInspectorModal
        image={inspectedImage}
        categories={categories}
        hasPrev={inspectedIndex > 0}
        hasNext={inspectedIndex >= 0 && inspectedIndex < scoredItems.length - 1}
        onPrev={() => {
          if (inspectedIndex > 0) {
            setInspectedImageId(scoredItems[inspectedIndex - 1].image.id);
          }
        }}
        onNext={() => {
          if (inspectedIndex >= 0 && inspectedIndex < scoredItems.length - 1) {
            setInspectedImageId(scoredItems[inspectedIndex + 1].image.id);
          }
        }}
        onClose={() => setInspectedImageId(null)}
        onUpdate={handleUpdateImage}
        onDelete={handleDeleteImage}
        onCreateCategory={handleQuickCreateCategory}
      />
    </div>
  );
}
