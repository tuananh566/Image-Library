import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  GitBranch,
  HardDrive,
  KeyRound,
  Laptop,
  Lock,
  Pencil,
  Power,
  RefreshCw,
  RotateCw,
  ScrollText,
  Search,
  Settings,
  ShieldCheck,
  Smartphone,
  Tablet,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  attachDeviceTokenToUrl,
  fetchTrustedDevices,
  logoutCurrentDevice,
  renameTrustedDevice,
  revokeTrustedDevice,
  type TrustedDeviceInfo,
} from '../lib/deviceAuth';
import { formatFileSize } from '../lib/imageProcessor';
import {
  clearServerActivityLogs,
  fetchGithubUpdateStatus,
  fetchServerActivityLogs,
  restartServer,
  saveGithubConfig,
  triggerGithubUpdate,
  waitForServerHealthy,
  type ActivityLogCategory,
  type ActivityLogLevel,
  type AutoBackupRestoreResult,
  type BackupImportProgress,
  type BackupImportResult,
  type GithubUpdateResult,
  type GithubUpdateStatusResponse,
  type ServerActivityLogEntry,
} from '../lib/serverVault';
import type { StorageStats } from '../types/vault';
import { BackupView } from './BackupView';

type SettingsSectionId =
  | 'root'
  | 'devices'
  | 'backup'
  | 'github'
  | 'server-logs';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isAdmin: boolean;
  adminExpiresAt?: number | null;
  currentDevice?: TrustedDeviceInfo | null;
  onCurrentDeviceUpdated?: (device: TrustedDeviceInfo) => void;
  onAuthenticateAdmin: (password: string) => Promise<boolean> | boolean;
  onLogoutAdmin: () => void;
  stats: StorageStats;
  onExportBackup: () => Promise<void>;
  onImportBackup: (
    file: File,
    mode: 'merge' | 'replace',
    onProgress?: (progress: BackupImportProgress) => void
  ) => Promise<BackupImportResult>;
  onRestoreAutoBackup?: () => Promise<AutoBackupRestoreResult>;
  onRestoreSampleVault: () => Promise<void>;
  onClearAllData: () => Promise<void>;
  pendingLocalSync?: { categories: number; images: number };
  onSyncLocalToServer?: () => Promise<{
    syncedCategories: number;
    syncedImages: number;
  }>;
}

interface MenuItemConfig {
  id: Exclude<SettingsSectionId, 'root'>;
  group: 'account' | 'storage' | 'system';
  title: string;
  subtitle: string;
  valueText?: string;
  valueTone?: 'default' | 'success' | 'warning' | 'muted';
  iconBgClass: string;
  icon: React.ReactNode;
  hidden?: boolean;
}

