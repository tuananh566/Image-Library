import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  GitBranch,
  KeyRound,
  Laptop,
  Lock,
  RefreshCw,
  RotateCw,
  Settings,
  ShieldCheck,
  Smartphone,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  fetchTrustedDevices,
  logoutCurrentDevice,
  revokeTrustedDevice,
  type TrustedDeviceInfo,
} from '../lib/deviceAuth';
import {
  fetchGithubUpdateStatus,
  saveGithubConfig,
  triggerGithubUpdate,
  type GithubUpdateResult,
  type GithubUpdateStatusResponse,
} from '../lib/serverVault';
import type { StorageStats } from '../types/vault';
import { BackupView } from './BackupView';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isAdmin: boolean;
  adminExpiresAt?: number | null;
  onAuthenticateAdmin: (password: string) => boolean;
  onLogoutAdmin: () => void;
  stats: StorageStats;
  onExportBackup: () => Promise<void>;
  onImportBackup: (
    file: File,
    mode: 'merge' | 'replace'
  ) => Promise<{
    importedCategories: number;
    importedImages: number;
  }>;
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

  useEffect(() => {
    if (!isOpen) return;
    setAdminPassword('');
    setShowPassword(false);
    setAuthError(null);
    setNowMs(Date.now());
    setGithubError(null);
    if (isAdmin) {
      void loadDevices();
      void loadGithubStatus();
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isAdmin, loadDevices, loadGithubStatus, onClose]);

  useEffect(() => {
    if (!isOpen || !isAdmin || !adminExpiresAt) return;
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/60 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950"
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
                          adminExpiresAt
                            ? ` (tự khóa lại sau ${Math.max(
                                1,
                                Math.ceil((adminExpiresAt - nowMs) / 60_000)
                              )} phút)`
                            : ''
                        }.`
                      : 'Mặc định thiết bị chỉ có quyền xem. Nhập mật khẩu Admin để mở khóa trong 1 tiếng.'}
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
                  Các thiết bị mới truy cập lần đầu đều phải nhập mã xác nhận để được ghi nhớ.
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

            {isAdmin && (
              <div className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
                <div className="mb-2.5 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Danh sách thiết bị đã tin cậy ({trustedDevices.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => void loadDevices()}
                    className="text-xs font-medium text-blue-400 hover:text-blue-300"
                  >
                    {devicesLoading ? 'Đang tải...' : 'Làm mới'}
                  </button>
                </div>

                {trustedDevices.length === 0 ? (
                  <p className="text-xs text-zinc-500">Chưa có thiết bị nào được lưu.</p>
                ) : (
                  <div className="space-y-2">
                    {trustedDevices.map((dev) => {
                      const isMobile = /iPhone|iPad|Android/i.test(dev.label);
                      const lastSeenText = new Intl.DateTimeFormat('vi-VN', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      }).format(new Date(dev.lastSeenAt));
                      return (
                        <div
                          key={dev.id}
                          className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2.5"
                        >
                          <div className="flex min-w-0 items-center gap-2.5">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-zinc-300">
                              {isMobile ? (
                                <Smartphone className="h-4 w-4" />
                              ) : (
                                <Laptop className="h-4 w-4" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="truncate text-sm font-medium text-zinc-100">
                                  {dev.label}
                                </span>
                                {dev.isCurrent && (
                                  <span className="shrink-0 rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">
                                    Thiết bị này
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-zinc-400">
                                Hoạt động gần nhất: {lastSeenText}
                              </p>
                            </div>
                          </div>

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
                            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-rose-900/70 px-2.5 text-xs font-medium text-rose-300 transition-colors hover:bg-rose-950/50 disabled:opacity-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span>Thu hồi</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
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
                  disabled={isCheckingGithub || isUpdatingGithub}
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
                  disabled={isUpdatingGithub || isCheckingGithub}
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
    </div>
  );
}
