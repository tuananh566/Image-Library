import { Upload } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BatchActionBar } from './components/BatchActionBar';
import { CategoriesView } from './components/CategoriesView';
import { GalleryGrid } from './components/GalleryGrid';
import { ImageInspectorModal } from './components/ImageInspectorModal';
import { SettingsModal } from './components/SettingsModal';
import { DEFAULT_SIDEBAR_STEP, Sidebar } from './components/Sidebar';
import { SmartSearchBar, type SearchSortOption } from './components/SmartSearchBar';
import { TopBar } from './components/TopBar';
import { UploadModal } from './components/UploadModal';
import { usePinchZoom } from './hooks/usePinchZoom';
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

const LIBRARY_SORT_OPTIONS: SearchSortOption[] = [
  { value: 'relevance', label: 'Bộ lọc' },
  { value: 'newest', label: 'Mới lưu nhất' },
  { value: 'oldest', label: 'Cũ nhất' },
  { value: 'title', label: 'Tên A–Z' },
  { value: 'size', label: 'Dung lượng' },
];

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

  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [zoomOffset, setZoomOffset] = useState<number>(0);
  const galleryScrollRef = useRef<HTMLDivElement>(null);
  const [filters, setFilters] = useState<SearchFilterState>({
    query: '',
    categoryId: 'all',
    aspectFilter: 'all',
    sortBy: 'relevance',
  });

  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isDesktopSidebarCollapsed, setIsDesktopSidebarCollapsed] = useState(false);
  const [sidebarWidthStep, setSidebarWidthStep] = useState(DEFAULT_SIDEBAR_STEP);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState<File[]>([]);
  const [isDraggingGlobal, setIsDraggingGlobal] = useState(false);
  const mobileEdgeTouchStartRef = useRef<{ x: number; y: number } | null>(null);

  const [inspectedImageId, setInspectedImageId] = useState<string | null>(null);
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [navHistory, setNavHistory] = useState<
    Array<{ tab: AppTab; categoryId: SearchFilterState['categoryId'] }>
  >([]);
  const prevRouteRef = useRef<{
    tab: AppTab;
    categoryId: SearchFilterState['categoryId'];
  }>({
    tab: activeTab,
    categoryId: filters.categoryId,
  });
  const isGoingBackRef = useRef(false);

  useEffect(() => {
    const prev = prevRouteRef.current;
    if (prev.tab !== activeTab || prev.categoryId !== filters.categoryId) {
      if (!isGoingBackRef.current) {
        setNavHistory((hist) => [...hist.slice(-29), prev]);
      }
      isGoingBackRef.current = false;
      prevRouteRef.current = { tab: activeTab, categoryId: filters.categoryId };
    }
  }, [activeTab, filters.categoryId]);

  const isViewingSpecificCategory =
    activeTab === 'library' &&
    filters.categoryId !== 'all' &&
    filters.categoryId !== 'favorites' &&
    filters.categoryId !== 'uncategorized';

  const canGoBack = isViewingSpecificCategory;

  const handleGoBack = useCallback(() => {
    if (!isViewingSpecificCategory) return;

    if (navHistory.length > 0) {
      const target = navHistory[navHistory.length - 1];
      isGoingBackRef.current = true;
      setNavHistory((hist) => hist.slice(0, -1));
      setActiveTab(target.tab);
      setFilters((prev) => ({ ...prev, categoryId: target.categoryId }));
      return;
    }

    isGoingBackRef.current = true;
    setActiveTab('categories');
  }, [isViewingSpecificCategory, navHistory]);

  const { cols: galleryCols } = usePinchZoom({
    containerRef: galleryScrollRef,
    zoomOffset,
    onZoomOffsetChange: setZoomOffset,
    enabled: activeTab === 'library' && viewMode !== 'list',
  });

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
  const { categoryCounts, favoriteCount, stats } = useMemo(() => {
    const cCounts: Record<string, number> = {};
    let favCount = 0;
    let totalBytes = 0;

    for (const img of images) {
      totalBytes += img.size;
      if (img.isFavorite) favCount++;
      if (img.categoryId) cCounts[img.categoryId] = (cCounts[img.categoryId] || 0) + 1;
    }

    const storageStats: StorageStats = {
      imageCount: images.length,
      categoryCount: categories.length,
      totalBytes,
    };

    return {
      categoryCounts: cCounts,
      favoriteCount: favCount,
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
    const quickColors = ['#2563EB', '#0284C7', '#16A34A', '#D97706', '#DC2626', '#7C3AED'];
    const randomColor = quickColors[Math.floor(Math.random() * quickColors.length)];
    const newCat: Category = {
      id: `cat-${crypto.randomUUID().slice(0, 8)}`,
      name: name.trim(),
      description: '',
      color: randomColor,
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
    a.download = `mai-huong-bakery-sao-luu-${dateStr}.json`;
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
  const filmstripImages = useMemo(
    () => scoredItems.map((s) => s.image),
    [scoredItems]
  );

  const headerTitle = useMemo(() => {
    if (activeTab === 'categories') return 'Danh mục';
    if (filters.categoryId === 'all') return 'Tất cả ảnh mẫu';
    if (filters.categoryId === 'favorites') return 'Yêu thích';
    if (filters.categoryId === 'uncategorized') return 'Chưa phân loại';
    return categories.find((c) => c.id === filters.categoryId)?.name || 'Danh mục';
  }, [activeTab, filters.categoryId, categories]);

  return (
    <div
      className="flex h-screen flex-col overflow-hidden bg-zinc-50 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-100"
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
        title={headerTitle}
        onSelectTab={setActiveTab}
        onBack={handleGoBack}
        canGoBack={canGoBack}
        isMobileSidebarOpen={isMobileSidebarOpen}
        onToggleMobileSidebar={() => setIsMobileSidebarOpen((v) => !v)}
        isDesktopSidebarCollapsed={isDesktopSidebarCollapsed}
        onToggleDesktopSidebar={() => setIsDesktopSidebarCollapsed((v) => !v)}
      />

      <div
        className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 overflow-hidden"
        onTouchStart={(e) => {
          if (e.touches.length === 1 && e.touches[0].clientX <= 28) {
            mobileEdgeTouchStartRef.current = {
              x: e.touches[0].clientX,
              y: e.touches[0].clientY,
            };
          } else {
            mobileEdgeTouchStartRef.current = null;
          }
        }}
        onTouchMove={(e) => {
          const start = mobileEdgeTouchStartRef.current;
          if (!start || e.touches.length !== 1) return;
          const dx = e.touches[0].clientX - start.x;
          const dy = Math.abs(e.touches[0].clientY - start.y);
          if (dx > 48 && dx > dy * 1.5) {
            mobileEdgeTouchStartRef.current = null;
            setIsMobileSidebarOpen(true);
          }
        }}
        onTouchEnd={() => {
          mobileEdgeTouchStartRef.current = null;
        }}
      >
        <Sidebar
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          categories={categories}
          totalCount={images.length}
          favoriteCount={favoriteCount}
          categoryCounts={categoryCounts}
          selectedCategoryId={filters.categoryId}
          onSelectCategory={(id) =>
            setFilters((prev) => ({ ...prev, categoryId: id }))
          }
          onCreateCategory={async (name) => {
            await handleQuickCreateCategory(name);
          }}
          onOpenSettings={() => setIsSettingsOpen(true)}
          isOpenMobile={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
          isDesktopCollapsed={isDesktopSidebarCollapsed}
          onSetDesktopCollapsed={setIsDesktopSidebarCollapsed}
          widthStepIndex={sidebarWidthStep}
          onWidthStepChange={setSidebarWidthStep}
        />

        <main className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {activeTab === 'library' ? (
            <>
              <div
                ref={galleryScrollRef}
                className="min-h-0 flex-1 overflow-y-auto touch-pan-y p-4 pb-28 sm:p-6 sm:pb-28"
              >
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
                      </div>
                    ))}
                  </div>
                ) : (
                  <GalleryGrid
                    items={scoredItems}
                    categories={categories}
                    viewMode={viewMode}
                    columns={galleryCols}
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

              {/* Bottom-Left Search Button / Bottom Frosted Search Bar */}
              <SmartSearchBar
                isOpen={isSearchOpen}
                onOpen={() => setIsSearchOpen(true)}
                onClose={() => setIsSearchOpen(false)}
                query={filters.query}
                onQueryChange={(q) => setFilters((prev) => ({ ...prev, query: q }))}
                placeholder="Tìm từ khóa, cat:danh mục, ratio:ngang (hỗ trợ không dấu)..."
                ariaLabel="Tìm kiếm thông minh theo từ khóa"
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                sortValue={filters.sortBy}
                sortOptions={LIBRARY_SORT_OPTIONS}
                onSortChange={(sortBy) =>
                  setFilters((prev) => ({ ...prev, sortBy: sortBy as SearchFilterState['sortBy'] }))
                }
                categories={categories}
                enableSmartHints
                isBatchMode={isBatchMode}
                onToggleBatchMode={() => {
                  setIsBatchMode((v) => !v);
                  setSelectedIds([]);
                }}
                onAddClick={() => {
                  setDroppedFiles([]);
                  setIsUploadOpen(true);
                }}
                addTitle="Thêm ảnh mẫu"
                disableShortcuts={Boolean(
                  isUploadOpen || isSettingsOpen || inspectedImageId
                )}
              />
            </>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <CategoriesView
                categories={categories}
                images={images}
                zoomOffset={zoomOffset}
                onZoomOffsetChange={setZoomOffset}
                isSearchOpen={isSearchOpen}
                onOpenSearch={() => setIsSearchOpen(true)}
                onCloseSearch={() => setIsSearchOpen(false)}
                disableShortcuts={Boolean(isUploadOpen || isSettingsOpen)}
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
                onDeleteCategories={async (ids) => {
                  for (const id of ids) {
                    await deleteCategoryAndReassign(id);
                  }
                  if (ids.includes(filters.categoryId)) {
                    setFilters((prev) => ({ ...prev, categoryId: 'all' }));
                  }
                  await reloadVault();
                }}
                onOpenCategoryInLibrary={(catId) => {
                  setFilters((prev) => ({ ...prev, categoryId: catId }));
                  setActiveTab('library');
                }}
              />
            </div>
          )}
        </main>
      </div>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        isDark={isDark}
        onSetTheme={setIsDark}
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
        images={filmstripImages}
        categories={categories}
        hasPrev={inspectedIndex > 0}
        hasNext={inspectedIndex >= 0 && inspectedIndex < scoredItems.length - 1}
        onSelectImage={(id) => setInspectedImageId(id)}
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
