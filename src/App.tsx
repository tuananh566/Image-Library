import { Smartphone, Upload } from 'lucide-react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BatchActionBar } from './components/BatchActionBar';
import { CategoriesView } from './components/CategoriesView';
import { DeviceVerificationGate } from './components/DeviceVerificationGate';
import { FloatingAddButton } from './components/FloatingAddButton';
import { GalleryGrid } from './components/GalleryGrid';
import { DEFAULT_SIDEBAR_STEP, Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import {
  clearAdminSession,
  getAdminExpiresAt,
  grantAdminSession,
} from './lib/adminAuth';
import {
  clearAllVaultData as clearLocalIndexedDbData,
} from './lib/db';
import {
  attachDeviceTokenToUrl,
  checkDeviceStatus,
  getStoredDeviceToken,
  subscribeDeviceUnauthorized,
  type TrustedDeviceInfo,
} from './lib/deviceAuth';
import {
  generateId,
  inferImageMimeType,
  isImageFile,
  processImageBlob,
  stripFileExtension,
} from './lib/imageProcessor';
import {
  batchUpdateServerImages,
  clearServerVault,
  deleteServerCategories,
  deleteServerCategory,
  deleteServerImages,
  downloadServerBackupBlob,
  fetchServerVault,
  getPendingLocalSyncCount,
  importServerBackupFile,
  readCachedVaultSnapshot,
  reorderServerCategories,
  restoreFromAutoBackup,
  saveServerCategory,
  seedServerSampleVault,
  syncLocalIndexedDbToServer,
  updateServerImageMetadata,
  uploadServerImagesBatch,
  type BackupImportProgress,
} from './lib/serverVault';

const ImageInspectorModal = lazy(() =>
  import('./components/ImageInspectorModal').then((m) => ({
    default: m.ImageInspectorModal,
  }))
);
const SettingsModal = lazy(() =>
  import('./components/SettingsModal').then((m) => ({
    default: m.SettingsModal,
  }))
);
const UploadModal = lazy(() =>
  import('./components/UploadModal').then((m) => ({
    default: m.UploadModal,
  }))
);
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


type ViewTransitionState = {
  mode: 'zoom-in' | 'zoom-out' | 'fade';
  originX: string;
  originY: string;
};

const VIEW_TRANSITION_VARIANTS = {
  initial: (vt: ViewTransitionState) => {
    if (vt.mode === 'zoom-in') return { opacity: 0, scale: 0.94 };
    if (vt.mode === 'zoom-out') return { opacity: 0, scale: 1.05 };
    return { opacity: 0, scale: 1 };
  },
  animate: {
    opacity: 1,
    scale: 1,
  },
  exit: (vt: ViewTransitionState) => {
    if (vt.mode === 'zoom-in') return { opacity: 0, scale: 1.04 };
    if (vt.mode === 'zoom-out') return { opacity: 0, scale: 0.95 };
    return { opacity: 0, scale: 1 };
  },
};

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('categories');
  const [adminExpiresAt, setAdminExpiresAt] = useState<number | null>(() =>
    getAdminExpiresAt()
  );
  const isAdmin = adminExpiresAt !== null;

  const initialBoot = useMemo(() => {
    const hasToken = Boolean(getStoredDeviceToken());
    const snapshot = hasToken ? readCachedVaultSnapshot() : null;
    return { hasToken, snapshot };
  }, []);

  const [deviceGateState, setDeviceGateState] = useState<'checking' | 'unverified' | 'trusted'>(
    () => (initialBoot.hasToken ? 'trusted' : 'checking')
  );
  const [detectedDeviceLabel, setDetectedDeviceLabel] = useState('');
  const [detectedDeviceModel, setDetectedDeviceModel] = useState('');
  const [detectedSystemSummary, setDetectedSystemSummary] = useState('');
  const [currentDevice, setCurrentDevice] = useState<TrustedDeviceInfo | null>(null);
  const [deviceDenyReason, setDeviceDenyReason] = useState<string | undefined>(undefined);

  const [isLoading, setIsLoading] = useState(() => !initialBoot.snapshot);
  const [categories, setCategories] = useState<Category[]>(
    () => initialBoot.snapshot?.categories ?? []
  );
  const [images, setImages] = useState<VaultImageView[]>(
    () => initialBoot.snapshot?.images ?? []
  );
  const [pendingLocalSync, setPendingLocalSync] = useState<{
    categories: number;
    images: number;
  }>({ categories: 0, images: 0 });
  const [dismissedSyncBanner, setDismissedSyncBanner] = useState(false);
  const [isSyncingLocal, setIsSyncingLocal] = useState(false);

  const [viewMode] = useState<ViewMode>('grid');
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
  const [droppedFiles, setDroppedFiles] = useState<File[]>([]);
  const [isDraggingGlobal, setIsDraggingGlobal] = useState(false);
  const mobileEdgeTouchStartRef = useRef<{ x: number; y: number } | null>(null);

  const [inspectedImageId, setInspectedImageId] = useState<string | null>(null);
  const [hasOpenedInspector, setHasOpenedInspector] = useState(false);
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const logoutAdmin = useCallback(() => {
    clearAdminSession();
    setAdminExpiresAt(null);
    setIsUploadOpen(false);
    setIsBatchMode(false);
    setSelectedIds([]);
    setDroppedFiles([]);
  }, []);

  useEffect(() => {
    if (adminExpiresAt === null) return;

    let timeoutId: number | undefined;
    if (Number.isFinite(adminExpiresAt)) {
      const remainingMs = adminExpiresAt - Date.now();
      if (remainingMs <= 0) {
        logoutAdmin();
        return;
      }

      timeoutId = window.setTimeout(() => {
        logoutAdmin();
      }, remainingMs);
    }

    const checkExpiration = () => {
      const validUntil = getAdminExpiresAt();
      if (
        validUntil === null ||
        (Number.isFinite(validUntil) && Date.now() >= validUntil)
      ) {
        logoutAdmin();
      }
    };

    const handleStorage = () => {
      const validUntil = getAdminExpiresAt();
      if (validUntil === null) {
        logoutAdmin();
      } else {
        setAdminExpiresAt(validUntil);
      }
    };

    window.addEventListener('focus', checkExpiration);
    document.addEventListener('visibilitychange', checkExpiration);
    window.addEventListener('storage', handleStorage);

    return () => {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
      window.removeEventListener('focus', checkExpiration);
      document.removeEventListener('visibilitychange', checkExpiration);
      window.removeEventListener('storage', handleStorage);
    };
  }, [adminExpiresAt, logoutAdmin]);

  const mainRef = useRef<HTMLElement>(null);
  const lastCategoryOriginRef = useRef<{ originX: string; originY: string }>({
    originX: '50%',
    originY: '45%',
  });
  const [viewTransition, setViewTransition] = useState<ViewTransitionState>({
    mode: 'fade',
    originX: '50%',
    originY: '50%',
  });

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

  useEffect(() => {
    if (activeTab !== 'library') {
      setIsBatchMode(false);
      setSelectedIds([]);
    }
  }, [activeTab]);

  const isViewingSpecificCategory =
    activeTab === 'library' &&
    filters.categoryId !== 'all' &&
    filters.categoryId !== 'uncategorized';

  const canGoBack = isViewingSpecificCategory;

  const handleGoBack = useCallback(() => {
    if (!isViewingSpecificCategory) return;

    const origin = lastCategoryOriginRef.current;
    setViewTransition({
      mode: 'zoom-out',
      originX: origin.originX,
      originY: origin.originY,
    });

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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const isCoarsePointer = window.matchMedia?.('(pointer: coarse)').matches;
    const isPhoneSize = Math.min(window.innerWidth, window.innerHeight) < 600;
    if (isCoarsePointer && isPhoneSize) {
      const orientation = screen.orientation as
        | (ScreenOrientation & { lock?: (orientation: string) => Promise<void> })
        | undefined;
      orientation?.lock?.('portrait')?.catch(() => {});
    }
  }, []);

  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  // Prevent browser page zoom (pinch, trackpad Ctrl+wheel, Ctrl/Cmd +/-/0)
  useEffect(() => {
    const preventGesture = (e: Event) => {
      e.preventDefault();
    };

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (
        e.key === '+' ||
        e.key === '=' ||
        e.key === '-' ||
        e.key === '_' ||
        e.key === '0' ||
        e.code === 'Equal' ||
        e.code === 'Minus' ||
        e.code === 'Digit0' ||
        e.code === 'NumpadAdd' ||
        e.code === 'NumpadSubtract' ||
        e.code === 'Numpad0'
      ) {
        e.preventDefault();
      }
    };

    document.addEventListener('gesturestart', preventGesture, { passive: false });
    document.addEventListener('gesturechange', preventGesture, { passive: false });
    document.addEventListener('gestureend', preventGesture, { passive: false });
    document.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('gesturestart', preventGesture);
      document.removeEventListener('gesturechange', preventGesture);
      document.removeEventListener('gestureend', preventGesture);
      document.removeEventListener('wheel', handleWheel);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const verifyCurrentDeviceStatus = useCallback(async () => {
    try {
      const status = await checkDeviceStatus();
      setDetectedDeviceLabel(status.detectedLabel);
      setDetectedDeviceModel(status.detectedModel || '');
      setDetectedSystemSummary(status.systemSummary || '');
      setCurrentDevice(status.device || null);
      setDeviceDenyReason(status.reason);
      if (!status.trusted) {
        logoutAdmin();
        setIsSettingsOpen(false);
        setIsUploadOpen(false);
        setInspectedImageId(null);
        setCategories([]);
        setImages([]);
        setDeviceGateState('unverified');
      } else {
        setDeviceGateState('trusted');
      }
    } catch {
      setDeviceGateState('unverified');
    }
  }, [logoutAdmin]);

  useEffect(() => {
    void verifyCurrentDeviceStatus();
  }, [verifyCurrentDeviceStatus]);

  useEffect(() => {
    return subscribeDeviceUnauthorized(() => {
      logoutAdmin();
      setIsSettingsOpen(false);
      setIsUploadOpen(false);
      setInspectedImageId(null);
      setCategories([]);
      setImages([]);
      setDeviceGateState('unverified');
      void verifyCurrentDeviceStatus();
    });
  }, [logoutAdmin, verifyCurrentDeviceStatus]);

  const reloadInFlightRef = useRef<Promise<void> | null>(null);
  const lastReloadDoneAtRef = useRef(0);
  const lastFocusRefreshAtRef = useRef(0);
  const localSyncEmptyRef = useRef(false);

  const reloadVault = useCallback(async (allowInitialSeed = false) => {
    if (reloadInFlightRef.current) {
      return reloadInFlightRef.current;
    }

    const task = (async () => {
      try {
        let vault = await fetchServerVault();
        if (
          allowInitialSeed &&
          !vault.seeded &&
          vault.images.length === 0 &&
          vault.categories.length === 0
        ) {
          const didSeed = await seedServerSampleVault(false, vault);
          if (didSeed) {
            vault = await fetchServerVault();
          }
        }
        setCategories(vault.categories);
        setImages(vault.images);
        lastReloadDoneAtRef.current = Date.now();

        if (!localSyncEmptyRef.current) {
          const catIds = new Set(vault.categories.map((c) => c.id));
          const imgIds = new Set(vault.images.map((i) => i.id));
          window.setTimeout(() => {
            void getPendingLocalSyncCount(catIds, imgIds).then((pending) => {
              if (pending.categories === 0 && pending.images === 0) {
                localSyncEmptyRef.current = true;
              }
              setPendingLocalSync(pending);
            });
          }, 900);
        }
      } finally {
        reloadInFlightRef.current = null;
      }
    })();

    reloadInFlightRef.current = task;
    return task;
  }, []);

  useEffect(() => {
    if (deviceGateState !== 'trusted') return;
    let active = true;
    if (!initialBoot.snapshot) {
      setIsLoading(true);
    }
    (async () => {
      try {
        await reloadVault(true);
      } catch {
        // Handled by unauthorized listener if device was revoked
      } finally {
        if (active) setIsLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [deviceGateState, reloadVault, initialBoot.snapshot]);

  // Live cross-device sync via Server-Sent Events + window focus refresh
  useEffect(() => {
    if (deviceGateState !== 'trusted') return;
    let sseReloadTimer: number | undefined;
    const eventSource = new EventSource(attachDeviceTokenToUrl('/api/events'));
    eventSource.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as { type?: string };
        if (msg.type === 'vault-updated') {
          if (Date.now() - lastReloadDoneAtRef.current < 600) {
            return;
          }
          if (sseReloadTimer !== undefined) {
            window.clearTimeout(sseReloadTimer);
          }
          sseReloadTimer = window.setTimeout(() => {
            sseReloadTimer = undefined;
            void reloadVault();
          }, 180);
        } else if (msg.type === 'devices-updated') {
          void verifyCurrentDeviceStatus();
        }
      } catch {
        // Ignore malformed SSE message
      }
    };

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastFocusRefreshAtRef.current < 10_000) return;
      lastFocusRefreshAtRef.current = now;
      void verifyCurrentDeviceStatus();
      void reloadVault();
    };
    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    return () => {
      if (sseReloadTimer !== undefined) {
        window.clearTimeout(sseReloadTimer);
      }
      eventSource.close();
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    };
  }, [deviceGateState, reloadVault, verifyCurrentDeviceStatus]);

  // Global clipboard paste support for images (Admin only)
  useEffect(() => {
    if (!isAdmin) return;
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
  }, [isAdmin]);

  // Computed counts & storage stats
  const { categoryCounts, stats } = useMemo(() => {
    const cCounts: Record<string, number> = {};
    let totalBytes = 0;

    for (const img of images) {
      totalBytes += img.size;
      if (img.categoryId) cCounts[img.categoryId] = (cCounts[img.categoryId] || 0) + 1;
    }

    const storageStats: StorageStats = {
      imageCount: images.length,
      categoryCount: categories.length,
      totalBytes,
    };

    return {
      categoryCounts: cCounts,
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

  const getNextCategoryOrder = useCallback(() => {
    const maxOrder = categories.reduce(
      (max, c) => Math.max(max, Number.isFinite(c.order) ? c.order : -1),
      -1
    );
    return maxOrder + 1;
  }, [categories]);

  // Handlers (Admin-guarded mutations)
  const handleQuickCreateCategory = async (name: string): Promise<Category> => {
    if (!isAdmin) throw new Error('Admin permission required');
    const quickColors = ['#2563EB', '#0284C7', '#16A34A', '#D97706', '#DC2626', '#7C3AED'];
    const randomColor = quickColors[Math.floor(Math.random() * quickColors.length)];
    const newCat: Category = {
      id: `cat-${generateId().slice(0, 8)}`,
      name: name.trim(),
      description: '',
      color: randomColor,
      order: getNextCategoryOrder(),
      createdAt: Date.now(),
    };
    await saveServerCategory(newCat);
    await reloadVault();
    return newCat;
  };

  const processAndUploadImageBatch = async (
    items: Array<{
      file: File;
      title: string;
      notes: string;
      categoryId: string | null;
    }>,
    onProgress?: (done: number, total: number) => void
  ) => {
    const total = items.length;
    if (total === 0) return;

    const baseTime = Date.now();
    const CHUNK_SIZE = 6;
    const PROCESS_CONCURRENCY = 3;
    let processedCount = 0;

    onProgress?.(0, total);

    for (let start = 0; start < total; start += CHUNK_SIZE) {
      const slice = items.slice(start, start + CHUNK_SIZE);
      const records = new Array<VaultImageRecord>(slice.length);
      let cursor = 0;

      const workerCount = Math.min(PROCESS_CONCURRENCY, slice.length);
      await Promise.all(
        Array.from({ length: workerCount }, async () => {
          while (cursor < slice.length) {
            const localIdx = cursor++;
            const globalIdx = start + localIdx;
            const item = slice[localIdx];
            const sourceMime = inferImageMimeType(item.file);
            const processed = await processImageBlob(item.file, {
              optimizeLargeUpload: true,
              fileName: item.file.name,
              mimeType: sourceMime,
            });
            const uploadBlob = processed.optimizedBlob || item.file;
            const uploadMime = processed.optimizedMimeType || sourceMime;
            const uploadFileName =
              processed.optimizedFileName ||
              item.file.name ||
              `anh-mau-${baseTime + globalIdx}.jpg`;

            records[localIdx] = {
              id: generateId(),
              title: item.title,
              fileName: uploadFileName,
              notes: item.notes,
              categoryId: item.categoryId,
              tags: [],
              width: processed.width,
              height: processed.height,
              size: uploadBlob.size,
              mimeType: uploadMime,
              aspectRatioType: processed.aspectRatioType,
              dominantColors: processed.dominantColors,
              colorFamilies: processed.colorFamilies,
              isFavorite: false,
              createdAt: baseTime + globalIdx,
              updatedAt: baseTime + globalIdx,
              blob: uploadBlob,
              thumbnailBlob: processed.thumbnailBlob,
            };

            processedCount += 1;
            // Reserve final step for network batch commit completion
            onProgress?.(Math.min(processedCount, Math.max(0, total - 1)), total);
          }
        })
      );

      const uploadedViews = await uploadServerImagesBatch(records);
      if (uploadedViews.length > 0) {
        setImages((prev) => {
          const uploadedIds = new Set(uploadedViews.map((v) => v.id));
          return [...uploadedViews, ...prev.filter((img) => !uploadedIds.has(img.id))];
        });
      }
      onProgress?.(Math.min(start + slice.length, total), total);
    }
  };

  const handleFullCreateCategory = async (data: {
    name: string;
    description: string;
    color: string;
    newFiles?: File[];
    existingImageIds?: string[];
    onProgress?: (done: number, total: number) => void;
  }) => {
    if (!isAdmin) return;
    const newCat: Category = {
      id: `cat-${generateId().slice(0, 8)}`,
      name: data.name,
      description: data.description,
      color: data.color,
      order: getNextCategoryOrder(),
      createdAt: Date.now(),
    };
    await saveServerCategory(newCat);

    try {
      if (data.existingImageIds && data.existingImageIds.length > 0) {
        await batchUpdateServerImages(data.existingImageIds, { categoryId: newCat.id });
      }

      if (data.newFiles && data.newFiles.length > 0) {
        await processAndUploadImageBatch(
          data.newFiles.map((file, i) => ({
            file,
            title: stripFileExtension(file.name) || `Ảnh mẫu ${i + 1}`,
            notes: '',
            categoryId: newCat.id,
          })),
          data.onProgress
        );
      }
    } finally {
      await reloadVault();
    }
  };

  const handleConfirmUpload = async (
    items: Array<{
      file: File;
      title: string;
      notes: string;
      categoryId: string | null;
    }>,
    onProgress?: (done: number, total: number) => void
  ) => {
    if (!isAdmin) throw new Error('Admin permission required');
    await processAndUploadImageBatch(items, onProgress);
    setDroppedFiles([]);
    await reloadVault();
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
    if (!isAdmin) return;
    const updated = await updateServerImageMetadata(id, patch);
    setImages((prev) =>
      prev.map((img) => (img.id === id ? updated : img))
    );
  };

  const handleDeleteImage = async (id: string) => {
    if (!isAdmin) return;
    await deleteServerImages([id]);
    setInspectedImageId(null);
    await reloadVault();
  };

  const handleExportBackup = async () => {
    if (!isAdmin) return;
    const blob = await downloadServerBackupBlob();
    const url = URL.createObjectURL(blob);
    const dateStr = new Date().toISOString().slice(0, 10);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mai-huong-bakery-sao-luu-${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const handleImportBackup = async (
    file: File,
    mode: 'merge' | 'replace',
    onProgress?: (progress: BackupImportProgress) => void
  ) => {
    if (!isAdmin) throw new Error('Admin permission required');
    const res = await importServerBackupFile(file, mode, onProgress);
    await reloadVault();
    return res;
  };

  const handleSyncLocalToServer = async () => {
    if (!isAdmin) throw new Error('Admin permission required');
    setIsSyncingLocal(true);
    try {
      const res = await syncLocalIndexedDbToServer(
        new Set(categories.map((c) => c.id)),
        new Set(images.map((i) => i.id))
      );
      await clearLocalIndexedDbData();
      await reloadVault();
      return res;
    } finally {
      setIsSyncingLocal(false);
    }
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
    if (activeTab === 'categories') return 'Album';
    if (filters.categoryId === 'all') return 'Tất cả ảnh mẫu';
    if (filters.categoryId === 'uncategorized') return 'Chưa phân loại';
    return categories.find((c) => c.id === filters.categoryId)?.name || 'Album';
  }, [activeTab, filters.categoryId, categories]);

  if (deviceGateState === 'checking') {
    return (
      <div className="flex h-dvh w-full items-center justify-center bg-zinc-950 text-zinc-300">
        <div className="flex flex-col items-center gap-3">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-zinc-700 border-t-blue-500" />
          <p className="text-sm font-medium text-zinc-400">
            Đang nhận diện thiết bị...
          </p>
        </div>
      </div>
    );
  }

  if (deviceGateState === 'unverified') {
    return (
      <DeviceVerificationGate
        detectedLabel={detectedDeviceLabel}
        detectedModel={detectedDeviceModel}
        systemSummary={detectedSystemSummary}
        reason={deviceDenyReason}
        onVerified={() => {
          setIsLoading(true);
          setDeviceGateState('trusted');
          void verifyCurrentDeviceStatus();
        }}
      />
    );
  }

  return (
    <div
      className="flex h-dvh flex-col overflow-hidden bg-zinc-950 text-zinc-100"
      onDragOver={(e) => {
        if (!isAdmin) return;
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setIsDraggingGlobal(true);
        }
      }}
      onDragLeave={(e) => {
        if (!isAdmin) return;
        if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node)) {
          setIsDraggingGlobal(false);
        }
      }}
      onDrop={(e) => {
        if (!isAdmin) return;
        e.preventDefault();
        setIsDraggingGlobal(false);
        if (e.dataTransfer.files?.length) {
          const imgs = Array.from(e.dataTransfer.files).filter((f) => isImageFile(f));
          if (imgs.length > 0) {
            setDroppedFiles(imgs);
            setIsUploadOpen(true);
          }
        }
      }}
    >
      {/* Mobile Portrait-Only Overlay (phones rotated to landscape) */}
      <div className="fixed inset-0 z-[100] hidden flex-col items-center justify-center gap-4 bg-zinc-950 px-6 text-center text-zinc-100 [@media(orientation:landscape)_and_(max-height:520px)_and_(pointer:coarse)]:flex">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/15 bg-white/10">
          <Smartphone className="h-7 w-7" />
        </div>
        <div className="max-w-xs space-y-1.5">
          <p className="font-display text-base font-semibold">
            Vui lòng xoay dọc điện thoại
          </p>
          <p className="text-sm text-zinc-400">
            Phiên bản điện thoại chỉ hỗ trợ chế độ dọc để hiển thị lưới 2 cột tối ưu.
          </p>
        </div>
      </div>

      {/* Global Drag Overlay */}
      {isDraggingGlobal && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-blue-600/15 backdrop-blur-xs">
          <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-blue-600 bg-white px-10 py-8 shadow-xl dark:bg-zinc-900">
            <Upload className="h-9 w-9 text-blue-600" />
            <p className="font-display text-base font-semibold text-zinc-950 dark:text-zinc-50">
              Thả ảnh vào đây để tải lên server
            </p>
          </div>
        </div>
      )}

      <TopBar
        title={headerTitle}
        onBack={handleGoBack}
        canGoBack={canGoBack}
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
          onSelectTab={(tab) => {
            setViewTransition({ mode: 'fade', originX: '50%', originY: '50%' });
            setActiveTab(tab);
          }}
          categories={categories}
          totalCount={images.length}
          categoryCounts={categoryCounts}
          selectedCategoryId={filters.categoryId}
          onSelectCategory={(id) => {
            setViewTransition({ mode: 'fade', originX: '50%', originY: '50%' });
            setFilters((prev) => ({ ...prev, categoryId: id }));
          }}
          onOpenSettings={() => setIsSettingsOpen(true)}
          isOpenMobile={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
          isDesktopCollapsed={isDesktopSidebarCollapsed}
          onSetDesktopCollapsed={setIsDesktopSidebarCollapsed}
          widthStepIndex={sidebarWidthStep}
          onWidthStepChange={setSidebarWidthStep}
        />

        <main ref={mainRef} className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {isAdmin &&
            !dismissedSyncBanner &&
            (pendingLocalSync.images > 0 || pendingLocalSync.categories > 0) && (
              <div className="mx-4 mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50/90 px-4 py-2.5 text-xs sm:mx-6 dark:border-blue-900 dark:bg-blue-950/50">
                <span className="font-medium text-blue-900 dark:text-blue-100">
                  Phát hiện {pendingLocalSync.images} ảnh và {pendingLocalSync.categories} danh mục cũ trên trình duyệt này chưa được đồng bộ lên server.
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isSyncingLocal}
                    onClick={handleSyncLocalToServer}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {isSyncingLocal ? 'Đang đồng bộ...' : 'Đồng bộ lên server'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDismissedSyncBanner(true)}
                    className="rounded-lg px-2 py-1.5 font-medium text-blue-700 hover:bg-blue-100 dark:text-blue-300 dark:hover:bg-blue-900/50"
                  >
                    Ẩn
                  </button>
                </div>
              </div>
            )}
          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
            <MotionConfig reducedMotion="user">
              <AnimatePresence mode="wait" initial={false} custom={viewTransition}>
                <motion.div
                  key={`${activeTab}:${filters.categoryId}`}
                  custom={viewTransition}
                  variants={VIEW_TRANSITION_VARIANTS}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={{ duration: 0.12, ease: [0.22, 1, 0.36, 1] }}
                  style={{
                    transformOrigin: `${viewTransition.originX} ${viewTransition.originY}`,
                  }}
                  className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-zinc-950"
                >
                {activeTab === 'library' ? (
                  <>
                    <div className="min-h-0 flex-1 overflow-y-auto touch-pan-y p-1.5 pb-28 sm:p-2.5 sm:pb-28">
                      {isAdmin && isBatchMode && (
                        <BatchActionBar
                          selectedCount={selectedIds.length}
                          categories={categories}
                          onSelectAll={() =>
                            setSelectedIds(scoredItems.map((s) => s.image.id))
                          }
                          onClearSelection={() => setSelectedIds([])}
                          onExitBatchMode={() => {
                            setIsBatchMode(false);
                            setSelectedIds([]);
                          }}
                          onAssignCategory={async (catId) => {
                            if (!isAdmin) return;
                            await batchUpdateServerImages(selectedIds, { categoryId: catId });
                            setSelectedIds([]);
                            setIsBatchMode(false);
                            await reloadVault();
                          }}
                          onDeleteSelected={async () => {
                            if (!isAdmin) return;
                            await deleteServerImages(selectedIds);
                            setSelectedIds([]);
                            setIsBatchMode(false);
                            await reloadVault();
                          }}
                        />
                      )}

                      {isLoading ? (
                        <div
                          className={`grid gap-1.5 md:portrait:gap-2 md:landscape:gap-2 ${
                            isDesktopSidebarCollapsed
                              ? 'grid-cols-2 md:portrait:grid-cols-4 md:landscape:grid-cols-6'
                              : 'grid-cols-2 md:portrait:grid-cols-3 md:landscape:grid-cols-5'
                          }`}
                        >
                          {[0, 1, 2, 3, 4, 5].map((n) => (
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
                          scopeKey={`${activeTab}:${filters.categoryId}:${filters.query}:${filters.aspectFilter}:${filters.sortBy}`}
                          isSidebarCollapsed={isDesktopSidebarCollapsed}
                          isBatchMode={isBatchMode}
                          selectedIds={selectedIds}
                          onToggleSelect={(id) =>
                            setSelectedIds((prev) =>
                              prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
                            )
                          }
                          onLongPressSelect={
                            isAdmin
                              ? (id) => {
                                  setIsBatchMode(true);
                                  setSelectedIds((prev) =>
                                    prev.includes(id) ? prev : [...prev, id]
                                  );
                                }
                              : undefined
                          }
                          onOpenImage={(id) => {
                            setHasOpenedInspector(true);
                            setInspectedImageId(id);
                          }}
                          onOpenUpload={() => {
                            if (!isAdmin) return;
                            setDroppedFiles([]);
                            setIsUploadOpen(true);
                          }}
                          canUpload={isAdmin}
                          hasActiveFilters={hasActiveFilters}
                          onClearFilters={clearAllFilters}
                        />
                      )}
                    </div>

                    {/* Bottom-Right Add Circle */}
                    <FloatingAddButton
                      canAdd={isAdmin}
                      onAddClick={() => {
                        setDroppedFiles([]);
                        setIsUploadOpen(true);
                      }}
                      addTitle="Thêm ảnh mẫu"
                      addAriaLabel="Thêm ảnh mẫu"
                    />
                  </>
                ) : (
                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                    <CategoriesView
                      categories={categories}
                      images={images}
                      canManage={isAdmin}
                      onCreateCategory={handleFullCreateCategory}
                      onUpdateCategory={async (cat) => {
                        if (!isAdmin) return;
                        await saveServerCategory(cat);
                        await reloadVault();
                      }}
                      onDeleteCategory={async (id) => {
                        if (!isAdmin) return;
                        await deleteServerCategory(id);
                        if (filters.categoryId === id) {
                          setFilters((prev) => ({ ...prev, categoryId: 'all' }));
                        }
                        await reloadVault();
                      }}
                      onDeleteCategories={async (ids) => {
                        if (!isAdmin || ids.length === 0) return;
                        await deleteServerCategories(ids);
                        if (ids.includes(filters.categoryId)) {
                          setFilters((prev) => ({ ...prev, categoryId: 'all' }));
                        }
                        await reloadVault();
                      }}
                      onReorderCategories={async (orderedIds) => {
                        if (!isAdmin || orderedIds.length === 0) return;
                        setCategories((prev) => {
                          const rankMap = new Map(orderedIds.map((id, idx) => [id, idx]));
                          let tail = rankMap.size;
                          return [...prev]
                            .map((cat) => ({
                              ...cat,
                              order: rankMap.has(cat.id) ? rankMap.get(cat.id)! : tail++,
                            }))
                            .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt)
                            .map((cat, idx) => ({ ...cat, order: idx }));
                        });
                        await reorderServerCategories(orderedIds);
                        await reloadVault();
                      }}
                      onOpenCategoryInLibrary={(catId, sourceRect) => {
                        let originX = '50%';
                        let originY = '45%';
                        if (sourceRect && mainRef.current) {
                          const mainRect = mainRef.current.getBoundingClientRect();
                          if (mainRect.width > 0 && mainRect.height > 0) {
                            const cx = sourceRect.left + sourceRect.width / 2 - mainRect.left;
                            const cy = sourceRect.top + sourceRect.height / 2 - mainRect.top;
                            const px = Math.max(8, Math.min(92, (cx / mainRect.width) * 100));
                            const py = Math.max(8, Math.min(92, (cy / mainRect.height) * 100));
                            originX = `${px.toFixed(1)}%`;
                            originY = `${py.toFixed(1)}%`;
                          }
                        }
                        lastCategoryOriginRef.current = { originX, originY };
                        setViewTransition({ mode: 'zoom-in', originX, originY });
                        setFilters((prev) => ({ ...prev, categoryId: catId }));
                        setActiveTab('library');
                      }}
                    />
                  </div>
                )}
                </motion.div>
              </AnimatePresence>
            </MotionConfig>
          </div>
        </main>
      </div>

      {isSettingsOpen && (
        <Suspense fallback={null}>
          <SettingsModal
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
            isAdmin={isAdmin}
            adminExpiresAt={adminExpiresAt}
            currentDevice={currentDevice}
            onCurrentDeviceUpdated={(updated) => setCurrentDevice(updated)}
            onAuthenticateAdmin={(password) => {
              const normalized = password.trim();
              if (normalized === 'tuananh') {
                setAdminExpiresAt(grantAdminSession({ unlimited: true }));
                return true;
              }
              if (normalized === 'admin') {
                setAdminExpiresAt(grantAdminSession());
                return true;
              }
              return false;
            }}
            onLogoutAdmin={logoutAdmin}
            stats={stats}
            onExportBackup={handleExportBackup}
            onImportBackup={handleImportBackup}
            onRestoreAutoBackup={async () => {
              if (!isAdmin) throw new Error('Admin permission required');
              const res = await restoreFromAutoBackup();
              clearAllFilters();
              await reloadVault();
              return res;
            }}
            onRestoreSampleVault={async () => {
              if (!isAdmin) return;
              await seedServerSampleVault(true);
              await reloadVault();
            }}
            onClearAllData={async () => {
              if (!isAdmin) return;
              await clearServerVault();
              clearAllFilters();
              await reloadVault();
            }}
            pendingLocalSync={pendingLocalSync}
            onSyncLocalToServer={handleSyncLocalToServer}
          />
        </Suspense>
      )}

      {isAdmin && isUploadOpen && (
        <Suspense fallback={null}>
          <UploadModal
            isOpen={isAdmin && isUploadOpen}
            initialFiles={droppedFiles}
            categories={categories}
            defaultCategoryId={
              filters.categoryId !== 'all' && filters.categoryId !== 'uncategorized'
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
        </Suspense>
      )}

      {(hasOpenedInspector || inspectedImage !== null) && (
        <Suspense fallback={null}>
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
            canManage={isAdmin}
          />
        </Suspense>
      )}
    </div>
  );
}
