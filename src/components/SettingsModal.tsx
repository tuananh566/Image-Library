import {
  AlertCircle,
  Check,
  CheckCircle2,
  Download,
  Eye,
  EyeOff,
  GitBranch,
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
import { useCallback, useEffect, useState } from 'react';
import {
  attachDeviceTokenToUrl,
  fetchTrustedDevices,
  logoutCurrentDevice,
  renameTrustedDevice,
  revokeTrustedDevice,
  type TrustedDeviceInfo,
} from '../lib/deviceAuth';
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
  type BackupImportProgress,
  type BackupImportResult,
  type GithubUpdateResult,
  type GithubUpdateStatusResponse,
  type ServerActivityLogEntry,
} from '../lib/serverVault';
import type { StorageStats } from '../types/vault';
import { BackupView } from './BackupView';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isAdmin: boolean;
  adminExpiresAt?: number | null;
  currentDevice?: TrustedDeviceInfo | null;
  onCurrentDeviceUpdated?: (device: TrustedDeviceInfo) => void;
  onAuthenticateAdmin: (password: string) => boolean;
  onLogoutAdmin: () => void;
  stats: StorageStats;
  onExportBackup: () => Promise<void>;
  onImportBackup: (
    file: File,
    mode: 'merge' | 'replace',
    onProgress?: (progress: BackupImportProgress) => void
  ) => Promise<BackupImportResult>;
  onRestoreSampleVault: () => Promise<void>;
  onClearAllData: () => Promise<void>;
  pendingLocalSync?: { categories: number; images: number };
  onSyncLocalToServer?: () => Promise<{
    syncedCategories: number;
    syncedImages: number;
  }>;
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
  onRestoreSampleVault,
  onClearAllData,
  pendingLocalSync,
  onSyncLocalToServer,
}: SettingsModalProps) {
  const [adminPassword, setAdminPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [trustedDevices, setTrustedDevices] = useState<TrustedDeviceInfo[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [editingDeviceName, setEditingDeviceName] = useState('');
  const [isRenamingDevice, setIsRenamingDevice] = useState(false);
  const [isDevicesModalOpen, setIsDevicesModalOpen] = useState(false);

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
  const [isLogsModalOpen, setIsLogsModalOpen] = useState(false);
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
      await restartServer();
      const healthy = await waitForServerHealthy(25_000);
      if (healthy) {
        setRestartNotice({
          type: 'success',
          message: 'Server đã khởi động lại thành công và sẵn sàng hoạt động.',
        });
        await Promise.all([loadGithubStatus(), loadDevices()]);
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
    setAdminPassword('');
    setShowPassword(false);
    setAuthError(null);
    setNowMs(Date.now());
    setGithubError(null);
    setConfirmRestartServer(false);
    setRestartNotice(null);
    setIsDevicesModalOpen(false);
    setEditingDeviceId(null);
    setIsLogsModalOpen(false);
    setConfirmClearLogs(false);
    if (isAdmin) {
      void loadDevices();
      void loadGithubStatus();
    }
  }, [isOpen, isAdmin, loadDevices, loadGithubStatus]);

  useEffect(() => {
    if (!isOpen || !isLogsModalOpen || !isSuperAdmin) return;
    void loadServerLogs();
  }, [isOpen, isLogsModalOpen, isSuperAdmin, loadServerLogs]);

  useEffect(() => {
    if (!isOpen || !isLogsModalOpen || !isSuperAdmin || !autoRefreshLogs) return;
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
    isLogsModalOpen,
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
        if (isLogsModalOpen) {
          setIsLogsModalOpen(false);
          setConfirmClearLogs(false);
        } else if (isDevicesModalOpen) {
          setIsDevicesModalOpen(false);
          setEditingDeviceId(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isDevicesModalOpen, isLogsModalOpen, onClose]);

  useEffect(() => {
    if (!isOpen || !isAdmin || !adminExpiresAt || !Number.isFinite(adminExpiresAt)) return;
    const id = window.setInterval(() => {
      setNowMs(Date.now());
    }, 15_000);
    return () => window.clearInterval(id);
  }, [isOpen, isAdmin, adminExpiresAt]);

  if (!isOpen) return null;

  const handleAdminSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const ok = onAuthenticateAdmin(adminPassword);
    if (ok) {
      setAdminPassword('');
      setAuthError(null);
    } else {
      setAuthError('Mật khẩu Admin không đúng. Vui lòng thử lại.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/60 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[calc(0.75rem+var(--app-safe-top))] backdrop-blur-xs sm:px-4 sm:pb-[max(1rem,env(safe-area-inset-bottom))] sm:pt-[calc(1rem+var(--app-safe-top))]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50 shadow-2xl sm:max-h-[min(90vh,calc(100dvh-2rem-var(--app-safe-top)))] dark:border-zinc-800 dark:bg-zinc-950"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center gap-2.5">
            <Settings className="h-5 w-5 text-zinc-700 dark:text-zinc-300" />
            <h1
              id="settings-modal-title"
              className="font-display text-lg font-bold tracking-tight text-zinc-950 dark:text-zinc-50"
            >
              Cài đặt
            </h1>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng cài đặt"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 space-y-6 overflow-y-auto p-6">

          {/* Admin Auth Section */}
          <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-display text-base font-semibold text-zinc-950 dark:text-zinc-50">
                      Xác thực Admin
                    </h2>
                    {isAdmin && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        <span>Đã xác thực</span>
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                    {isAdmin
                      ? `Thiết bị này đang có quyền Admin${
                          adminExpiresAt && Number.isFinite(adminExpiresAt)
                            ? ` (tự khóa lại sau ${Math.max(
                                1,
                                Math.ceil((adminExpiresAt - nowMs) / 60_000)
                              )} phút)`
                            : adminExpiresAt === Infinity
                              ? ' (mở khóa không giới hạn thời gian)'
                              : ''
                        }.`
                      : 'Mặc định thiết bị chỉ có quyền xem. Nhập mật khẩu Admin để mở khóa.'}
                  </p>
                </div>

                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      onLogoutAdmin();
                      setAuthError(null);
                    }}
                    className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-zinc-200 px-3 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                  >
                    <Lock className="h-3.5 w-3.5" />
                    <span>Khóa quyền Admin</span>
                  </button>
                )}
              </div>

              {!isAdmin && (
                <form onSubmit={handleAdminSubmit} className="space-y-2">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="relative flex-1">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={adminPassword}
                        onChange={(e) => {
                          setAdminPassword(e.target.value);
                          if (authError) setAuthError(null);
                        }}
                        placeholder="Nhập mật khẩu Admin..."
                        aria-label="Mật khẩu Admin"
                        className="h-10 w-full rounded-lg border border-zinc-300 bg-white pl-3 pr-10 text-sm text-zinc-900 focus:border-blue-600 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                        className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                    <button
                      type="submit"
                      disabled={!adminPassword.trim()}
                      className="h-10 shrink-0 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Xác thực
                    </button>
                  </div>
                  {authError && (
                    <p className="text-xs font-medium text-rose-600 dark:text-rose-400">
                      {authError}
                    </p>
                  )}
                </form>
              )}
            </div>
          </section>

          {/* Familiar Devices Section */}
          <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-display text-base font-semibold text-zinc-950 dark:text-zinc-50">
                    Thiết bị quen thuộc
                  </h2>
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    <span>Đã xác nhận</span>
                  </span>
                </div>
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
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-zinc-200 px-3 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
              >
                <Lock className="h-3.5 w-3.5" />
                <span>Quên thiết bị này</span>
              </button>
            </div>

            {(() => {
              const activeCurrentDevice =
                trustedDevices.find(
                  (d) => d.isCurrent || (currentDevice && d.id === currentDevice.id)
                ) || currentDevice;
              if (!activeCurrentDevice) return null;
              const currentDisplayName =
                activeCurrentDevice.deviceName || activeCurrentDevice.label;
              const currentCombined = `${currentDisplayName} ${activeCurrentDevice.systemInfo || ''}`;
              const isCurrentTablet = /iPad/i.test(currentCombined);
              const isCurrentPhone =
                /iPhone|Android/i.test(currentCombined) && !isCurrentTablet;
              const isEditingCurrent = editingDeviceId === activeCurrentDevice.id;

              return (
                <div className="mt-3.5 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2.5">
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
                        className="h-8 min-w-[160px] flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 text-xs text-zinc-100 focus:border-blue-500 focus:outline-none"
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
                        className="inline-flex h-8 items-center rounded-lg border border-zinc-700 px-2.5 text-xs text-zinc-300 hover:bg-zinc-800"
                      >
                        Hủy
                      </button>
                    </form>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-2.5">
                      <div className="flex min-w-0 flex-1 items-center gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-zinc-300">
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
                            <span className="truncate text-sm font-medium text-zinc-100">
                              {currentDisplayName}
                            </span>
                            <span className="shrink-0 rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">
                              Thiết bị hiện tại
                            </span>
                          </div>
                          {activeCurrentDevice.systemInfo &&
                            activeCurrentDevice.systemInfo !== currentDisplayName && (
                              <p className="truncate text-xs text-zinc-400">
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
                        className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-zinc-700 px-2.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-800"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        <span>Đổi tên</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}

            {isAdmin && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Thiết bị đã tin cậy
                  </span>
                  <p className="mt-0.5 text-sm font-medium text-zinc-200 tabular-nums">
                    {devicesLoading && trustedDevices.length === 0
                      ? 'Đang tải...'
                      : `${trustedDevices.length} thiết bị đã tin cậy`}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setEditingDeviceId(null);
                    setIsDevicesModalOpen(true);
                    void loadDevices();
                  }}
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-xs font-medium text-zinc-100 transition-colors hover:bg-zinc-800"
                >
                  <Eye className="h-3.5 w-3.5" />
                  <span>Xem từng thiết bị</span>
                </button>
              </div>
            )}
          </section>

          {/* GitHub Update Section (Admin only) */}
          {isAdmin && (
            <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-base font-semibold text-zinc-950 dark:text-zinc-50">
                      Cập nhật từ GitHub
                    </h2>
                    {githubStatus?.hasUpdate ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-300">
                        <GitBranch className="h-3.5 w-3.5" />
                        <span>Có bản cập nhật mới</span>
                      </span>
                    ) : githubStatus?.latestCommit ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>Đã đồng bộ mới nhất</span>
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                    Kéo mã nguồn mới nhất từ GitHub và giữ nguyên toàn bộ dữ liệu trên server (ảnh, danh mục, đơn hàng, thiết bị quen thuộc).
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setShowRepoEditor((v) => !v)}
                  className="shrink-0 self-start text-xs font-medium text-blue-500 hover:text-blue-400"
                >
                  {showRepoEditor ? 'Ẩn cấu hình repo' : 'Cấu hình Private / Repo'}
                </button>
              </div>

              {showRepoEditor && (
                <div className="mt-4 space-y-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3.5 dark:border-zinc-800 dark:bg-zinc-900/50">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="github-repo-input"
                        className="mb-1 block text-xs font-medium text-zinc-400"
                      >
                        Repository (owner/repo)
                      </label>
                      <input
                        id="github-repo-input"
                        type="text"
                        value={githubRepoInput}
                        onChange={(e) => setGithubRepoInput(e.target.value)}
                        placeholder="tuananh566/Image-Library"
                        className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 font-mono text-xs text-zinc-100 focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="github-branch-input"
                        className="mb-1 block text-xs font-medium text-zinc-400"
                      >
                        Nhánh (branch)
                      </label>
                      <input
                        id="github-branch-input"
                        type="text"
                        value={githubBranchInput}
                        onChange={(e) => setGithubBranchInput(e.target.value)}
                        placeholder="main"
                        className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 font-mono text-xs text-zinc-100 focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <label
                        htmlFor="github-token-input"
                        className="flex items-center gap-1.5 text-xs font-medium text-zinc-400"
                      >
                        <KeyRound className="h-3.5 w-3.5" />
                        <span>GitHub Token cho repo Private (chỉ cần quyền Contents: Read-only)</span>
                      </label>
                      {githubStatus?.hasToken && (
                        <span className="text-[11px] font-medium text-emerald-400">
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
                          className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-950 pl-3 pr-9 font-mono text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowGithubToken((v) => !v)}
                          aria-label={showGithubToken ? 'Ẩn token' : 'Hiện token'}
                          className="absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
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
                          className="h-9 shrink-0 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-xs font-medium text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
                        >
                          {isSavingGithubConfig ? 'Đang lưu...' : 'Lưu cấu hình'}
                        </button>
                        {githubStatus?.tokenSource === 'saved' && (
                          <button
                            type="button"
                            disabled={isSavingGithubConfig}
                            onClick={() => void handleSaveGithubConfig(true)}
                            className="h-9 shrink-0 rounded-lg border border-rose-900/70 px-2.5 text-xs font-medium text-rose-300 hover:bg-rose-950/40 disabled:opacity-50"
                          >
                            Xóa token
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50/70 px-3.5 py-3 text-xs dark:border-zinc-800 dark:bg-zinc-900/40">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-zinc-300">
                    {githubRepoInput || githubStatus?.repo || 'tuananh566/Image-Library'} ·{' '}
                    {githubBranchInput || githubStatus?.branch || 'main'}
                  </span>
                  {githubStatus && (
                    <span className="text-zinc-400">
                      Đang bảo vệ: {githubStatus.preservedData.images} ảnh ·{' '}
                      {githubStatus.preservedData.categories} danh mục ·{' '}
                      {githubStatus.preservedData.orders} đơn hàng ·{' '}
                      {githubStatus.preservedData.devices} thiết bị
                    </span>
                  )}
                </div>

                {githubStatus?.currentCommit && (
                  <p className="mt-2 text-zinc-400">
                    Phiên bản hiện tại:{' '}
                    <code className="font-mono text-zinc-200">
                      {githubStatus.currentCommit.shortSha}
                    </code>
                    {githubStatus.currentCommit.message
                      ? ` — ${githubStatus.currentCommit.message}`
                      : ''}
                  </p>
                )}

                {githubStatus?.latestCommit && (
                  <p className="mt-1 text-zinc-400">
                    Mới nhất trên GitHub:{' '}
                    <code className="font-mono text-blue-300">
                      {githubStatus.latestCommit.shortSha}
                    </code>
                    {githubStatus.latestCommit.message
                      ? ` — ${githubStatus.latestCommit.message}`
                      : ''}
                  </p>
                )}
              </div>

              {githubError && (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-900/70 bg-rose-950/40 px-3.5 py-2.5 text-xs text-rose-200">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                  <span>{githubError}</span>
                </div>
              )}

              {githubResult && (
                <div className="mt-3 space-y-2 rounded-lg border border-emerald-900/70 bg-emerald-950/40 px-3.5 py-3 text-xs text-emerald-200">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    <div className="space-y-1">
                      <p className="font-semibold">
                        Đã cập nhật thành công lên bản{' '}
                        <code className="font-mono">{githubResult.commit.shortSha}</code>
                        {githubResult.commit.message ? ` (${githubResult.commit.message})` : ''}.
                      </p>
                      <p className="text-emerald-300/90">
                        Dữ liệu giữ nguyên: {githubResult.preservedData.images} ảnh,{' '}
                        {githubResult.preservedData.categories} danh mục,{' '}
                        {githubResult.preservedData.orders} đơn hàng và{' '}
                        {githubResult.preservedData.devices} thiết bị quen thuộc.
                      </p>
                      {githubResult.serverChanged && (
                        <p className="text-amber-300">
                          Lưu ý: Tệp máy chủ (server.ts) vừa được cập nhật — nếu chạy production, hãy khởi động lại tiến trình Node để áp dụng thay đổi backend.
                        </p>
                      )}
                    </div>
                  </div>
                  <div>
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
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-300 px-3 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
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
          )}

          {/* Server Restart Section (Admin only) */}
          {isAdmin && (
            <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-display text-base font-semibold text-zinc-950 dark:text-zinc-50">
                    Khởi động lại Server
                  </h2>
                  <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                    Khởi động lại tiến trình Node.js để áp dụng thay đổi backend hoặc làm mới kết nối server. Dữ liệu ảnh, danh mục và đơn hàng vẫn được giữ nguyên.
                  </p>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {confirmRestartServer && !isRestartingServer ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setConfirmRestartServer(false)}
                        className="inline-flex h-9 items-center rounded-lg border border-zinc-300 px-3 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                      >
                        Hủy
                      </button>
                      <button
                        type="button"
                        disabled={isUpdatingGithub}
                        onClick={() => void handleRestartServer()}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-amber-600 px-3.5 text-xs font-semibold text-white transition-colors hover:bg-amber-500 disabled:opacity-50"
                      >
                        <Power className="h-3.5 w-3.5" />
                        <span>Xác nhận Restart</span>
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
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-amber-800/70 bg-amber-950/30 px-3.5 text-xs font-semibold text-amber-300 transition-colors hover:bg-amber-950/60 disabled:opacity-50"
                    >
                      <RotateCw
                        className={`h-3.5 w-3.5 ${isRestartingServer ? 'animate-spin' : ''}`}
                      />
                      <span>
                        {isRestartingServer ? 'Đang khởi động lại server...' : 'Restart Server'}
                      </span>
                    </button>
                  )}
                </div>
              </div>

              {restartNotice && (
                <div
                  className={`mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3.5 py-2.5 text-xs ${
                    restartNotice.type === 'success'
                      ? 'border-emerald-900/70 bg-emerald-950/40 text-emerald-200'
                      : restartNotice.type === 'warning'
                        ? 'border-amber-900/70 bg-amber-950/40 text-amber-200'
                        : 'border-rose-900/70 bg-rose-950/40 text-rose-200'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {restartNotice.type === 'success' ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    ) : (
                      <AlertCircle
                        className={`mt-0.5 h-4 w-4 shrink-0 ${
                          restartNotice.type === 'warning' ? 'text-amber-400' : 'text-rose-400'
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
            </section>
          )}

          {/* Server Activity Logs Section (Super-Admin `tuananh` mode only) */}
          {isSuperAdmin && (
            <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-base font-semibold text-zinc-950 dark:text-zinc-50">
                      Log hoạt động Server
                    </h2>
                    <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/15 px-2.5 py-0.5 text-xs font-medium text-violet-300">
                      <ScrollText className="h-3.5 w-3.5" />
                      <span>Chế độ tuananh</span>
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                    Theo dõi nhật ký hoạt động thời gian thực của server: xác thực thiết bị, tải/xóa ảnh, đơn hàng, sao lưu JSON, cập nhật GitHub và lỗi hệ thống.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setConfirmClearLogs(false);
                    setIsLogsModalOpen(true);
                  }}
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 text-xs font-semibold text-white transition-colors hover:bg-violet-500"
                >
                  <ScrollText className="h-3.5 w-3.5" />
                  <span>Xem log server</span>
                </button>
              </div>
            </section>
          )}

          {/* Backup & Storage Section (Admin only) */}
          <div className="border-t border-zinc-200 pt-6 dark:border-zinc-800">
            {isAdmin ? (
              <BackupView
                embedded
                stats={stats}
                onExportBackup={onExportBackup}
                onImportBackup={onImportBackup}
                onRestoreSampleVault={onRestoreSampleVault}
                onClearAllData={onClearAllData}
                pendingLocalSync={pendingLocalSync}
                onSyncLocalToServer={onSyncLocalToServer}
              />
            ) : (
              <div className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
                  <Lock className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="font-display text-base font-semibold text-zinc-950 dark:text-zinc-50">
                    Lưu trữ Server, Cập nhật GitHub & Bảo trì
                  </h2>
                  <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                    Phần lưu trữ server, sao lưu JSON, cập nhật từ GitHub và các tác vụ bảo trì dữ liệu yêu cầu quyền Admin. Vui lòng xác thực Admin ở mục trên để truy cập.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Detailed Trusted Devices Modal */}
      {isAdmin && isDevicesModalOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-950/75 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[calc(0.75rem+var(--app-safe-top))] sm:px-4 sm:pb-[max(1rem,env(safe-area-inset-bottom))] sm:pt-[calc(1rem+var(--app-safe-top))]"
          onClick={(e) => {
            e.stopPropagation();
            setIsDevicesModalOpen(false);
            setEditingDeviceId(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="trusted-devices-modal-title"
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl sm:max-h-[min(86vh,calc(100dvh-2rem-var(--app-safe-top)))]"
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-800 px-5 py-4">
              <div className="min-w-0">
                <h2
                  id="trusted-devices-modal-title"
                  className="font-display text-base font-bold text-zinc-50 tabular-nums"
                >
                  Danh sách thiết bị đã tin cậy ({trustedDevices.length})
                </h2>
                <p className="mt-0.5 text-xs text-zinc-400">
                  Xem chi tiết, đổi tên hoặc thu hồi quyền truy cập của từng thiết bị.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  disabled={devicesLoading}
                  onClick={() => void loadDevices()}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 text-xs font-medium text-zinc-200 transition-colors hover:bg-zinc-800 disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${devicesLoading ? 'animate-spin' : ''}`} />
                  <span>{devicesLoading ? 'Đang tải...' : 'Làm mới'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsDevicesModalOpen(false);
                    setEditingDeviceId(null);
                  }}
                  aria-label="Đóng danh sách thiết bị"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-5">
              {trustedDevices.length === 0 ? (
                <p className="py-6 text-center text-sm text-zinc-400">
                  {devicesLoading ? 'Đang tải danh sách thiết bị...' : 'Chưa có thiết bị nào được lưu.'}
                </p>
              ) : (
                trustedDevices.map((dev) => {
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
                      className="flex flex-col justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 px-3.5 py-3 sm:flex-row sm:items-center"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-zinc-300">
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
                                className="h-8 min-w-[160px] flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 text-xs text-zinc-100 focus:border-blue-500 focus:outline-none"
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
                                className="inline-flex h-8 items-center rounded-lg border border-zinc-700 px-2 text-xs text-zinc-300 hover:bg-zinc-800"
                              >
                                Hủy
                              </button>
                            </form>
                          ) : (
                            <>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="truncate text-sm font-medium text-zinc-100">
                                  {displayName}
                                </span>
                                {dev.isCurrent && (
                                  <span className="shrink-0 rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">
                                    Thiết bị này
                                  </span>
                                )}
                              </div>
                              <p className="mt-0.5 text-xs text-zinc-400">
                                {dev.systemInfo && dev.systemInfo !== displayName
                                  ? `${dev.systemInfo} · `
                                  : ''}
                                Hoạt động gần nhất: {lastSeenText}
                              </p>
                              <p className="mt-0.5 text-[11px] text-zinc-500">
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
                            className="inline-flex h-8 items-center gap-1 rounded-lg border border-zinc-700 px-2.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-800"
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
                                  setIsDevicesModalOpen(false);
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
                            className="inline-flex h-8 items-center gap-1 rounded-lg border border-rose-900/70 px-2.5 text-xs font-medium text-rose-300 transition-colors hover:bg-rose-950/50 disabled:opacity-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span>Thu hồi</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Server Activity Logs Modal (`tuananh` mode only) */}
      {isSuperAdmin && isLogsModalOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-950/75 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[calc(0.75rem+var(--app-safe-top))] sm:px-4 sm:pb-[max(1rem,env(safe-area-inset-bottom))] sm:pt-[calc(1rem+var(--app-safe-top))]"
          onClick={(e) => {
            e.stopPropagation();
            setIsLogsModalOpen(false);
            setConfirmClearLogs(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="server-logs-modal-title"
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl sm:max-h-[min(88vh,calc(100dvh-2rem-var(--app-safe-top)))]"
          >
            {/* Header */}
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-zinc-800 px-5 py-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <ScrollText className="h-4 w-4 text-violet-400" />
                  <h2
                    id="server-logs-modal-title"
                    className="font-display text-base font-bold text-zinc-50"
                  >
                    Nhật ký hoạt động Server
                  </h2>
                  {logsMeta && (
                    <span className="rounded-md bg-zinc-800 px-2 py-0.5 font-mono text-[11px] text-zinc-300 tabular-nums">
                      {logsMeta.totalBuffered} dòng · RAM {logsMeta.memoryMb} MB · Uptime{' '}
                      {logsMeta.uptimeSec >= 3600
                        ? `${Math.floor(logsMeta.uptimeSec / 3600)}h${Math.floor((logsMeta.uptimeSec % 3600) / 60)}m`
                        : logsMeta.uptimeSec >= 60
                          ? `${Math.floor(logsMeta.uptimeSec / 60)}m${logsMeta.uptimeSec % 60}s`
                          : `${logsMeta.uptimeSec}s`}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-zinc-400">
                  Hiển thị tối đa 300 hoạt động gần nhất theo bộ lọc hiện tại.
                </p>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAutoRefreshLogs((v) => !v)}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors ${
                    autoRefreshLogs
                      ? 'border-emerald-800/80 bg-emerald-950/50 text-emerald-300'
                      : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:bg-zinc-800'
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      autoRefreshLogs ? 'animate-pulse bg-emerald-400' : 'bg-zinc-500'
                    }`}
                  />
                  <span>Trực tiếp</span>
                </button>

                <button
                  type="button"
                  disabled={logsLoading}
                  onClick={() => void loadServerLogs()}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 text-xs font-medium text-zinc-200 transition-colors hover:bg-zinc-800 disabled:opacity-50"
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
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 text-xs font-medium text-zinc-200 transition-colors hover:bg-zinc-800 disabled:opacity-50"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Tải log</span>
                </button>

                {confirmClearLogs ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setConfirmClearLogs(false)}
                      className="h-8 rounded-lg border border-zinc-700 px-2 text-xs text-zinc-300 hover:bg-zinc-800"
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
                      className="h-8 rounded-lg bg-rose-600 px-2.5 text-xs font-medium text-white hover:bg-rose-500 disabled:opacity-50"
                    >
                      Xóa hết
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmClearLogs(true)}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-rose-900/70 px-2.5 text-xs font-medium text-rose-300 transition-colors hover:bg-rose-950/50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Xóa log</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setIsLogsModalOpen(false);
                    setConfirmClearLogs(false);
                  }}
                  aria-label="Đóng log server"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Filters Bar */}
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-zinc-800 bg-zinc-900/40 px-5 py-3">
              <div className="relative min-w-[180px] flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  value={logSearchQuery}
                  onChange={(e) => setLogSearchQuery(e.target.value)}
                  placeholder="Tìm theo hành động, thiết bị, API, IP..."
                  className="h-8 w-full rounded-lg border border-zinc-700 bg-zinc-950 pl-8 pr-3 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-violet-500 focus:outline-none"
                />
              </div>

              <select
                value={logLevelFilter}
                onChange={(e) => setLogLevelFilter(e.target.value as 'all' | ActivityLogLevel)}
                aria-label="Lọc mức độ log"
                className="h-8 rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 text-xs text-zinc-200 focus:border-violet-500 focus:outline-none"
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
                className="h-8 rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 text-xs text-zinc-200 focus:border-violet-500 focus:outline-none"
              >
                <option value="all">Tất cả nhóm</option>
                <option value="system">Hệ thống</option>
                <option value="device">Thiết bị</option>
                <option value="image">Ảnh mẫu</option>
                <option value="category">Danh mục</option>
                <option value="order">Đơn hàng</option>
                <option value="backup">Sao lưu / Khôi phục</option>
                <option value="github">GitHub</option>
                <option value="http">HTTP khác</option>
              </select>
            </div>

            {/* Log Entries */}
            <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-4">
              {logsError && (
                <div className="mb-3 flex items-start gap-2 rounded-lg border border-rose-900/70 bg-rose-950/40 px-3.5 py-2.5 text-xs text-rose-200">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                  <span>{logsError}</span>
                </div>
              )}

              {serverLogs.length === 0 ? (
                <p className="py-10 text-center text-sm text-zinc-400">
                  {logsLoading ? 'Đang tải nhật ký hoạt động...' : 'Chưa có bản ghi log nào khớp bộ lọc.'}
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
                      ? 'border-rose-900/70 bg-rose-950/25'
                      : entry.level === 'warn'
                        ? 'border-amber-900/60 bg-amber-950/20'
                        : 'border-zinc-800 bg-zinc-900/40';

                  const levelBadge =
                    entry.level === 'error'
                      ? 'bg-rose-500/20 text-rose-300'
                      : entry.level === 'warn'
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'bg-emerald-500/15 text-emerald-300';

                  return (
                    <div
                      key={entry.id}
                      className={`rounded-xl border px-3.5 py-2.5 text-xs ${levelStyle}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <span
                            className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase ${levelBadge}`}
                          >
                            {entry.level}
                          </span>
                          <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300">
                            {entry.category}
                          </span>
                          <span className="font-medium text-zinc-100">{entry.action}</span>
                        </div>
                        <span className="shrink-0 font-mono text-[11px] text-zinc-400 tabular-nums">
                          {timeText}
                        </span>
                      </div>

                      {(entry.detail || entry.deviceName || entry.ip) && (
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[11px] text-zinc-400">
                          {entry.detail && <span className="break-all">{entry.detail}</span>}
                          {entry.deviceName && (
                            <span className="text-blue-300">Thiết bị: {entry.deviceName}</span>
                          )}
                          {entry.ip && <span className="text-zinc-500">IP: {entry.ip}</span>}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
