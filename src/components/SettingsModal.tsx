import { Moon, Settings, Sun, X } from 'lucide-react';
import { useEffect } from 'react';
import type { StorageStats } from '../types/vault';
import { BackupView } from './BackupView';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDark: boolean;
  onSetTheme: (dark: boolean) => void;
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
  isDark,
  onSetTheme,
  stats,
  onExportBackup,
  onImportBackup,
  onRestoreSampleVault,
  onClearAllData,
  pendingLocalSync,
  onSyncLocalToServer,
}: SettingsModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

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
          {/* Theme Section */}
          <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-display text-base font-semibold text-zinc-950 dark:text-zinc-50">
                  Giao diện hiển thị
                </h2>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  Chọn nền sáng hoặc nền tối phù hợp với môi trường làm việc của bạn.
                </p>
              </div>

              <div
                role="group"
                aria-label="Chọn nền sáng hoặc tối"
                className="inline-flex shrink-0 items-center rounded-lg bg-zinc-100 p-1 dark:bg-zinc-900"
              >
                <button
                  type="button"
                  onClick={() => onSetTheme(false)}
                  className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium transition-colors ${
                    !isDark
                      ? 'bg-white text-zinc-950 shadow-xs dark:bg-zinc-800 dark:text-zinc-50'
                      : 'text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100'
                  }`}
                >
                  <Sun className="h-4 w-4" />
                  <span>Nền sáng</span>
                </button>
                <button
                  type="button"
                  onClick={() => onSetTheme(true)}
                  className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium transition-colors ${
                    isDark
                      ? 'bg-white text-zinc-950 shadow-xs dark:bg-zinc-800 dark:text-zinc-50'
                      : 'text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100'
                  }`}
                >
                  <Moon className="h-4 w-4" />
                  <span>Nền tối</span>
                </button>
              </div>
            </div>
          </section>

          {/* Backup & Storage Section */}
          <div className="border-t border-zinc-200 pt-6 dark:border-zinc-800">
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
          </div>
        </div>
      </div>
    </div>
  );
}
