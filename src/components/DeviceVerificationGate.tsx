import { Eye, EyeOff, Laptop, ShieldAlert, ShieldCheck, Smartphone } from 'lucide-react';
import { useState } from 'react';
import { verifyNewDevice } from '../lib/deviceAuth';

interface DeviceVerificationGateProps {
  detectedLabel: string;
  reason?: string;
  onVerified: () => void;
}

export function DeviceVerificationGate({
  detectedLabel,
  reason,
  onVerified,
}: DeviceVerificationGateProps) {
  const [code, setCode] = useState('');
  const [deviceLabel, setDeviceLabel] = useState(detectedLabel || '');
  const [showCode, setShowCode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isMobileLabel = /iPhone|iPad|Android/i.test(detectedLabel);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      await verifyNewDevice(code, deviceLabel || detectedLabel);
      onVerified();
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Mã xác nhận không đúng. Vui lòng thử lại.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-zinc-950 p-4 text-zinc-100">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/75 p-6 shadow-2xl backdrop-blur-xl sm:p-7">
        <div className="mb-5 flex items-start gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/15 text-amber-300">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-lg font-bold tracking-tight text-zinc-50">
              {reason === 'revoked_or_unknown'
                ? 'Thiết bị cần xác nhận lại'
                : 'Phát hiện thiết bị mới'}
            </h1>
            <p className="mt-1 text-sm leading-relaxed text-zinc-400">
              Thiết bị này chưa được nhận diện là thiết bị quen thuộc. Nhập mã xác nhận để mở khóa và lưu tin cậy thiết bị.
            </p>
          </div>
        </div>

        {/* Auto-detected device card */}
        <div className="mb-5 flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950/80 px-3.5 py-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-blue-400">
            {isMobileLabel ? (
              <Smartphone className="h-4 w-4" />
            ) : (
              <Laptop className="h-4 w-4" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
              Thiết bị đang truy cập
            </p>
            <p className="truncate text-sm font-semibold text-zinc-100">
              {detectedLabel || 'Thiết bị chưa xác định'}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="device-verify-code"
              className="mb-1.5 block text-xs font-semibold text-zinc-300"
            >
              Mã xác nhận thiết bị <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <input
                id="device-verify-code"
                type={showCode ? 'text' : 'password'}
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  if (errorMsg) setErrorMsg(null);
                }}
                placeholder="Nhập mã xác nhận..."
                className="tabular-nums h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950 pl-3.5 pr-11 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowCode((v) => !v)}
                aria-label={showCode ? 'Ẩn mã xác nhận' : 'Hiện mã xác nhận'}
                className="absolute right-2.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              >
                {showCode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <label
              htmlFor="device-verify-label"
              className="mb-1.5 block text-xs font-semibold text-zinc-300"
            >
              Tên gợi nhớ cho thiết bị (tùy chọn)
            </label>
            <input
              id="device-verify-label"
              type="text"
              maxLength={60}
              value={deviceLabel}
              onChange={(e) => setDeviceLabel(e.target.value)}
              placeholder={detectedLabel || 'Ví dụ: Điện thoại tiệm bánh'}
              className="h-10 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none"
            />
          </div>

          {errorMsg && (
            <p className="rounded-xl border border-rose-900/60 bg-rose-950/40 px-3.5 py-2 text-xs font-medium text-rose-300">
              {errorMsg}
            </p>
          )}

          <button
            type="submit"
            disabled={!code.trim() || isSubmitting}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ShieldCheck className="h-4 w-4" />
            <span>{isSubmitting ? 'Đang xác nhận...' : 'Xác nhận thiết bị quen thuộc'}</span>
          </button>
        </form>
      </div>
    </div>
  );
}
