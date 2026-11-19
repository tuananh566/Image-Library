import { Eye, EyeOff, Laptop, Lock, Settings, ShieldCheck, Smartphone, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  fetchTrustedDevices,
  logoutCurrentDevice,
  revokeTrustedDevice,
  type TrustedDeviceInfo,
} from '../lib/deviceAuth';
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

  useEffect(() => {
    if (!isOpen) return;
    setAdminPassword('');
    setShowPassword(false);
    setAuthError(null);
    setNowMs(Date.now());
    if (isAdmin) {
      void loadDevices();
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isAdmin, loadDevices, onClose]);

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
                        inputMode="numeric"
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
                    Lưu trữ Server & Bảo trì dữ liệu
                  </h2>
                  <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                    Phần lưu trữ server, sao lưu JSON và các tác vụ bảo trì dữ liệu yêu cầu quyền Admin. Vui lòng xác thực Admin ở mục trên để truy cập.
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
