import { Download, HardDrive, RotateCcw, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { formatFileSize } from '../lib/imageProcessor';
import type { BackupImportProgress, BackupImportResult } from '../lib/serverVault';
import type { StorageStats } from '../types/vault';

interface BackupViewProps {
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
  embedded?: boolean;
}

export function BackupView({
  stats,
  onExportBackup,
  onImportBackup,
  onRestoreSampleVault,
  onClearAllData,
  pendingLocalSync,
  onSyncLocalToServer,
  embedded = false,
}: BackupViewProps) {
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusKind, setStatusKind] = useState<'info' | 'error'>('info');
  const [importProgress, setImportProgress] = useState<BackupImportProgress | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const handleSyncLocal = async () => {
    if (!onSyncLocalToServer) return;
    setIsBusy(true);
    setStatusMessage(null);
    setStatusKind('info');
    try {
      const res = await onSyncLocalToServer();
      setStatusMessage(
        `Đã đồng bộ ${res.syncedImages} ảnh và ${res.syncedCategories} danh mục từ trình duyệt này lên server.`
      );
    } catch (err) {
      setStatusKind('error');
      setStatusMessage(
        err instanceof Error && err.message
          ? `Lỗi đồng bộ: ${err.message}`
          : 'Có lỗi khi đồng bộ dữ liệu cục bộ lên server.'
      );
    } finally {
      setIsBusy(false);
    }
  };

  const handleExport = async () => {
    setIsBusy(true);
    setStatusKind('info');
    setStatusMessage('Đang đóng gói và tải xuống tệp sao lưu JSON...');
    try {
      await onExportBackup();
      setStatusMessage('Đã xuất tệp sao lưu JSON xuống máy tính của bạn.');
    } catch (err) {
      setStatusKind('error');
      setStatusMessage(
        err instanceof Error && err.message
          ? `Có lỗi khi tạo tệp sao lưu: ${err.message}`
          : 'Có lỗi khi tạo tệp sao lưu.'
      );
    } finally {
      setIsBusy(false);
    }
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsBusy(true);
    setStatusKind('info');
    setStatusMessage(null);
    setImportProgress({ phase: 'reading', importedImages: 0, readPercent: 0 });
    try {
      const res = await onImportBackup(file, importMode, (progress) => {
        setImportProgress(progress);
      });
      const orderPart =
        res.importedOrders && res.importedOrders > 0
          ? ` và ${res.importedOrders} đơn hàng`
          : '';
      setStatusMessage(
        `Đã khôi phục ${res.importedImages} ảnh mẫu, ${res.importedCategories} danh mục${orderPart}.`
      );
    } catch (err) {
      setStatusKind('error');
      const detail = err instanceof Error ? err.message : '';
      setStatusMessage(
        detail
          ? `Không thể nhập tệp sao lưu: ${detail}`
          : 'Tệp sao lưu không hợp lệ hoặc bị hỏng.'
      );
    } finally {
      setImportProgress(null);
      setIsBusy(false);
      e.target.value = '';
    }
  };

  const handleRestoreSamples = async () => {
    setIsBusy(true);
    setStatusKind('info');
    setStatusMessage(null);
    try {
      await onRestoreSampleVault();
      setStatusMessage('Đã nạp lại bộ ảnh mẫu mặc định vào kho cục bộ.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleClearAll = async () => {
    setIsBusy(true);
    setStatusKind('info');
    setStatusMessage(null);
    try {
      await onClearAllData();
      setConfirmClear(false);
      setStatusMessage('Đã xóa toàn bộ ảnh và danh mục khỏi bộ nhớ cục bộ.');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className={embedded ? 'space-y-5' : 'mx-auto max-w-4xl px-4 py-8 sm:px-6 space-y-6'}>
      <div>
        <h2
          className={
            embedded
              ? 'font-display text-base font-semibold text-zinc-950 dark:text-zinc-50'
              : 'font-display text-2xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50'
          }
        >
          Lưu trữ Server & Sao lưu
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Toàn bộ ảnh gốc, danh mục và ghi chú được lưu trực tiếp trên server của bạn để mọi thiết bị truy cập cùng đồng bộ theo thời gian thực.
        </p>
      </div>

      {importProgress && (
        <div className="space-y-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-100">
          <div className="flex items-center justify-between gap-2 text-xs font-medium">
            <span>
              {importProgress.phase === 'committing'
                ? `Đang lưu ${importProgress.importedImages} ảnh vào thư viện...`
                : `Đang đọc & khôi phục dữ liệu (${importProgress.importedImages} ảnh đã tải lên)...`}
            </span>
            <span className="tabular-nums">{importProgress.readPercent}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-blue-200 dark:bg-blue-900">
            <div
              className="h-full bg-blue-600 transition-all duration-200 dark:bg-blue-400"
              style={{ width: `${Math.max(4, importProgress.readPercent)}%` }}
            />
          </div>
        </div>
      )}

      {statusMessage && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm font-medium ${
            statusKind === 'error'
              ? 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-200'
              : 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-200'
          }`}
        >
          {statusMessage}
        </div>
      )}

      {onSyncLocalToServer &&
        pendingLocalSync &&
        (pendingLocalSync.images > 0 || pendingLocalSync.categories > 0) && (
          <div className="flex flex-col gap-3 rounded-xl border border-blue-200 bg-blue-50/80 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-blue-900 dark:bg-blue-950/40">
            <div>
              <p className="text-sm font-semibold text-blue-950 dark:text-blue-100">
                Có dữ liệu cũ lưu trong trình duyệt này chưa lên server
              </p>
              <p className="mt-0.5 text-xs text-blue-800 dark:text-blue-300">
                Phát hiện {pendingLocalSync.images} ảnh và {pendingLocalSync.categories} danh mục cục bộ trên thiết bị này.
              </p>
            </div>
            <button
              type="button"
              disabled={isBusy}
              onClick={handleSyncLocal}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>Đồng bộ lên server</span>
            </button>
          </div>
        )}

      {/* Storage Metrics Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Ảnh mẫu đã lưu
          </p>
          <p className="mt-2 font-display text-2xl font-bold tabular-nums text-zinc-950 dark:text-zinc-50">
            {stats.imageCount}
          </p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Trong {stats.categoryCount} danh mục
          </p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Dung lượng ảnh gốc
          </p>
          <p className="mt-2 font-display text-2xl font-bold tabular-nums text-zinc-950 dark:text-zinc-50">
            {formatFileSize(stats.totalBytes)}
          </p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Lưu tập trung trên server
          </p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Phạm vi truy cập
            </p>
            <HardDrive className="h-4 w-4 text-zinc-400" />
          </div>
          <p className="mt-2 font-display text-xl font-bold text-zinc-950 dark:text-zinc-50">
            Đa thiết bị
          </p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Mọi thiết bị truy cập web đều đồng bộ
          </p>
        </div>
      </div>

      {/* Export & Import Cards */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <section className="flex flex-col justify-between rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <div>
            <div className="mb-3 flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
              <ShieldCheck className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <h2 className="font-display text-base font-semibold">
                Xuất tệp sao lưu (.json)
              </h2>
            </div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Đóng gói toàn bộ ảnh, danh mục và ghi chú thành một tệp sao lưu duy nhất để lưu giữ an toàn trên ổ cứng hoặc chuyển sang máy tính khác.
            </p>
          </div>
          <div className="mt-5">
            <button
              type="button"
              disabled={isBusy || stats.imageCount === 0}
              onClick={handleExport}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200"
            >
              <Download className="h-4 w-4" />
              <span>Tải xuống bản sao lưu</span>
            </button>
          </div>
        </section>

        <section className="flex flex-col justify-between rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <div>
            <div className="mb-3 flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
              <Upload className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <h2 className="font-display text-base font-semibold">
                Khôi phục từ tệp sao lưu
              </h2>
            </div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Chọn chế độ gộp thêm vào thư viện hiện tại hoặc thay thế hoàn toàn kho dữ liệu cục bộ bằng tệp sao lưu <code className="font-mono text-xs">.json</code>.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setImportMode('merge')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                  importMode === 'merge'
                    ? 'bg-blue-600 text-white'
                    : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300'
                }`}
              >
                Gộp thêm
              </button>
              <button
                type="button"
                onClick={() => setImportMode('replace')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                  importMode === 'replace'
                    ? 'bg-blue-600 text-white'
                    : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300'
                }`}
              >
                Ghi đè toàn bộ
              </button>
            </div>
          </div>

          <div className="mt-5">
            <input
              ref={importInputRef}
              type="file"
              accept="application/json,.json"
              onChange={handleFileImport}
              className="hidden"
            />
            <button
              type="button"
              disabled={isBusy}
              onClick={() => importInputRef.current?.click()}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              <Upload className="h-4 w-4" />
              <span>Chọn tệp JSON để nhập</span>
            </button>
          </div>
        </section>
      </div>

      {/* Maintenance Actions */}
      <section className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800 dark:bg-zinc-950">
        <div>
          <h2 className="font-display text-sm font-semibold text-zinc-950 dark:text-zinc-100">
            Tác vụ bảo trì dữ liệu server
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            Nạp lại bộ ảnh mẫu tham khảo ban đầu hoặc dọn trống hoàn toàn thư viện trên server.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={isBusy}
            onClick={handleRestoreSamples}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-300 px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Nạp lại ảnh mẫu</span>
          </button>

          {confirmClear ? (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-rose-600 dark:text-rose-400">
                Xóa hết toàn bộ?
              </span>
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="h-9 rounded-lg border border-zinc-200 px-3 text-xs font-medium dark:border-zinc-700"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={handleClearAll}
                className="h-9 rounded-lg bg-rose-600 px-3 text-xs font-medium text-white hover:bg-rose-700"
              >
                Xác nhận xóa
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={isBusy || (stats.imageCount === 0 && stats.categoryCount === 0)}
              onClick={() => setConfirmClear(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-rose-200 px-3 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950/30"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Xóa toàn bộ kho</span>
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