export function SettingsModal({
  isOpen,
  onClose,
  isAdmin,
  adminExpiresAt = null,
  currentDevice = null,
  onCurrentDeviceUpdated,
  onAuthenticateAdmin,
  onLogoutAdmin,
  stats,
  onExportBackup,
  onImportBackup,
  onRestoreAutoBackup,
  onRestoreSampleVault,
  onClearAllData,
  pendingLocalSync,
  onSyncLocalToServer,
}: SettingsModalProps) {
  const [activeSection, setActiveSection] = useState<SettingsSectionId>('root');

  const [adminPassword, setAdminPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [trustedDevices, setTrustedDevices] = useState<TrustedDeviceInfo[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [editingDeviceName, setEditingDeviceName] = useState('');
  const [isRenamingDevice, setIsRenamingDevice] = useState(false);

  const [githubStatus, setGithubStatus] = useState<GithubUpdateStatusResponse | null>(null);
  const [githubRepoInput, setGithubRepoInput] = useState('');
  const [githubBranchInput, setGithubBranchInput] = useState('');
  const [githubTokenInput, setGithubTokenInput] = useState('');
  const [showGithubToken, setShowGithubToken] = useState(false);
  const [isSavingGithubConfig, setIsSavingGithubConfig] = useState(false);
  const [showRepoEditor, setShowRepoEditor] = useState(false);
  const [isCheckingGithub, setIsCheckingGithub] = useState(false);
  const [isUpdatingGithub, setIsUpdatingGithub] = useState(false);
  const [githubResult, setGithubResult] = useState<GithubUpdateResult | null>(null);
  const [githubError, setGithubError] = useState<string | null>(null);
  const [confirmRestartServer, setConfirmRestartServer] = useState(false);
  const [isRestartingServer, setIsRestartingServer] = useState(false);
  const [restartNotice, setRestartNotice] = useState<{
    type: 'success' | 'warning' | 'error';
    message: string;
  } | null>(null);

  const isSuperAdmin = isAdmin && adminExpiresAt === Infinity;
  const [serverLogs, setServerLogs] = useState<ServerActivityLogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [logsMeta, setLogsMeta] = useState<{
    totalBuffered: number;
    uptimeSec: number;
    memoryMb: number;
  } | null>(null);
  const [logLevelFilter, setLogLevelFilter] = useState<'all' | ActivityLogLevel>('all');
  const [logCategoryFilter, setLogCategoryFilter] = useState<'all' | ActivityLogCategory>('all');
  const [logSearchQuery, setLogSearchQuery] = useState('');
  const [autoRefreshLogs, setAutoRefreshLogs] = useState(true);
  const [confirmClearLogs, setConfirmClearLogs] = useState(false);
  const [isClearingLogs, setIsClearingLogs] = useState(false);

  const loadServerLogs = useCallback(async () => {
    if (!isSuperAdmin) return;
    setLogsLoading(true);
    setLogsError(null);
    try {
      const res = await fetchServerActivityLogs({
        level: logLevelFilter,
        category: logCategoryFilter,
        q: logSearchQuery,
        limit: 300,
      });
      setServerLogs(res.logs);
      setLogsMeta({
        totalBuffered: res.totalBuffered,
        uptimeSec: res.uptimeSec,
        memoryMb: res.memoryMb,
      });
    } catch (err) {
      setLogsError(
        err instanceof Error ? err.message : 'Không thể tải log hoạt động server.'
      );
    } finally {
      setLogsLoading(false);
    }
  }, [isSuperAdmin, logLevelFilter, logCategoryFilter, logSearchQuery]);

  const loadDevices = useCallback(async () => {
    setDevicesLoading(true);
    try {
      const res = await fetchTrustedDevices();
      setTrustedDevices(res.devices);
    } catch {
      // Ignore transient errors
    } finally {
      setDevicesLoading(false);
    }
  }, []);

  const handleRenameDevice = async (deviceId: string) => {
    const trimmed = editingDeviceName.trim();
    if (!trimmed || isRenamingDevice) return;
    setIsRenamingDevice(true);
    try {
      const updated = await renameTrustedDevice(deviceId, trimmed);
      setTrustedDevices((prev) =>
        prev.map((d) => (d.id === deviceId ? updated : d))
      );
      if (currentDevice?.id === deviceId || updated.isCurrent) {
        onCurrentDeviceUpdated?.(updated);
      }
      setEditingDeviceId(null);
      setEditingDeviceName('');
    } finally {
      setIsRenamingDevice(false);
    }
  };

  const loadGithubStatus = useCallback(
    async (customRepo?: string, customBranch?: string) => {
      setIsCheckingGithub(true);
      setGithubError(null);
      try {
        const res = await fetchGithubUpdateStatus(customRepo, customBranch);
        setGithubStatus(res);
        setGithubRepoInput((prev) => prev || res.repo);
        setGithubBranchInput((prev) => prev || res.branch);
        if (res.checkError) {
          setGithubError(res.checkError);
        }
      } catch (err) {
        setGithubError(
          err instanceof Error ? err.message : 'Không thể kiểm tra cập nhật từ GitHub.'
        );
      } finally {
        setIsCheckingGithub(false);
      }
    },
    []
  );

  const handleSaveGithubConfig = async (clearToken = false) => {
    if (isSavingGithubConfig) return;
    setIsSavingGithubConfig(true);
    setGithubError(null);
    try {
      const saved = await saveGithubConfig({
        repo: githubRepoInput.trim() || undefined,
        branch: githubBranchInput.trim() || undefined,
        githubToken: clearToken ? undefined : githubTokenInput.trim() || undefined,
        clearToken,
      });
      if (!clearToken && githubTokenInput.trim()) {
        setGithubTokenInput('');
      }
      await loadGithubStatus(saved.repo, saved.branch);
    } catch (err) {
      setGithubError(
        err instanceof Error ? err.message : 'Không thể lưu cấu hình GitHub.'
      );
    } finally {
      setIsSavingGithubConfig(false);
    }
  };

  const handleRunGithubUpdate = async () => {
    if (isUpdatingGithub) return;
    setIsUpdatingGithub(true);
    setGithubError(null);
    setGithubResult(null);
    try {
      const targetRepo = githubRepoInput.trim() || githubStatus?.repo;
      const targetBranch = githubBranchInput.trim() || githubStatus?.branch;
      const res = await triggerGithubUpdate(
        targetRepo,
        targetBranch,
        githubTokenInput.trim() || undefined
      );
      if (githubTokenInput.trim()) {
        setGithubTokenInput('');
      }
      setGithubResult(res);
      await Promise.all([loadGithubStatus(res.repo, res.branch), loadDevices()]);
    } catch (err) {
      setGithubError(
        err instanceof Error ? err.message : 'Cập nhật từ GitHub thất bại.'
      );
    } finally {
      setIsUpdatingGithub(false);
    }
  };

  const handleRestartServer = async () => {
    if (isRestartingServer || isUpdatingGithub) return;
    setConfirmRestartServer(false);
    setIsRestartingServer(true);
    setRestartNotice(null);
    try {
      const res = await restartServer();
      const status = await waitForServerHealthy(25_000, res.bootId);
      if (status === 'restarted') {
        setRestartNotice({
          type: 'success',
          message:
            'Server đã khởi động lại thành công với tiến trình mới. Hãy tải lại trang nếu bạn vừa cập nhật giao diện.',
        });
        await Promise.all([loadGithubStatus(), loadDevices()]);
      } else if (status === 'same-process') {
        setRestartNotice({
          type: 'warning',
          message:
            'Tiến trình server cũ vẫn đang chạy (có thể do PM2/systemd hoặc cấu hình Docker chưa tự khởi động lại tiến trình mới). Hãy khởi động lại Node/Docker trên máy chủ rồi tải lại trang.',
        });
      } else {
        setRestartNotice({
          type: 'warning',
          message:
            'Đã gửi lệnh khởi động lại nhưng chưa thấy server phản hồi lại. Hãy kiểm tra tiến trình trên máy chủ nếu server chưa tự khởi động.',
        });
      }
    } catch (err) {
      setRestartNotice({
        type: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Không thể khởi động lại server. Vui lòng thử lại.',
      });
    } finally {
      setIsRestartingServer(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    setActiveSection('root');
    setAdminPassword('');
    setShowPassword(false);
    setAuthError(null);
    setNowMs(Date.now());
    setGithubError(null);
    setConfirmRestartServer(false);
    setRestartNotice(null);
    setEditingDeviceId(null);
    setConfirmClearLogs(false);
    if (isAdmin) {
      void loadDevices();
      void loadGithubStatus();
    }
  }, [isOpen, isAdmin, loadDevices, loadGithubStatus]);

  useEffect(() => {
    if (!isOpen || activeSection !== 'server-logs' || !isSuperAdmin) return;
    void loadServerLogs();
  }, [isOpen, activeSection, isSuperAdmin, loadServerLogs]);

  useEffect(() => {
    if (activeSection === 'server-logs' && !isSuperAdmin) {
      setActiveSection('root');
    }
  }, [activeSection, isSuperAdmin]);

  useEffect(() => {
    if (!isOpen || activeSection !== 'server-logs' || !isSuperAdmin || !autoRefreshLogs) return;
    const es = new EventSource(attachDeviceTokenToUrl('/api/events'));
    es.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as {
          type?: string;
          entry?: ServerActivityLogEntry;
        };
        if (msg.type === 'activity-log' && msg.entry) {
          const entry = msg.entry;
          setLogsMeta((prev) =>
            prev ? { ...prev, totalBuffered: prev.totalBuffered + 1 } : prev
          );
          if (logLevelFilter !== 'all' && entry.level !== logLevelFilter) return;
          if (logCategoryFilter !== 'all' && entry.category !== logCategoryFilter) return;
          const q = logSearchQuery.trim().toLowerCase();
          if (q) {
            const hay = [
              entry.action,
              entry.detail || '',
              entry.deviceName || '',
              entry.path || '',
              entry.ip || '',
              entry.category,
            ]
              .join(' ')
              .toLowerCase();
            if (!hay.includes(q)) return;
          }
          setServerLogs((prev) => [entry, ...prev.filter((l) => l.id !== entry.id)].slice(0, 300));
        }
      } catch {
        // Ignore malformed SSE payload
      }
    };
    return () => {
      es.close();
    };
  }, [
    isOpen,
    activeSection,
    isSuperAdmin,
    autoRefreshLogs,
    logLevelFilter,
    logCategoryFilter,
    logSearchQuery,
  ]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!isAdmin) {
          onClose();
          return;
        }
        if (editingDeviceId) {
          setEditingDeviceId(null);
          setEditingDeviceName('');
          return;
        }
        if (activeSection !== 'root') {
          setConfirmRestartServer(false);
          setConfirmClearLogs(false);
          setActiveSection('root');
          return;
        }
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isAdmin, activeSection, editingDeviceId, onClose]);

  useEffect(() => {
    if (!isOpen || !isAdmin || !adminExpiresAt || !Number.isFinite(adminExpiresAt)) return;
    const id = window.setInterval(() => {
      setNowMs(Date.now());
    }, 15_000);
    return () => window.clearInterval(id);
  }, [isOpen, isAdmin, adminExpiresAt]);

  const activeCurrentDevice = useMemo(() => {
    return (
      trustedDevices.find(
        (d) => d.isCurrent || (currentDevice && d.id === currentDevice.id)
      ) || currentDevice
    );
  }, [trustedDevices, currentDevice]);

  const adminStatusText = useMemo(() => {
    if (!isAdmin) return 'Chế độ xem';
    if (adminExpiresAt === Infinity) return 'Mở khóa · Vĩnh viễn';
    if (adminExpiresAt && Number.isFinite(adminExpiresAt)) {
      const mins = Math.max(1, Math.ceil((adminExpiresAt - nowMs) / 60_000));
      return `Đã mở khóa · ${mins}p`;
    }
    return 'Đã mở khóa';
  }, [isAdmin, adminExpiresAt, nowMs]);

  const menuItems = useMemo<MenuItemConfig[]>(() => {
    const currentDeviceLabel = activeCurrentDevice
      ? activeCurrentDevice.deviceName || activeCurrentDevice.label
      : undefined;

    return [
      {
        id: 'devices',
        group: 'account',
        title: 'Thiết bị quen thuộc',
        subtitle: 'Quản lý tên thiết bị hiện tại và danh sách tin cậy',
        valueText:
          trustedDevices.length > 0
            ? `${trustedDevices.length} thiết bị`
            : devicesLoading
              ? 'Đang tải...'
              : currentDeviceLabel || 'Đã xác nhận',
        valueTone: 'default',
        iconBgClass: 'bg-blue-500 text-white',
        icon: <Smartphone className="h-4 w-4" />,
      },
      {
        id: 'backup',
        group: 'storage',
        title: 'Lưu trữ Server & Sao lưu',
        subtitle: 'Xuất nhập JSON, bản sao lưu tự động 1 giờ và dữ liệu mẫu',
        valueText: isAdmin
          ? `${stats.imageCount} ảnh · ${formatFileSize(stats.totalBytes)}`
          : 'Cần mở khóa',
        valueTone: isAdmin ? 'default' : 'muted',
        iconBgClass: 'bg-sky-500 text-white',
        icon: <HardDrive className="h-4 w-4" />,
      },
      {
        id: 'github',
        group: 'system',
        title: 'Cập nhật từ GitHub',
        subtitle: 'Kiểm tra phiên bản mới và kéo mã nguồn an toàn',
        valueText: !isAdmin
          ? 'Cần mở khóa'
          : githubStatus?.hasUpdate
            ? 'Có bản mới'
            : githubStatus?.currentCommit?.shortSha || 'Đã đồng bộ',
        valueTone: !isAdmin
          ? 'muted'
          : githubStatus?.hasUpdate
            ? 'warning'
            : githubStatus?.latestCommit
              ? 'success'
              : 'default',
        iconBgClass: 'bg-indigo-500 text-white',
        icon: <GitBranch className="h-4 w-4" />,
      },
      {
        id: 'server-logs',
        group: 'system',
        title: 'Nhật ký hoạt động Server',
        subtitle: 'Theo dõi log thời gian thực mọi thao tác và lỗi server',
        valueText: logsMeta ? `${logsMeta.totalBuffered} dòng` : 'Trực tiếp',
        valueTone: 'default',
        iconBgClass: 'bg-violet-500 text-white',
        icon: <ScrollText className="h-4 w-4" />,
        hidden: !isSuperAdmin,
      },
    ];
  }, [
    activeCurrentDevice,
    devicesLoading,
    githubStatus,
    isAdmin,
    isSuperAdmin,
    logsMeta,
    stats.imageCount,
    stats.totalBytes,
    trustedDevices.length,
  ]);

  const settingGroups = useMemo(() => {
    const visible = menuItems.filter((item) => !item.hidden);

    return [
      {
        id: 'account',
        label: 'Quyền & Thiết bị',
        items: visible.filter((i) => i.group === 'account'),
      },
      {
        id: 'storage',
        label: 'Dữ liệu & Sao lưu',
        items: visible.filter((i) => i.group === 'storage'),
      },
      {
        id: 'system',
        label: 'Hệ thống & Máy chủ',
        items: visible.filter((i) => i.group === 'system'),
      },
    ].filter((g) => g.items.length > 0);
  }, [menuItems]);

  const currentSectionTitle = useMemo(() => {
    if (!isAdmin) return 'Xác thực quyền quản trị';
    if (activeSection === 'root') return 'Cài đặt';
    return menuItems.find((m) => m.id === activeSection)?.title || 'Cài đặt';
  }, [isAdmin, activeSection, menuItems]);

  if (!isOpen) return null;

  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminPassword.trim() || isAuthenticating) return;
    setIsAuthenticating(true);
    setAuthError(null);
    try {
      const ok = await onAuthenticateAdmin(adminPassword);
      if (ok) {
        setAdminPassword('');
        setAuthError(null);
        setActiveSection('root');
      } else {
        setAuthError('Mật khẩu không đúng. Vui lòng thử lại.');
      }
    } catch {
      setAuthError('Không thể xác thực mật khẩu. Vui lòng thử lại.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const openSection = (sectionId: Exclude<SettingsSectionId, 'root'>) => {
    setActiveSection(sectionId);
    if (sectionId === 'devices' && isAdmin) {
      void loadDevices();
    } else if (sectionId === 'github' && isAdmin && !githubStatus && !isCheckingGithub) {
      void loadGithubStatus();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/60 p-0 backdrop-blur-xs sm:px-4 sm:pb-[max(1rem,env(safe-area-inset-bottom))] sm:pt-[calc(1rem+var(--app-safe-top))]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
        onClick={(e) => e.stopPropagation()}
        className="flex h-dvh w-full flex-col overflow-hidden bg-zinc-100 pb-[env(safe-area-inset-bottom)] pt-[var(--app-safe-top)] shadow-2xl sm:h-auto sm:max-h-[min(90vh,calc(100dvh-2rem-var(--app-safe-top)))] sm:max-w-3xl sm:rounded-2xl sm:border sm:border-zinc-200 sm:pb-0 sm:pt-0 dark:bg-zinc-950 dark:sm:border-zinc-800"
      >
        {/* Header bar with non-overlapping 3-column grid */}
        <div className="grid h-14 shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b border-zinc-200 bg-white/95 px-3 backdrop-blur-sm sm:px-4 dark:border-zinc-800/90 dark:bg-zinc-950/95">
          <div className="flex items-center">
            {!isAdmin || activeSection === 'root' ? (
              <div className="flex h-9 w-9 items-center justify-center text-zinc-700 dark:text-zinc-300">
                <Settings className="h-5 w-5" />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setEditingDeviceId(null);
                  setConfirmRestartServer(false);
                  setConfirmClearLogs(false);
                  setActiveSection('root');
                }}
                className="inline-flex h-9 shrink-0 items-center gap-0.5 rounded-lg px-1.5 text-sm font-medium whitespace-nowrap text-blue-600 transition-colors hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/40"
              >
                <ChevronLeft className="h-5 w-5 -ml-1 shrink-0" />
                <span>Cài đặt</span>
              </button>
            )}
          </div>

          <h1
            id="settings-modal-title"
            className="min-w-0 truncate text-center font-display text-[15px] font-bold tracking-tight text-zinc-950 sm:text-base dark:text-zinc-50"
          >
            {currentSectionTitle}
          </h1>

          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng cài đặt"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div
          className={`min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain p-4 sm:p-6 ${
            !isAdmin ? 'flex flex-col' : 'block'
          }`}
        >
          {!isAdmin ? (
            <div className="flex flex-1 flex-col items-center justify-center py-4 sm:py-10">
              <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs sm:p-8 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600/10 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400">
                  <Lock className="h-7 w-7" />
                </div>

                <div className="mt-4 text-center">
                  <h2 className="font-display text-lg font-bold text-zinc-950 dark:text-zinc-50">
                    Xác thực quyền quản trị
                  </h2>
                  <p className="mt-1.5 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
                    Mặc định thiết bị chỉ có quyền xem. Nhập mật khẩu quản trị để mở khóa toàn bộ phần cài đặt, thiết bị quen thuộc, sao lưu và cập nhật máy chủ.
                  </p>
                </div>

                <form onSubmit={handleAdminSubmit} className="mt-6 space-y-3">
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={adminPassword}
                      onChange={(e) => {
                        setAdminPassword(e.target.value);
                        if (authError) setAuthError(null);
                      }}
                      placeholder="Nhập mật khẩu..."
                      aria-label="Mật khẩu quản trị"
                      autoFocus
                      className="h-11 w-full rounded-xl border border-zinc-300 bg-white pl-4 pr-11 text-sm text-zinc-900 focus:border-blue-600 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                      className="absolute right-2.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>

                  {authError && (
                    <p className="text-xs font-medium text-rose-600 dark:text-rose-400">
                      {authError}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={!adminPassword.trim() || isAuthenticating}
                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    <span>{isAuthenticating ? 'Đang kiểm tra...' : 'Mở khóa'}</span>
                  </button>
                </form>
              </div>
            </div>
          ) : (
            <>
              {activeSection === 'root' && (
            <div className="mx-auto w-full min-w-0 max-w-2xl space-y-5">
              {/* Top quick controls: Server Restart (first) + Admin Lock */}
              <div className="w-full min-w-0 divide-y divide-zinc-200/80 overflow-hidden rounded-2xl border border-zinc-200/90 bg-white dark:divide-zinc-800/80 dark:border-zinc-800/80 dark:bg-zinc-900">
                {/* 1. Server Restart (at the very top, direct button) */}
                <div className="px-3.5 py-3 sm:px-4">
                  <div className="flex w-full min-w-0 items-center justify-between gap-3">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-white shadow-xs">
                        <Power className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[15px] font-medium text-zinc-900 dark:text-zinc-100">
                          Khởi động lại Server
                        </div>
                        <div
                          className={`truncate text-xs font-medium ${
                            githubStatus?.serverPendingRestart
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-zinc-500 dark:text-zinc-400'
                          }`}
                        >
                          {isRestartingServer
                            ? 'Đang khởi động lại...'
                            : githubStatus?.serverPendingRestart
                              ? 'Nên restart để áp dụng thay đổi'
                              : 'Sẵn sàng'}
                        </div>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      {confirmRestartServer && !isRestartingServer ? (
                        <>
                          <button
                            type="button"
                            onClick={() => setConfirmRestartServer(false)}
                            className="inline-flex h-9 items-center rounded-xl border border-zinc-300 px-2.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                          >
                            Hủy
                          </button>
                          <button
                            type="button"
                            disabled={isUpdatingGithub}
                            onClick={() => void handleRestartServer()}
                            className="inline-flex h-9 items-center gap-1 rounded-xl bg-amber-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-amber-500 disabled:opacity-50"
                          >
                            <Power className="h-3.5 w-3.5 shrink-0" />
                            <span>Xác nhận</span>
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          disabled={isRestartingServer || isUpdatingGithub}
                          onClick={() => {
                            setRestartNotice(null);
                            setConfirmRestartServer(true);
                          }}
                          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-100 disabled:opacity-50 dark:border-amber-800/70 dark:bg-amber-950/30 dark:text-amber-300 dark:hover:bg-amber-950/60"
                        >
                          <RotateCw
                            className={`h-3.5 w-3.5 shrink-0 ${isRestartingServer ? 'animate-spin' : ''}`}
                          />
                          <span>{isRestartingServer ? 'Đang restart...' : 'Restart'}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {restartNotice && (
                    <div
                      className={`mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs ${
                        restartNotice.type === 'success'
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-200'
                          : restartNotice.type === 'warning'
                            ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200'
                            : 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-200'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        {restartNotice.type === 'success' ? (
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <AlertCircle
                            className={`mt-0.5 h-4 w-4 shrink-0 ${
                              restartNotice.type === 'warning'
                                ? 'text-amber-500 dark:text-amber-400'
                                : 'text-rose-500 dark:text-rose-400'
                            }`}
                          />
                        )}
                        <span>{restartNotice.message}</span>
                      </div>
                      {restartNotice.type === 'success' && (
                        <button
                          type="button"
                          onClick={() => window.location.reload()}
                          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md bg-emerald-600 px-2.5 text-xs font-medium text-white hover:bg-emerald-500"
                        >
                          <RotateCw className="h-3 w-3" />
                          <span>Tải lại trang</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* 2. Admin Lock bar */}
                <div className="flex w-full min-w-0 items-center justify-between gap-3 px-3.5 py-3 sm:px-4">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500 text-white shadow-xs">
                      <ShieldCheck className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[15px] font-medium text-zinc-900 dark:text-zinc-100">
                        Quyền quản trị
                      </div>
                      <div className="truncate text-xs font-medium text-emerald-600 tabular-nums dark:text-emerald-400">
                        {adminStatusText}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      onLogoutAdmin();
                      setAuthError(null);
                    }}
                    className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-100 active:bg-rose-200/70 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-950/70"
                  >
                    <Lock className="h-3.5 w-3.5 shrink-0" />
                    <span>Khóa quyền</span>
                  </button>
                </div>
              </div>

              {settingGroups.map((group) => (
                  <div key={group.id} className="w-full min-w-0 space-y-1.5">
                    <p className="px-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      {group.label}
                    </p>
                    <div className="w-full min-w-0 divide-y divide-zinc-200/80 overflow-hidden rounded-2xl border border-zinc-200/90 bg-white dark:divide-zinc-800/80 dark:border-zinc-800/80 dark:bg-zinc-900">
                      {group.items.map((item) => {
                        const valueColorClass =
                          item.valueTone === 'success'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : item.valueTone === 'warning'
                              ? 'text-amber-600 dark:text-amber-400'
                              : item.valueTone === 'muted'
                                ? 'text-zinc-400 dark:text-zinc-500'
                                : 'text-zinc-500 dark:text-zinc-400';

                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => openSection(item.id)}
                            className="flex min-h-[56px] w-full min-w-0 items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-zinc-50 active:bg-zinc-100 sm:gap-3.5 sm:px-4 dark:hover:bg-zinc-800/60 dark:active:bg-zinc-800"
                          >
                            <span
                              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg shadow-xs ${item.iconBgClass}`}
                            >
                              {item.icon}
                            </span>

                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[15px] font-medium text-zinc-900 dark:text-zinc-100">
                                {item.title}
                              </div>
                              {item.valueText && (
                                <div
                                  className={`mt-0.5 truncate text-xs font-medium tabular-nums sm:hidden ${valueColorClass}`}
                                >
                                  {item.valueText}
                                </div>
                              )}
                            </div>

                            <div className="flex shrink-0 items-center gap-1.5">
                              {item.valueText && (
                                <span
                                  className={`hidden max-w-[180px] truncate text-xs font-medium tabular-nums sm:inline ${valueColorClass}`}
                                >
                                  {item.valueText}
                                </span>
                              )}
                              <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400 dark:text-zinc-500" />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
            </div>
          )}

          {/* Subview 2: Familiar / Trusted Devices */}
          {activeSection === 'devices' && (
            <div className="mx-auto w-full min-w-0 max-w-2xl space-y-5">
              {/* Current Device Card */}
              <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="font-display text-base font-semibold text-zinc-950 dark:text-zinc-50">
                      Thiết bị hiện tại
                    </h2>
                    <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                      Các thiết bị mới truy cập lần đầu đều phải nhập mã xác nhận và ghi lại tên thiết bị.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={async () => {
                      onClose();
                      await logoutCurrentDevice();
                    }}
                    className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-zinc-200 px-3 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    <Lock className="h-3.5 w-3.5" />
                    <span>Quên thiết bị này</span>
                  </button>
                </div>

                {activeCurrentDevice && (() => {
                  const currentDisplayName =
                    activeCurrentDevice.deviceName || activeCurrentDevice.label;
                  const currentCombined = `${currentDisplayName} ${activeCurrentDevice.systemInfo || ''}`;
                  const isCurrentTablet = /iPad/i.test(currentCombined);
                  const isCurrentPhone =
                    /iPhone|Android/i.test(currentCombined) && !isCurrentTablet;
                  const isEditingCurrent = editingDeviceId === activeCurrentDevice.id;

                  return (
                    <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-3 dark:border-zinc-800 dark:bg-zinc-950/60">
                      {isEditingCurrent ? (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            void handleRenameDevice(activeCurrentDevice.id);
                          }}
                          className="flex w-full flex-wrap items-center gap-2"
                        >
                          <input
                            type="text"
                            maxLength={80}
                            autoFocus
                            value={editingDeviceName}
                            onChange={(e) => setEditingDeviceName(e.target.value)}
                            placeholder="VD: iPad Air 4, iPhone 15..."
                            className="h-8 min-w-[160px] flex-1 rounded-lg border border-zinc-300 bg-white px-2.5 text-xs text-zinc-900 focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                          />
                          <button
                            type="submit"
                            disabled={!editingDeviceName.trim() || isRenamingDevice}
                            className="inline-flex h-8 items-center gap-1 rounded-lg bg-blue-600 px-2.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
                          >
                            <Check className="h-3.5 w-3.5" />
                            <span>Lưu</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingDeviceId(null);
                              setEditingDeviceName('');
                            }}
                            className="inline-flex h-8 items-center rounded-lg border border-zinc-300 px-2.5 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                          >
                            Hủy
                          </button>
                        </form>
                      ) : (
                        <div className="flex flex-wrap items-center justify-between gap-2.5">
                          <div className="flex min-w-0 flex-1 items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-200/80 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                              {isCurrentTablet ? (
                                <Tablet className="h-4 w-4" />
                              ) : isCurrentPhone ? (
                                <Smartphone className="h-4 w-4" />
                              ) : (
                                <Laptop className="h-4 w-4" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                                  {currentDisplayName}
                                </span>
                                <span className="shrink-0 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                  · Thiết bị này
                                </span>
                              </div>
                              {activeCurrentDevice.systemInfo &&
                                activeCurrentDevice.systemInfo !== currentDisplayName && (
                                  <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                                    {activeCurrentDevice.systemInfo}
                                  </p>
                                )}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              setEditingDeviceId(activeCurrentDevice.id);
                              setEditingDeviceName(currentDisplayName);
                            }}
                            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-zinc-300 px-2.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            <span>Đổi tên</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </section>

              {/* Full Trusted Devices List (Admin only) */}
              <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="font-display text-base font-semibold text-zinc-950 tabular-nums dark:text-zinc-50">
                        Danh sách thiết bị đã tin cậy ({trustedDevices.length})
                      </h2>
                      <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                        Xem chi tiết, đổi tên hoặc thu hồi quyền truy cập của từng thiết bị.
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={devicesLoading}
                      onClick={() => void loadDevices()}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-300 bg-zinc-50 px-2.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                    >
                      <RefreshCw
                        className={`h-3.5 w-3.5 ${devicesLoading ? 'animate-spin' : ''}`}
                      />
                      <span>{devicesLoading ? 'Đang tải...' : 'Làm mới'}</span>
                    </button>
                  </div>

                  {trustedDevices.length === 0 ? (
                    <p className="py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
                      {devicesLoading
                        ? 'Đang tải danh sách thiết bị...'
                        : 'Chưa có thiết bị nào được lưu.'}
                    </p>
                  ) : (
                    <div className="divide-y divide-zinc-200/80 overflow-hidden rounded-xl border border-zinc-200 dark:divide-zinc-800/80 dark:border-zinc-800">
                      {trustedDevices.map((dev) => {
                        const displayName = dev.deviceName || dev.label;
                        const combined = `${displayName} ${dev.systemInfo || ''}`;
                        const isTablet = /iPad/i.test(combined);
                        const isPhone = /iPhone|Android/i.test(combined) && !isTablet;
                        const lastSeenText = new Intl.DateTimeFormat('vi-VN', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        }).format(new Date(dev.lastSeenAt));
                        const createdText = new Intl.DateTimeFormat('vi-VN', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        }).format(new Date(dev.createdAt));
                        const isEditingThis = editingDeviceId === dev.id;

                        return (
                          <div
                            key={dev.id}
                            className="flex flex-col justify-between gap-3 bg-zinc-50/60 px-3.5 py-3 sm:flex-row sm:items-center dark:bg-zinc-950/40"
                          >
                            <div className="flex min-w-0 flex-1 items-center gap-3">
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-200/80 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                                {isTablet ? (
                                  <Tablet className="h-4 w-4" />
                                ) : isPhone ? (
                                  <Smartphone className="h-4 w-4" />
                                ) : (
                                  <Laptop className="h-4 w-4" />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                {isEditingThis ? (
                                  <form
                                    onSubmit={(e) => {
                                      e.preventDefault();
                                      void handleRenameDevice(dev.id);
                                    }}
                                    className="flex flex-wrap items-center gap-1.5"
                                  >
                                    <input
                                      type="text"
                                      maxLength={80}
                                      autoFocus
                                      value={editingDeviceName}
                                      onChange={(e) => setEditingDeviceName(e.target.value)}
                                      placeholder="VD: iPad Air 4, iPhone 15..."
                                      className="h-8 min-w-[160px] flex-1 rounded-lg border border-zinc-300 bg-white px-2.5 text-xs text-zinc-900 focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                                    />
                                    <button
                                      type="submit"
                                      disabled={!editingDeviceName.trim() || isRenamingDevice}
                                      className="inline-flex h-8 items-center gap-1 rounded-lg bg-blue-600 px-2.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
                                    >
                                      <Check className="h-3.5 w-3.5" />
                                      <span>Lưu</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingDeviceId(null);
                                        setEditingDeviceName('');
                                      }}
                                      className="inline-flex h-8 items-center rounded-lg border border-zinc-300 px-2 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                                    >
                                      Hủy
                                    </button>
                                  </form>
                                ) : (
                                  <>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                                        {displayName}
                                      </span>
                                      {dev.isCurrent && (
                                        <span className="shrink-0 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                          · Thiết bị này
                                        </span>
                                      )}
                                    </div>
                                    <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                                      {dev.systemInfo && dev.systemInfo !== displayName
                                        ? `${dev.systemInfo} · `
                                        : ''}
                                      Hoạt động gần nhất: {lastSeenText}
                                    </p>
                                    <p className="mt-0.5 text-[11px] text-zinc-400 dark:text-zinc-500">
                                      Tin cậy từ: {createdText}
                                    </p>
                                  </>
                                )}
                              </div>
                            </div>

                            {!isEditingThis && (
                              <div className="flex shrink-0 items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingDeviceId(dev.id);
                                    setEditingDeviceName(displayName);
                                  }}
                                  title="Đổi tên thiết bị"
                                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-zinc-300 px-2.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                  <span>Đổi tên</span>
                                </button>

                                <button
                                  type="button"
                                  disabled={revokingId === dev.id}
                                  onClick={async () => {
                                    setRevokingId(dev.id);
                                    try {
                                      const res = await revokeTrustedDevice(dev.id);
                                      if (res.revokedCurrent) {
                                        onClose();
                                      } else {
                                        setTrustedDevices((prev) =>
                                          prev.filter((d) => d.id !== dev.id)
                                        );
                                      }
                                    } finally {
                                      setRevokingId(null);
                                    }
                                  }}
                                  title="Thu hồi quyền thiết bị này"
                                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-rose-200 px-2.5 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900/70 dark:text-rose-300 dark:hover:bg-rose-950/50"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  <span>Thu hồi</span>
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
            </div>
          )}

          {/* Subview 3: Backup & Storage */}
          {activeSection === 'backup' && (
            <div className="mx-auto w-full min-w-0 max-w-2xl">
              <BackupView
                embedded
                stats={stats}
                onExportBackup={onExportBackup}
                onImportBackup={onImportBackup}
                onRestoreAutoBackup={onRestoreAutoBackup}
                onRestoreSampleVault={onRestoreSampleVault}
                onClearAllData={onClearAllData}
                pendingLocalSync={pendingLocalSync}
                onSyncLocalToServer={onSyncLocalToServer}
              />
            </div>
          )}

          {/* Subview 4: GitHub Update */}
          {activeSection === 'github' && (
            <div className="mx-auto w-full min-w-0 max-w-2xl">
                <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-display text-base font-semibold text-zinc-950 dark:text-zinc-50">
                          Đồng bộ mã nguồn GitHub
                        </h2>
                        {githubStatus?.hasUpdate ? (
                          <span className="text-xs font-medium text-amber-500 dark:text-amber-300">
                            · Có bản cập nhật mới
                          </span>
                        ) : githubStatus?.latestCommit ? (
                          <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                            · Đã đồng bộ mới nhất
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                        Kéo mã nguồn mới nhất từ GitHub và giữ nguyên toàn bộ dữ liệu trên server (ảnh, danh mục, thiết bị quen thuộc).
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowRepoEditor((v) => !v)}
                      className="shrink-0 self-start text-xs font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      {showRepoEditor ? 'Ẩn cấu hình repo' : 'Cấu hình Private / Repo'}
                    </button>
                  </div>

                  {showRepoEditor && (
                    <div className="mt-4 space-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3.5 dark:border-zinc-800 dark:bg-zinc-950/60">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label
                            htmlFor="github-repo-input"
                            className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400"
                          >
                            Repository (owner/repo)
                          </label>
                          <input
                            id="github-repo-input"
                            type="text"
                            value={githubRepoInput}
                            onChange={(e) => setGithubRepoInput(e.target.value)}
                            placeholder="tuananh566/Image-Library"
                            className="h-9 w-full rounded-lg border border-zinc-300 bg-white px-3 font-mono text-xs text-zinc-900 focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="github-branch-input"
                            className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400"
                          >
                            Nhánh (branch)
                          </label>
                          <input
                            id="github-branch-input"
                            type="text"
                            value={githubBranchInput}
                            onChange={(e) => setGithubBranchInput(e.target.value)}
                            placeholder="main"
                            className="h-9 w-full rounded-lg border border-zinc-300 bg-white px-3 font-mono text-xs text-zinc-900 focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                          />
                        </div>
                      </div>

                      <div>
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <label
                            htmlFor="github-token-input"
                            className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400"
                          >
                            <KeyRound className="h-3.5 w-3.5" />
                            <span>GitHub Token cho repo Private (Contents: Read-only)</span>
                          </label>
                          {githubStatus?.hasToken && (
                            <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                              {githubStatus.tokenSource === 'env'
                                ? 'Đang dùng từ biến môi trường (.env)'
                                : 'Đã lưu an toàn trên server'}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <div className="relative flex-1">
                            <input
                              id="github-token-input"
                              type={showGithubToken ? 'text' : 'password'}
                              value={githubTokenInput}
                              onChange={(e) => setGithubTokenInput(e.target.value)}
                              placeholder={
                                githubStatus?.hasToken
                                  ? '•••••••••••••••• (đã lưu, nhập token mới nếu muốn thay)'
                                  : 'github_pat_... hoặc ghp_...'
                              }
                              className="h-9 w-full rounded-lg border border-zinc-300 bg-white pl-3 pr-9 font-mono text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
                            />
                            <button
                              type="button"
                              onClick={() => setShowGithubToken((v) => !v)}
                              aria-label={showGithubToken ? 'Ẩn token' : 'Hiện token'}
                              className="absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                            >
                              {showGithubToken ? (
                                <EyeOff className="h-3.5 w-3.5" />
                              ) : (
                                <Eye className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={isSavingGithubConfig}
                              onClick={() => void handleSaveGithubConfig(false)}
                              className="h-9 shrink-0 rounded-lg border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                            >
                              {isSavingGithubConfig ? 'Đang lưu...' : 'Lưu cấu hình'}
                            </button>
                            {githubStatus?.tokenSource === 'saved' && (
                              <button
                                type="button"
                                disabled={isSavingGithubConfig}
                                onClick={() => void handleSaveGithubConfig(true)}
                                className="h-9 shrink-0 rounded-lg border border-rose-200 px-2.5 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900/70 dark:text-rose-300 dark:hover:bg-rose-950/40"
                              >
                                Xóa token
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50/70 px-3.5 py-3 text-xs dark:border-zinc-800 dark:bg-zinc-950/60">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-zinc-700 dark:text-zinc-300">
                        {githubRepoInput || githubStatus?.repo || 'tuananh566/Image-Library'} ·{' '}
                        {githubBranchInput || githubStatus?.branch || 'main'}
                      </span>
                      {githubStatus && (
                        <span className="text-zinc-500 tabular-nums dark:text-zinc-400">
                          Đang bảo vệ: {githubStatus.preservedData.images} ảnh ·{' '}
                          {githubStatus.preservedData.categories} danh mục ·{' '}
                          {githubStatus.preservedData.devices} thiết bị
                        </span>
                      )}
                    </div>

                    {githubStatus?.currentCommit && (
                      <p className="mt-2 text-zinc-500 dark:text-zinc-400">
                        Phiên bản hiện tại:{' '}
                        <code className="font-mono text-zinc-900 dark:text-zinc-200">
                          {githubStatus.currentCommit.shortSha}
                        </code>
                        {githubStatus.currentCommit.message
                          ? ` — ${githubStatus.currentCommit.message}`
                          : ''}
                      </p>
                    )}

                    {githubStatus?.latestCommit && (
                      <p className="mt-1 text-zinc-500 dark:text-zinc-400">
                        Mới nhất trên GitHub:{' '}
                        <code className="font-mono text-blue-600 dark:text-blue-300">
                          {githubStatus.latestCommit.shortSha}
                        </code>
                        {githubStatus.latestCommit.message
                          ? ` — ${githubStatus.latestCommit.message}`
                          : ''}
                      </p>
                    )}

                    {githubStatus?.serverPendingRestart && !githubResult?.serverChanged && (
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-200">
                        <span>
                          Tệp máy chủ (server.ts) trên ổ đĩa đã thay đổi nhưng server hiện tại vẫn đang chạy phiên bản cũ. Hãy khởi động lại server để áp dụng.
                        </span>
                        <button
                          type="button"
                          disabled={isRestartingServer || isUpdatingGithub}
                          onClick={() => void handleRestartServer()}
                          className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-amber-600 px-2.5 text-xs font-medium text-white hover:bg-amber-500 disabled:opacity-50"
                        >
                          <Power className="h-3.5 w-3.5" />
                          <span>
                            {isRestartingServer ? 'Đang khởi động lại...' : 'Restart Server ngay'}
                          </span>
                        </button>
                      </div>
                    )}
                  </div>

                  {githubError && (
                    <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-200">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500 dark:text-rose-400" />
                      <span>{githubError}</span>
                    </div>
                  )}

                  {githubResult && (
                    <div className="mt-3 space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-xs text-emerald-800 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-200">
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                        <div className="space-y-1">
                          <p className="font-semibold">
                            Đã cập nhật thành công lên bản{' '}
                            <code className="font-mono">{githubResult.commit.shortSha}</code>
                            {githubResult.commit.message ? ` (${githubResult.commit.message})` : ''}.
                          </p>
                          <p className="opacity-90">
                            Dữ liệu giữ nguyên: {githubResult.preservedData.images} ảnh,{' '}
                            {githubResult.preservedData.categories} danh mục và{' '}
                            {githubResult.preservedData.devices} thiết bị quen thuộc.
                          </p>
                          {githubResult.serverChanged && (
                            <p className="text-amber-700 dark:text-amber-300">
                              Lưu ý: Tệp máy chủ (server.ts) vừa được cập nhật — hãy bấm{' '}
                              <strong>Restart Server ngay</strong> bên dưới (rồi tải lại trang) để áp dụng thay đổi backend.
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {githubResult.serverChanged && (
                          <button
                            type="button"
                            disabled={isRestartingServer || isUpdatingGithub}
                            onClick={() => void handleRestartServer()}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-amber-600 px-3 text-xs font-medium text-white hover:bg-amber-500 disabled:opacity-50"
                          >
                            <Power className="h-3.5 w-3.5" />
                            <span>
                              {isRestartingServer ? 'Đang khởi động lại...' : 'Restart Server ngay'}
                            </span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => window.location.reload()}
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-medium text-white hover:bg-emerald-500"
                        >
                          <RotateCw className="h-3.5 w-3.5" />
                          <span>Tải lại trang để áp dụng giao diện mới</span>
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      disabled={isCheckingGithub || isUpdatingGithub || isRestartingServer}
                      onClick={() =>
                        void loadGithubStatus(
                          githubRepoInput.trim() || undefined,
                          githubBranchInput.trim() || undefined
                        )
                      }
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-300 px-3 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      <RefreshCw
                        className={`h-3.5 w-3.5 ${isCheckingGithub ? 'animate-spin' : ''}`}
                      />
                      <span>{isCheckingGithub ? 'Đang kiểm tra...' : 'Kiểm tra bản mới'}</span>
                    </button>

                    <button
                      type="button"
                      disabled={isUpdatingGithub || isCheckingGithub || isRestartingServer}
                      onClick={() => void handleRunGithubUpdate()}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
                    >
                      <GitBranch
                        className={`h-3.5 w-3.5 ${isUpdatingGithub ? 'animate-pulse' : ''}`}
                      />
                      <span>
                        {isUpdatingGithub ? 'Đang cập nhật từ GitHub...' : 'Update từ GitHub'}
                      </span>
                    </button>
                  </div>
                </section>
            </div>
          )}

          {/* Subview 6: Server Activity Logs (`tuananh` Super-Admin only) */}
          {activeSection === 'server-logs' && isSuperAdmin && (
            <div className="mx-auto flex w-full min-w-0 max-w-3xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
              {/* Toolbar */}
              <div className="flex flex-col gap-3 border-b border-zinc-200 px-3.5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-4 dark:border-zinc-800">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                    <span className="font-medium text-violet-600 dark:text-violet-400">
                      Chế độ quản trị cấp cao
                    </span>
                    {logsMeta && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {logsMeta.totalBuffered} dòng · RAM {logsMeta.memoryMb} MB · Uptime{' '}
                          {logsMeta.uptimeSec >= 3600
                            ? `${Math.floor(logsMeta.uptimeSec / 3600)}h${Math.floor((logsMeta.uptimeSec % 3600) / 60)}m`
                            : logsMeta.uptimeSec >= 60
                              ? `${Math.floor(logsMeta.uptimeSec / 60)}m${logsMeta.uptimeSec % 60}s`
                              : `${logsMeta.uptimeSec}s`}
                        </span>
                      </>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    Hiển thị tối đa 300 hoạt động gần nhất theo bộ lọc hiện tại.
                  </p>
                </div>

                <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
                  <button
                    type="button"
                    onClick={() => setAutoRefreshLogs((v) => !v)}
                    className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors sm:h-8 ${
                      autoRefreshLogs
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800/80 dark:bg-emerald-950/50 dark:text-emerald-300'
                        : 'border-zinc-300 bg-zinc-50 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800'
                    }`}
                  >
                    <span
                      className={`h-2 w-2 rounded-full ${
                        autoRefreshLogs ? 'animate-pulse bg-emerald-500 dark:bg-emerald-400' : 'bg-zinc-400 dark:bg-zinc-500'
                      }`}
                    />
                    <span>Trực tiếp</span>
                  </button>

                  <button
                    type="button"
                    disabled={logsLoading}
                    onClick={() => void loadServerLogs()}
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-zinc-300 bg-zinc-50 px-2.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-50 sm:h-8 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${logsLoading ? 'animate-spin' : ''}`} />
                    <span>Làm mới</span>
                  </button>

                  <button
                    type="button"
                    disabled={serverLogs.length === 0}
                    onClick={() => {
                      const blob = new Blob([JSON.stringify(serverLogs, null, 2)], {
                        type: 'application/json',
                      });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `server-logs-${new Date().toISOString().slice(0, 10)}.json`;
                      document.body.appendChild(a);
                      a.click();
                      a.remove();
                      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
                    }}
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-zinc-300 bg-zinc-50 px-2.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-50 sm:h-8 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Tải log</span>
                  </button>

                  {confirmClearLogs ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setConfirmClearLogs(false)}
                        className="h-9 flex-1 rounded-lg border border-zinc-300 px-2 text-xs text-zinc-700 hover:bg-zinc-100 sm:h-8 sm:flex-none dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      >
                        Hủy
                      </button>
                      <button
                        type="button"
                        disabled={isClearingLogs}
                        onClick={async () => {
                          setIsClearingLogs(true);
                          try {
                            await clearServerActivityLogs();
                            setConfirmClearLogs(false);
                            await loadServerLogs();
                          } finally {
                            setIsClearingLogs(false);
                          }
                        }}
                        className="h-9 flex-1 rounded-lg bg-rose-600 px-2.5 text-xs font-medium text-white hover:bg-rose-500 disabled:opacity-50 sm:h-8 sm:flex-none"
                      >
                        Xóa hết
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmClearLogs(true)}
                      className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-rose-200 px-2.5 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-50 sm:h-8 dark:border-rose-900/70 dark:text-rose-300 dark:hover:bg-rose-950/50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Xóa log</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Filters Bar */}
              <div className="flex flex-col gap-2 border-b border-zinc-200 bg-zinc-50 px-3.5 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:px-4 dark:border-zinc-800 dark:bg-zinc-950/40">
                <div className="relative w-full sm:min-w-[180px] sm:flex-1">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" />
                  <input
                    type="text"
                    value={logSearchQuery}
                    onChange={(e) => setLogSearchQuery(e.target.value)}
                    placeholder="Tìm theo hành động, thiết bị, API, IP..."
                    className="h-9 w-full rounded-lg border border-zinc-300 bg-white pl-8 pr-3 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-violet-500 focus:outline-none sm:h-8 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
                  />
                </div>

                <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
                  <select
                    value={logLevelFilter}
                    onChange={(e) => setLogLevelFilter(e.target.value as 'all' | ActivityLogLevel)}
                    aria-label="Lọc mức độ log"
                    className="h-9 w-full min-w-0 rounded-lg border border-zinc-300 bg-white px-2.5 text-xs text-zinc-800 focus:border-violet-500 focus:outline-none sm:h-8 sm:w-auto dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                  >
                    <option value="all">Tất cả mức độ</option>
                    <option value="info">Thông tin (Info)</option>
                    <option value="warn">Cảnh báo (Warn)</option>
                    <option value="error">Lỗi (Error)</option>
                  </select>

                  <select
                    value={logCategoryFilter}
                    onChange={(e) =>
                      setLogCategoryFilter(e.target.value as 'all' | ActivityLogCategory)
                    }
                    aria-label="Lọc nhóm hoạt động"
                    className="h-9 w-full min-w-0 rounded-lg border border-zinc-300 bg-white px-2.5 text-xs text-zinc-800 focus:border-violet-500 focus:outline-none sm:h-8 sm:w-auto dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                  >
                    <option value="all">Tất cả nhóm</option>
                    <option value="system">Hệ thống</option>
                    <option value="device">Thiết bị</option>
                    <option value="image">Ảnh mẫu</option>
                    <option value="category">Danh mục</option>
                    <option value="backup">Sao lưu / Khôi phục</option>
                    <option value="github">GitHub</option>
                    <option value="http">HTTP khác</option>
                  </select>
                </div>
              </div>

              {/* Log Entries */}
              <div className="space-y-2 p-3 sm:p-3.5">
                {logsError && (
                  <div className="mb-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-200">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500 dark:text-rose-400" />
                    <span>{logsError}</span>
                  </div>
                )}

                {serverLogs.length === 0 ? (
                  <p className="py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
                    {logsLoading
                      ? 'Đang tải nhật ký hoạt động...'
                      : 'Chưa có bản ghi log nào khớp bộ lọc.'}
                  </p>
                ) : (
                  serverLogs.map((entry) => {
                    const timeText = new Intl.DateTimeFormat('vi-VN', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    }).format(new Date(entry.ts));

                    const levelStyle =
                      entry.level === 'error'
                        ? 'border-rose-200 bg-rose-50/70 dark:border-rose-900/70 dark:bg-rose-950/25'
                        : entry.level === 'warn'
                          ? 'border-amber-200 bg-amber-50/70 dark:border-amber-900/60 dark:bg-amber-950/20'
                          : 'border-zinc-200 bg-zinc-50/70 dark:border-zinc-800 dark:bg-zinc-950/50';

                    const levelTextClass =
                      entry.level === 'error'
                        ? 'text-rose-600 dark:text-rose-300'
                        : entry.level === 'warn'
                          ? 'text-amber-600 dark:text-amber-300'
                          : 'text-emerald-600 dark:text-emerald-300';

                    return (
                      <div
                        key={entry.id}
                        className={`rounded-xl border px-3 py-2.5 text-xs sm:px-3.5 ${levelStyle}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                            <span className={`font-mono text-[10px] font-semibold uppercase ${levelTextClass}`}>
                              {entry.level}
                            </span>
                            <span aria-hidden="true" className="text-zinc-400">
                              ·
                            </span>
                            <span className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
                              {entry.category}
                            </span>
                          </div>
                          <span className="shrink-0 font-mono text-[11px] text-zinc-500 tabular-nums dark:text-zinc-400">
                            {timeText}
                          </span>
                        </div>

                        <p className="mt-1 font-medium text-zinc-900 dark:text-zinc-100">
                          {entry.action}
                        </p>

                        {(entry.detail || entry.deviceName || entry.ip) && (
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                            {entry.detail && (
                              <span className="min-w-0 max-w-full break-words [overflow-wrap:anywhere]">
                                {entry.detail}
                              </span>
                            )}
                            {entry.deviceName && (
                              <span className="text-blue-600 dark:text-blue-300">
                                Thiết bị: {entry.deviceName}
                              </span>
                            )}
                            {entry.ip && (
                              <span className="text-zinc-400 dark:text-zinc-500">
                                IP: {entry.ip}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
