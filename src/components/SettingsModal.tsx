import { Eye, EyeOff, Lock, Settings, ShieldCheck, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { StorageStats } from '../types/vault';
import { BackupView } from './BackupView';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isAdmin: boolean;
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

  useEffect(() => {
    if (!isOpen) return;
    setAdminPassword('');
    setShowPassword(false);
    setAuthError(null);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

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
                      ? 'Thiết bị này đang có quyền Admin và được phép thêm ảnh mẫu mới.'
                      : 'Mặc định thiết bị chỉ có quyền xem. Nhập mật khẩu Admin để bật nút thêm ảnh (+).'}
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
