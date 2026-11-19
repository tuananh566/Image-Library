import { Smartphone, Upload } from 'lucide-react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BatchActionBar } from './components/BatchActionBar';
import { CategoriesView } from './components/CategoriesView';
import { DeviceVerificationGate } from './components/DeviceVerificationGate';
import { FloatingOrdersCapsule } from './components/FloatingOrdersCapsule';
import { GalleryGrid } from './components/GalleryGrid';
import { ImageInspectorModal } from './components/ImageInspectorModal';
import { OrderModal } from './components/OrderModal';
import { OrdersView } from './components/OrdersView';
import { SettingsModal } from './components/SettingsModal';
import { DEFAULT_SIDEBAR_STEP, Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { UploadModal } from './components/UploadModal';
import {
  clearAdminSession,
  getAdminExpiresAt,
  grantAdminSession,
} from './lib/adminAuth';
import {
  clearAllVaultData as clearLocalIndexedDbData,
  type VaultBackupBundle,
} from './lib/db';
import {
  attachDeviceTokenToUrl,
  checkDeviceStatus,
  subscribeDeviceUnauthorized,
} from './lib/deviceAuth';
import {
  generateId,
  inferImageMimeType,
  isImageFile,
  processImageBlob,
} from './lib/imageProcessor';
import {
  batchUpdateServerImages,
  clearServerVault,
  createServerOrder,
  deleteServerCategory,
  deleteServerImages,
  deleteServerOrder,
  exportServerBackup,
  fetchServerVault,
  getPendingLocalSyncCount,
  importServerBackup,
  saveFullServerOrder,
  saveServerCategory,
  seedServerSampleVault,
  syncLocalIndexedDbToServer,
  updateServerImageMetadata,
  updateServerOrder,
  uploadServerImage,
} from './lib/serverVault';
import { getLocalDateKey } from './lib/orderFilters';
import { filterAndScoreImages } from './lib/smartSearch';
import type {
  AppTab,
  Category,
  OrderFilterMode,
  OrderRecord,
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
    if (vt.mode === 'zoom-in') return { opacity: 0, scale: 0.78 };
    if (vt.mode === 'zoom-out') return { opacity: 0, scale: 1.12 };
    return { opacity: 0, scale: 1 };
  },
  animate: {
    opacity: 1,
    scale: 1,
  },
  exit: (vt: ViewTransitionState) => {
    if (vt.mode === 'zoom-in') return { opacity: 0, scale: 1.12 };
    if (vt.mode === 'zoom-out') return { opacity: 0, scale: 0.78 };
    return { opacity: 0, scale: 1 };
  },
};

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('library');
  const [adminExpiresAt, setAdminExpiresAt] = useState<number | null>(() =>
    getAdminExpiresAt()
  );
  const isAdmin = adminExpiresAt !== null;

  const [deviceGateState, setDeviceGateState] = useState<'checking' | 'unverified' | 'trusted'>('checking');
  const [detectedDeviceLabel, setDetectedDeviceLabel] = useState('');
  const [deviceDenyReason, setDeviceDenyReason] = useState<string | undefined>(undefined);

  const [isLoading, setIsLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [images, setImages] = useState<VaultImageView[]>([]);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [pendingLocalSync, setPendingLocalSync] = useState<{
    categories: number;
    images: number;
  }>({ categories: 0, images: 0 });
  const [dismissedSyncBanner, setDismissedSyncBanner] = useState(false);
  const [isSyncingLocal, setIsSyncingLocal] = useState(false);

  const [viewMode] = useState<ViewMode>('grid');
  const [orderFilterMode, setOrderFilterMode] = useState<OrderFilterMode>('unreceived');
  const [orderFilterDate, setOrderFilterDate] = useState<string>(() => getLocalDateKey());
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
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [orderPresetImage, setOrderPresetImage] = useState<VaultImageView | null>(null);
  const [editingOrder, setEditingOrder] = useState<OrderRecord | null>(null);
  const [openedOrdersFromInside, setOpenedOrdersFromInside] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState<File[]>([]);
  const [isDraggingGlobal, setIsDraggingGlobal] = useState(false);
  const mobileEdgeTouchStartRef = useRef<{ x: number; y: number } | null>(null);

  const [inspectedImageId, setInspectedImageId] = useState<string | null>(null);
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

    const remainingMs = adminExpiresAt - Date.now();
    if (remainingMs <= 0) {
      logoutAdmin();
      return;
    }

    const timeoutId = window.setTimeout(() => {
      logoutAdmin();
    }, remainingMs);

    const checkExpiration = () => {
      const validUntil = getAdminExpiresAt();
      if (validUntil === null || Date.now() >= validUntil) {
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
      window.clearTimeout(timeoutId);
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
    if (activeTab !== 'orders') {
      setOpenedOrdersFromInside(false);
    }
  }, [activeTab]);

  const isViewingSpecificCategory =
    activeTab === 'library' &&
    filters.categoryId !== 'all' &&
    filters.categoryId !== 'uncategorized';

  const isViewingOrdersFromInside =
    activeTab === 'orders' && openedOrdersFromInside;

  const canGoBack = isViewingSpecificCategory || isViewingOrdersFromInside;

  const handleOpenOrdersFromInside = useCallback(() => {
    setOpenedOrdersFromInside(true);
    setViewTransition({ mode: 'fade', originX: '50%', originY: '50%' });
    setActiveTab('orders');
  }, []);

  const handleGoBack = useCallback(() => {
    if (isViewingOrdersFromInside) {
      setOpenedOrdersFromInside(false);
      setViewTransition({
        mode: 'fade',
        originX: '50%',
        originY: '50%',
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
      setActiveTab('library');
      return;
    }

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
  }, [isViewingOrdersFromInside, isViewingSpecificCategory, navHistory]);

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

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length <= 1) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-image-stage="true"]')) return;
      e.preventDefault();
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
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('gesturestart', preventGesture);
      document.removeEventListener('gesturechange', preventGesture);
      document.removeEventListener('gestureend', preventGesture);
      document.removeEventListener('wheel', handleWheel);
      document.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const verifyCurrentDeviceStatus = useCallback(async () => {
    try {
      const status = await checkDeviceStatus();
      setDetectedDeviceLabel(status.detectedLabel);
      setDeviceDenyReason(status.reason);
      setDeviceGateState(status.trusted ? 'trusted' : 'unverified');
    } catch {
      setDeviceGateState('unverified');
    }
  }, []);

  useEffect(() => {
    void verifyCurrentDeviceStatus();
  }, [verifyCurrentDeviceStatus]);

  useEffect(() => {
    return subscribeDeviceUnauthorized(() => {
      setIsSettingsOpen(false);
      setIsOrderModalOpen(false);
      setIsUploadOpen(false);
      setInspectedImageId(null);
      setCategories([]);
      setImages([]);
      setOrders([]);
      setDeviceGateState('unverified');
      void verifyCurrentDeviceStatus();
    });
  }, [verifyCurrentDeviceStatus]);

  const reloadVault = useCallback(async () => {
    const vault = await fetchServerVault();
    setCategories(vault.categories);
    setImages(vault.images);
    setOrders(vault.orders || []);
    const pending = await getPendingLocalSyncCount(
      new Set(vault.categories.map((c) => c.id)),
      new Set(vault.images.map((i) => i.id))
    );
    setPendingLocalSync(pending);
  }, []);

  useEffect(() => {
    if (deviceGateState !== 'trusted') return;
    let active = true;
    setIsLoading(true);
    (async () => {
      try {
        await seedServerSampleVault(false);
        if (active) await reloadVault();
      } catch {
        // Handled by unauthorized listener if device was revoked
      } finally {
        if (active) setIsLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [deviceGateState, reloadVault]);

  // Live cross-device sync via Server-Sent Events + window focus refresh
  useEffect(() => {
    if (deviceGateState !== 'trusted') return;
    const eventSource = new EventSource(attachDeviceTokenToUrl('/api/events'));
    eventSource.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as { type?: string };
        if (msg.type === 'vault-updated') {
          void reloadVault();
        } else if (msg.type === 'devices-updated') {
          void verifyCurrentDeviceStatus();
        }
      } catch {
        // Ignore malformed SSE message
      }
    };

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        void verifyCurrentDeviceStatus();
        void reloadVault();
      }
    };
    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    return () => {
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
      order: categories.length,
      createdAt: Date.now(),
    };
    await saveServerCategory(newCat);
    await reloadVault();
    return newCat;
  };

  const handleFullCreateCategory = async (data: {
    name: string;
    description: string;
    color: string;
  }) => {
    if (!isAdmin) return;
    const newCat: Category = {
      id: `cat-${generateId().slice(0, 8)}`,
      name: data.name,
      description: data.description,
      color: data.color,
      order: categories.length,
      createdAt: Date.now(),
    };
    await saveServerCategory(newCat);
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
    if (!isAdmin) throw new Error('Admin permission required');
    const now = Date.now();
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const processed = await processImageBlob(item.file);
      const record: VaultImageRecord = {
        id: generateId(),
        title: item.title,
        fileName: item.file.name || `anh-mau-${now + i}.jpg`,
        notes: item.notes,
        categoryId: item.categoryId,
        tags: [],
        width: processed.width,
        height: processed.height,
        size: item.file.size,
        mimeType: inferImageMimeType(item.file),
        aspectRatioType: processed.aspectRatioType,
        dominantColors: processed.dominantColors,
        colorFamilies: processed.colorFamilies,
        isFavorite: false,
        createdAt: now + i,
        updatedAt: now + i,
        blob: item.file,
        thumbnailBlob: processed.thumbnailBlob,
      };
      await uploadServerImage(record);
    }
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
    const bundle = await exportServerBackup();
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
    if (!isAdmin) throw new Error('Admin permission required');
    const text = await file.text();
    const parsed = JSON.parse(text) as VaultBackupBundle;
    if (!parsed || !Array.isArray(parsed.images)) {
      throw new Error('Invalid backup format');
    }
    const res = await importServerBackup(parsed, mode);
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
    if (activeTab === 'orders') return 'Đơn hàng';
    if (activeTab === 'categories') return 'Album';
    if (filters.categoryId === 'all') return 'Tất cả ảnh mẫu';
    if (filters.categoryId === 'uncategorized') return 'Chưa phân loại';
    return categories.find((c) => c.id === filters.categoryId)?.name || 'Album';
  }, [activeTab, filters.categoryId, categories]);

  if (deviceGateState === 'checking') {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-zinc-950 text-zinc-300">
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
        reason={deviceDenyReason}
        onVerified={() => {
          setIsLoading(true);
          setDeviceGateState('trusted');
        }}
      />
    );
  }

  return (
    <div
      className="flex h-screen flex-col overflow-hidden bg-zinc-950 text-zinc-100"
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
        onSelectTab={(tab) => {
          if (tab === 'categories' && isViewingSpecificCategory) {
            const origin = lastCategoryOriginRef.current;
            setViewTransition({
              mode: 'zoom-out',
              originX: origin.originX,
              originY: origin.originY,
            });
          } else {
            setViewTransition({ mode: 'fade', originX: '50%', originY: '50%' });
          }
          setActiveTab(tab);
        }}
        onBack={handleGoBack}
        canGoBack={canGoBack}
        onToggleMobileSidebar={() => setIsMobileSidebarOpen((v) => !v)}
        isDesktopSidebarCollapsed={isDesktopSidebarCollapsed}
        onToggleDesktopSidebar={() => setIsDesktopSidebarCollapsed((v) => !v)}
        onOpenCreateOrder={() => {
          setOrderPresetImage(null);
          setEditingOrder(null);
          setIsOrderModalOpen(true);
        }}
        isOrdersView={activeTab === 'orders'}
        orders={orders}
        orderFilterMode={orderFilterMode}
        orderFilterDate={orderFilterDate}
        onChangeOrderFilterMode={setOrderFilterMode}
        onChangeOrderFilterDate={setOrderFilterDate}
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
            setOpenedOrdersFromInside(false);
            setViewTransition({ mode: 'fade', originX: '50%', originY: '50%' });
            setActiveTab(tab);
          }}
          categories={categories}
          totalCount={images.length}
          ordersCount={orders.filter((o) => !o.isReceived).length}
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
              <AnimatePresence mode="popLayout" initial={false} custom={viewTransition}>
                <motion.div
                  key={`${activeTab}:${filters.categoryId}`}
                  custom={viewTransition}
                  variants={VIEW_TRANSITION_VARIANTS}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                  style={{
                    transformOrigin: `${viewTransition.originX} ${viewTransition.originY}`,
                  }}
                  className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-zinc-950"
                >
                {activeTab === 'library' ? (
                  <>
                    <div className="min-h-0 flex-1 overflow-y-auto touch-pan-y p-4 pb-28 sm:p-6 sm:pb-28">
                      {isAdmin && isBatchMode && (
                        <BatchActionBar
                          selectedCount={selectedIds.length}
                          categories={categories}
                          onSelectAll={() =>
                            setSelectedIds(scoredItems.map((s) => s.image.id))
                          }
                          onClearSelection={() => setSelectedIds([])}
                          onAssignCategory={async (catId) => {
                            if (!isAdmin) return;
                            await batchUpdateServerImages(selectedIds, { categoryId: catId });
                            setSelectedIds([]);
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
                          className={`grid gap-3 md:portrait:gap-4 md:landscape:gap-3 ${
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
                          isSidebarCollapsed={isDesktopSidebarCollapsed}
                          isBatchMode={isBatchMode}
                          selectedIds={selectedIds}
                          onToggleSelect={(id) =>
                            setSelectedIds((prev) =>
                              prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
                            )
                          }
                          onOpenImage={(id) => setInspectedImageId(id)}
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

                    {/* Bottom-Right Orders (when sidebar/mục lục is closed) & Add Circle */}
                    <FloatingOrdersCapsule
                      showOrdersMobile={!isMobileSidebarOpen}
                      showOrdersDesktop={isDesktopSidebarCollapsed}
                      onOpenOrders={handleOpenOrdersFromInside}
                      canAdd={isAdmin}
                      onAddClick={() => {
                        setDroppedFiles([]);
                        setIsUploadOpen(true);
                      }}
                      addTitle="Thêm ảnh mẫu"
                      addAriaLabel="Thêm ảnh mẫu"
                    />
                  </>
                ) : activeTab === 'orders' ? (
                  <OrdersView
                    orders={orders}
                    filterMode={orderFilterMode}
                    filterDate={orderFilterDate}
                    onChangeFilterMode={setOrderFilterMode}
                    onChangeFilterDate={setOrderFilterDate}
                    onOpenCreateOrder={() => {
                      setOrderPresetImage(null);
                      setEditingOrder(null);
                      setIsOrderModalOpen(true);
                    }}
                    onEditOrder={(order) => {
                      setOrderPresetImage(null);
                      setEditingOrder(order);
                      setIsOrderModalOpen(true);
                    }}
                    onToggleOrderReady={async (order) => {
                      await updateServerOrder(order.id, {
                        isReady: !order.isReady,
                      });
                      await reloadVault();
                    }}
                    onMarkOrderReceived={async (order) => {
                      await updateServerOrder(order.id, {
                        isReceived: true,
                        isPaid: true,
                      });
                      await reloadVault();
                    }}
                    onDeleteOrder={async (orderId) => {
                      await deleteServerOrder(orderId);
                      await reloadVault();
                    }}
                  />
                ) : (
                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                    <CategoriesView
                      categories={categories}
                      images={images}
                      canManage={isAdmin}
                      showOrdersMobile={!isMobileSidebarOpen}
                      showOrdersDesktop={isDesktopSidebarCollapsed}
                      onOpenOrders={handleOpenOrdersFromInside}
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

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        isAdmin={isAdmin}
        adminExpiresAt={adminExpiresAt}
        onAuthenticateAdmin={(password) => {
          if (password.trim() === '123456') {
            setAdminExpiresAt(grantAdminSession());
            return true;
          }
          return false;
        }}
        onLogoutAdmin={logoutAdmin}
        stats={stats}
        onExportBackup={handleExportBackup}
        onImportBackup={handleImportBackup}
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
        onCreateOrderFromImage={(img) => {
          setInspectedImageId(null);
          setEditingOrder(null);
          setOrderPresetImage(img);
          setIsOrderModalOpen(true);
        }}
        canManage={isAdmin}
      />

      <OrderModal
        isOpen={isOrderModalOpen}
        onClose={() => {
          setIsOrderModalOpen(false);
          setOrderPresetImage(null);
          setEditingOrder(null);
        }}
        images={images}
        categories={categories}
        presetImage={orderPresetImage}
        editingOrder={editingOrder}
        onCreateOrder={async (input) => {
          await createServerOrder(input);
          await reloadVault();
        }}
        onUpdateOrder={async (orderId, input) => {
          await saveFullServerOrder(orderId, input);
          await reloadVault();
        }}
        onCreatedSuccess={() => {
          if (orderFilterMode === 'received') {
            setOrderFilterMode('unreceived');
          }
          setOpenedOrdersFromInside(false);
          setViewTransition({ mode: 'fade', originX: '50%', originY: '50%' });
          setActiveTab('orders');
        }}
      />
    </div>
  );
}
