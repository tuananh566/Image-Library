import {
  Calendar,
  Camera,
  Check,
  CheckCircle2,
  Clock,
  ImageIcon,
  ImagePlus,
  Search,
  ShoppingBag,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { generateId, isImageFile, stripFileExtension } from '../lib/imageProcessor';
import { formatDateKeyDisplay, getLocalDateKey, shiftDateKey } from '../lib/orderFilters';
import type { CreateServerOrderInput, UpdateServerOrderInput } from '../lib/serverVault';
import type { Category, OrderRecord, OrderSampleImage, VaultImageView } from '../types/vault';

interface OrderCustomFile {
  localId: string;
  file: File;
  previewUrl: string;
  title: string;
}

interface OrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  images: VaultImageView[];
  categories: Category[];
  presetImage?: VaultImageView | null;
  editingOrder?: OrderRecord | null;
  onCreateOrder: (input: CreateServerOrderInput) => Promise<void>;
  onUpdateOrder?: (orderId: string, input: UpdateServerOrderInput) => Promise<void>;
  onCreatedSuccess?: () => void;
}

function formatVndDigits(rawDigits: string): string {
  const digits = rawDigits.replace(/\D/g, '');
  if (!digits) return '';
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function getCurrentLocalClock(date: Date = new Date()): string {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function getDefaultPickupTime(date: Date = new Date()): string {
  return `${getLocalDateKey(date)}T${getCurrentLocalClock(date)}`;
}

function splitPickupTime(raw: string): { date: string; clock: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { date: '', clock: '' };
  const match = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/.exec(trimmed);
  if (match) {
    return { date: match[1], clock: match[2] || '' };
  }
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    const hh = String(parsed.getHours()).padStart(2, '0');
    const mm = String(parsed.getMinutes()).padStart(2, '0');
    return { date: getLocalDateKey(parsed), clock: `${hh}:${mm}` };
  }
  return { date: '', clock: '' };
}

function combinePickupTime(date: string, clock: string): string {
  if (!date && !clock) return '';
  const now = new Date();
  const targetDate = date || getLocalDateKey(now);
  const targetClock = clock || getCurrentLocalClock(now);
  return `${targetDate}T${targetClock}`;
}

export function OrderModal({
  isOpen,
  onClose,
  images,
  categories,
  presetImage,
  editingOrder,
  onCreateOrder,
  onUpdateOrder,
  onCreatedSuccess,
}: OrderModalProps) {
  const fileInputId = useId();
  const cameraInputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [productName, setProductName] = useState('');
  const [productDescription, setProductDescription] = useState('');
  const [pickupTime, setPickupTime] = useState('');
  const [priceDigits, setPriceDigits] = useState('');
  const [depositDigits, setDepositDigits] = useState('');
  const [isReady, setIsReady] = useState(false);
  const [isReceived, setIsReceived] = useState(false);

  const [selectedLibraryIds, setSelectedLibraryIds] = useState<string[]>([]);
  const [keptCustomImages, setKeptCustomImages] = useState<OrderSampleImage[]>([]);
  const [customFiles, setCustomFiles] = useState<OrderCustomFile[]>([]);
  const [showLibraryPicker, setShowLibraryPicker] = useState(false);
  const [libraryQuery, setLibraryQuery] = useState('');
  const [libraryCatFilter, setLibraryCatFilter] = useState<string>('all');

  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setIsTouchDevice(
      window.matchMedia?.('(pointer: coarse)').matches ||
        'ontouchstart' in window ||
        navigator.maxTouchPoints > 0
    );
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    if (editingOrder) {
      setCustomerName(editingOrder.customerName || '');
      setCustomerPhone(editingOrder.customerPhone || '');
      setProductName(editingOrder.productName || '');
      setProductDescription(editingOrder.productDescription || '');
      setPickupTime(editingOrder.pickupTime || '');
      setPriceDigits(editingOrder.price > 0 ? String(Math.round(editingOrder.price)) : '');
      setDepositDigits(
        editingOrder.depositAmount > 0 ? String(Math.round(editingOrder.depositAmount)) : ''
      );
      setIsReady(Boolean(editingOrder.isReady));
      setIsReceived(Boolean(editingOrder.isReceived));
      setSelectedLibraryIds(
        editingOrder.sampleImages
          .map((img) => img.sourceImageId)
          .filter((id): id is string => Boolean(id))
      );
      setKeptCustomImages(editingOrder.sampleImages.filter((img) => !img.sourceImageId));
    } else {
      setCustomerName('');
      setCustomerPhone('');
      setProductName(presetImage ? presetImage.title : '');
      setProductDescription(presetImage?.notes || '');
      setPickupTime(getDefaultPickupTime());
      setPriceDigits('');
      setDepositDigits('');
      setIsReady(false);
      setIsReceived(false);
      setSelectedLibraryIds(presetImage ? [presetImage.id] : []);
      setKeptCustomImages([]);
    }
    setCustomFiles((prev) => {
      prev.forEach((f) => URL.revokeObjectURL(f.previewUrl));
      return [];
    });
    setShowLibraryPicker(false);
    setLibraryQuery('');
    setLibraryCatFilter('all');
    setErrorMsg(null);
  }, [isOpen, presetImage, editingOrder]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const filteredLibraryImages = useMemo(() => {
    const q = libraryQuery.trim().toLowerCase();
    return images.filter((img) => {
      if (libraryCatFilter !== 'all' && img.categoryId !== libraryCatFilter) {
        return false;
      }
      if (!q) return true;
      return (
        img.title.toLowerCase().includes(q) ||
        img.notes.toLowerCase().includes(q) ||
        img.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [images, libraryCatFilter, libraryQuery]);

  const selectedLibraryImages = useMemo(() => {
    const map = new Map(images.map((i) => [i.id, i]));
    return selectedLibraryIds
      .map((id) => map.get(id))
      .filter((i): i is VaultImageView => Boolean(i));
  }, [images, selectedLibraryIds]);

  if (!isOpen) return null;

  const toggleLibraryImage = (imageId: string) => {
    setSelectedLibraryIds((prev) =>
      prev.includes(imageId) ? prev.filter((id) => id !== imageId) : [...prev, imageId]
    );
  };

  const handleAddFiles = (files: File[]) => {
    const valid = files.filter((f) => isImageFile(f));
    if (valid.length === 0) {
      setErrorMsg('Vui lòng chọn tệp hình ảnh hợp lệ (JPG, PNG, WebP, HEIC).');
      return;
    }
    setErrorMsg(null);
    const mapped: OrderCustomFile[] = valid.map((file) => ({
      localId: generateId(),
      file,
      previewUrl: URL.createObjectURL(file),
      title: stripFileExtension(file.name) || 'Ảnh mẫu',
    }));
    setCustomFiles((prev) => [...prev, ...mapped]);
  };

  const removeCustomFile = (localId: string) => {
    setCustomFiles((prev) => {
      const target = prev.find((f) => f.localId === localId);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((f) => f.localId !== localId);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;

    const cleanName = customerName.trim();
    const cleanPhone = customerPhone.trim();
    const cleanProduct = productName.trim();
    const cleanDesc = productDescription.trim();
    const cleanPickup = pickupTime.trim();
    const numericPrice = Number(priceDigits.replace(/\D/g, '')) || 0;
    const numericDeposit = Number(depositDigits.replace(/\D/g, '')) || 0;

    if (!cleanName) {
      setErrorMsg('Vui lòng nhập tên khách hàng.');
      return;
    }
    if (!cleanPhone) {
      setErrorMsg('Vui lòng nhập số điện thoại.');
      return;
    }
    if (!cleanProduct) {
      setErrorMsg('Vui lòng nhập tên sản phẩm.');
      return;
    }

    setIsSaving(true);
    setErrorMsg(null);
    try {
      const basePayload: CreateServerOrderInput = {
        customerName: cleanName,
        customerPhone: cleanPhone,
        productName: cleanProduct,
        productDescription: cleanDesc,
        pickupTime: cleanPickup,
        price: numericPrice,
        depositAmount: numericDeposit,
        libraryImages: selectedLibraryImages.map((img) => ({
          imageId: img.id,
          title: img.title,
        })),
        customFiles: customFiles.map((cf) => cf.file),
      };

      if (editingOrder && onUpdateOrder) {
        await onUpdateOrder(editingOrder.id, {
          ...basePayload,
          isReady,
          isReceived,
          keepCustomImageIds: keptCustomImages.map((img) => img.id),
        });
      } else {
        await onCreateOrder(basePayload);
      }

      customFiles.forEach((f) => URL.revokeObjectURL(f.previewUrl));
      onClose();
      if (!editingOrder) {
        onCreatedSuccess?.();
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : editingOrder
            ? 'Không thể cập nhật đơn hàng. Vui lòng thử lại.'
            : 'Không thể tạo đơn hàng. Vui lòng thử lại.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const numericPrice = Number(priceDigits.replace(/\D/g, '')) || 0;
  const numericDeposit = Number(depositDigits.replace(/\D/g, '')) || 0;
  const remainingAmount = Math.max(0, numericPrice - numericDeposit);
  const isPaidInFull = numericPrice > 0 && numericDeposit >= numericPrice;
  const totalSampleCount =
    selectedLibraryImages.length + keptCustomImages.length + customFiles.length;

  const { date: pickupDate, clock: pickupClock } = splitPickupTime(pickupTime);
  const todayKey = getLocalDateKey();
  const tomorrowKey = shiftDateKey(todayKey, 1);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/75 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[calc(0.75rem+var(--app-safe-top))] backdrop-blur-xs sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-modal-title"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 text-zinc-100 shadow-2xl sm:max-h-[92vh]"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-4 py-3.5 sm:px-6 sm:py-4">
          <div className="flex items-center gap-2.5">
            <ShoppingBag className="h-5 w-5 text-blue-400" />
            <h2
              id="order-modal-title"
              className="font-display text-lg font-bold tracking-tight text-zinc-50"
            >
              {editingOrder ? (
                <span>
                  Chỉnh sửa đơn hàng ·{' '}
                  <span className="font-mono tabular-nums text-blue-400">
                    {editingOrder.orderCode}
                  </span>
                </span>
              ) : (
                'Tạo đơn hàng mới'
              )}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-zinc-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-6">
            {/* Customer Info */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="order-customer-name"
                  className="mb-1.5 block text-xs font-semibold text-zinc-300"
                >
                  Tên khách hàng <span className="text-rose-400">*</span>
                </label>
                <input
                  id="order-customer-name"
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Ví dụ: Chị Minh Anh"
                  autoFocus
                  className="h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="order-customer-phone"
                  className="mb-1.5 block text-xs font-semibold text-zinc-300"
                >
                  Số điện thoại <span className="text-rose-400">*</span>
                </label>
                <input
                  id="order-customer-phone"
                  type="tel"
                  inputMode="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="Ví dụ: 0912 345 678"
                  className="tabular-nums h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Product Name */}
            <div>
              <label
                htmlFor="order-product-name"
                className="mb-1.5 block text-xs font-semibold text-zinc-300"
              >
                Tên sản phẩm <span className="text-rose-400">*</span>
              </label>
              <input
                id="order-product-name"
                type="text"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="Ví dụ: Bánh kem hoa tươi 2 tầng size 20cm"
                className="h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none"
              />
            </div>

            {/* Pickup Time, Price & Deposit */}
            <div className="space-y-4">
              <div className="min-w-0">
                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                  <span className="block text-xs font-semibold text-zinc-300">
                    Thời gian lấy
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setPickupTime(combinePickupTime(todayKey, pickupClock))
                      }
                      className={`rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                        pickupDate === todayKey
                          ? 'border-blue-500/70 bg-blue-600/20 text-blue-300'
                          : 'border-zinc-700/80 bg-zinc-900 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'
                      }`}
                    >
                      Hôm nay
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setPickupTime(combinePickupTime(tomorrowKey, pickupClock))
                      }
                      className={`rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                        pickupDate === tomorrowKey
                          ? 'border-blue-500/70 bg-blue-600/20 text-blue-300'
                          : 'border-zinc-700/80 bg-zinc-900 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'
                      }`}
                    >
                      Ngày mai
                    </button>
                    {pickupTime && (
                      <button
                        type="button"
                        onClick={() => setPickupTime('')}
                        className="rounded-md px-1.5 py-0.5 text-[11px] font-medium text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-rose-300"
                      >
                        Xóa
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="relative flex h-10 min-w-0 items-center justify-between gap-2 overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm transition-colors focus-within:border-blue-500 hover:border-zinc-600">
                    <span className="flex min-w-0 items-center gap-2">
                      <Calendar className="h-4 w-4 shrink-0 text-zinc-400" />
                      <span
                        className={`tabular-nums truncate ${
                          pickupDate ? 'text-zinc-100' : 'text-zinc-500'
                        }`}
                      >
                        {pickupDate ? formatDateKeyDisplay(pickupDate) : 'Chọn ngày'}
                      </span>
                    </span>
                    <input
                      id="order-pickup-date"
                      type="date"
                      value={pickupDate}
                      aria-label="Chọn ngày lấy hàng"
                      onClick={(e) => {
                        try {
                          (
                            e.currentTarget as HTMLInputElement & {
                              showPicker?: () => void;
                            }
                          ).showPicker?.();
                        } catch {
                          // Ignore browsers that open native picker automatically
                        }
                      }}
                      onChange={(e) => {
                        const nextDate = e.target.value;
                        if (!nextDate) {
                          setPickupTime('');
                          return;
                        }
                        setPickupTime(combinePickupTime(nextDate, pickupClock));
                      }}
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    />
                  </div>

                  <div className="relative flex h-10 min-w-0 items-center justify-between gap-2 overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm transition-colors focus-within:border-blue-500 hover:border-zinc-600">
                    <span className="flex min-w-0 items-center gap-2">
                      <Clock className="h-4 w-4 shrink-0 text-zinc-400" />
                      <span
                        className={`tabular-nums truncate ${
                          pickupClock ? 'text-zinc-100' : 'text-zinc-500'
                        }`}
                      >
                        {pickupClock || 'Chọn giờ'}
                      </span>
                    </span>
                    <input
                      id="order-pickup-time"
                      type="time"
                      value={pickupClock}
                      aria-label="Chọn giờ lấy hàng"
                      onClick={(e) => {
                        try {
                          (
                            e.currentTarget as HTMLInputElement & {
                              showPicker?: () => void;
                            }
                          ).showPicker?.();
                        } catch {
                          // Ignore browsers that open native picker automatically
                        }
                      }}
                      onChange={(e) => {
                        const nextClock = e.target.value;
                        if (!nextClock && !pickupDate) {
                          setPickupTime('');
                          return;
                        }
                        setPickupTime(combinePickupTime(pickupDate, nextClock));
                      }}
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="min-w-0">
                  <label
                    htmlFor="order-product-price"
                    className="mb-1.5 block text-xs font-semibold text-zinc-300"
                  >
                    Giá tiền
                  </label>
                  <div className="relative">
                    <input
                      id="order-product-price"
                      type="text"
                      inputMode="numeric"
                      value={formatVndDigits(priceDigits)}
                      onChange={(e) => setPriceDigits(e.target.value.replace(/\D/g, ''))}
                      placeholder="450.000"
                      className="tabular-nums h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 pl-3 pr-8 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-zinc-400">
                      đ
                    </span>
                  </div>
                </div>

                <div className="min-w-0">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <label
                      htmlFor="order-deposit-amount"
                      className="block text-xs font-semibold text-zinc-300"
                    >
                      Số tiền khách cọc
                    </label>
                    {numericPrice > 0 && !isPaidInFull && (
                      <button
                        type="button"
                        onClick={() => setDepositDigits(String(numericPrice))}
                        className="text-[11px] font-medium text-blue-400 hover:text-blue-300"
                      >
                        Cọc đủ
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      id="order-deposit-amount"
                      type="text"
                      inputMode="numeric"
                      value={formatVndDigits(depositDigits)}
                      onChange={(e) => setDepositDigits(e.target.value.replace(/\D/g, ''))}
                      placeholder="0"
                      className="tabular-nums h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 pl-3 pr-8 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-zinc-400">
                      đ
                    </span>
                  </div>
                </div>
              </div>

              {numericPrice > 0 && (
                <div
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3.5 py-2 text-xs ${
                    isPaidInFull
                      ? 'border-emerald-900/70 bg-emerald-950/35 text-emerald-300'
                      : 'border-amber-900/60 bg-amber-950/30 text-amber-200'
                  }`}
                >
                  {isPaidInFull ? (
                    <span className="inline-flex items-center gap-1.5 font-semibold">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                      <span>Đã trả đủ tiền hàng</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 font-medium">
                      <Clock className="h-4 w-4 shrink-0 text-amber-400" />
                      <span>
                        Còn thiếu:{' '}
                        <strong className="tabular-nums font-semibold text-amber-100">
                          {formatVndDigits(String(remainingAmount))} đ
                        </strong>
                      </span>
                    </span>
                  )}
                  <span className="tabular-nums text-zinc-400">
                    Đã cọc {formatVndDigits(String(numericDeposit || 0)) || '0'} /{' '}
                    {formatVndDigits(String(numericPrice))} đ
                  </span>
                </div>
              )}
            </div>

            {/* Product Description */}
            <div>
              <label
                htmlFor="order-product-description"
                className="mb-1.5 block text-xs font-semibold text-zinc-300"
              >
                Mô tả sản phẩm
              </label>
              <textarea
                id="order-product-description"
                rows={3}
                value={productDescription}
                onChange={(e) => setProductDescription(e.target.value)}
                placeholder="Kích thước, cốt bánh, vị nhân, dòng chữ viết trên bánh, yêu cầu trang trí..."
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none"
              />
            </div>

            {editingOrder && (
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <label className="flex cursor-pointer items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/70 px-3.5 py-2.5 text-xs">
                  <span className="font-semibold text-zinc-200">
                    Bánh đã chuẩn bị sẵn sàng
                  </span>
                  <input
                    type="checkbox"
                    checked={isReady}
                    onChange={(e) => setIsReady(e.target.checked)}
                    className="h-4 w-4 rounded border-zinc-600 bg-zinc-950 text-emerald-500 focus:ring-emerald-500"
                  />
                </label>
                <label className="flex cursor-pointer items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/70 px-3.5 py-2.5 text-xs">
                  <span className="font-semibold text-zinc-200">
                    Khách đã nhận hàng
                  </span>
                  <input
                    type="checkbox"
                    checked={isReceived}
                    onChange={(e) => setIsReceived(e.target.checked)}
                    className="h-4 w-4 rounded border-zinc-600 bg-zinc-950 text-emerald-500 focus:ring-emerald-500"
                  />
                </label>
              </div>
            )}

            {/* Sample Images */}
            <div className="space-y-3 border-t border-zinc-800 pt-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="block text-xs font-semibold text-zinc-200">
                    Ảnh mẫu ({totalSampleCount})
                  </span>
                  <span className="text-xs text-zinc-400">
                    Chọn từ kho ảnh mẫu có sẵn hoặc tải ảnh trực tiếp từ thiết bị.
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowLibraryPicker((v) => !v)}
                    className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      showLibraryPicker
                        ? 'border-blue-500 bg-blue-950/60 text-blue-300'
                        : 'border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800'
                    }`}
                  >
                    <ImageIcon className="h-3.5 w-3.5" />
                    <span>{showLibraryPicker ? 'Ẩn thư viện' : 'Chọn từ thư viện'}</span>
                  </button>

                  <label
                    htmlFor={fileInputId}
                    className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-xs font-medium text-zinc-200 transition-colors hover:bg-zinc-800 whitespace-nowrap shrink-0"
                  >
                    <ImagePlus className="h-3.5 w-3.5" />
                    <span>Tải ảnh lên</span>
                  </label>

                  {isTouchDevice && (
                    <label
                      htmlFor={cameraInputId}
                      className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-xs font-medium text-zinc-200 transition-colors hover:bg-zinc-800 whitespace-nowrap shrink-0"
                    >
                      <Camera className="h-3.5 w-3.5" />
                      <span>Chụp ảnh</span>
                    </label>
                  )}

                  <input
                    id={fileInputId}
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="sr-only"
                    onChange={(e) => {
                      if (e.target.files?.length) {
                        handleAddFiles(Array.from(e.target.files));
                      }
                      e.target.value = '';
                    }}
                  />
                  <input
                    id={cameraInputId}
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="sr-only"
                    onChange={(e) => {
                      if (e.target.files?.length) {
                        handleAddFiles(Array.from(e.target.files));
                      }
                      e.target.value = '';
                    }}
                  />
                </div>
              </div>

              {/* Selected Sample Images Preview */}
              {totalSampleCount > 0 ? (
                <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
                  {selectedLibraryImages.map((img) => (
                    <div
                      key={`lib-${img.id}`}
                      className="group relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900"
                    >
                      <div className="aspect-square w-full overflow-hidden">
                        <img
                          src={img.thumbnailUrl}
                          alt={img.title}
                          referrerPolicy="no-referrer"
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleLibraryImage(img.id)}
                        aria-label={`Bỏ ảnh ${img.title}`}
                        className="absolute right-1.5 top-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-zinc-950/80 text-zinc-200 transition-colors hover:bg-rose-600 hover:text-white"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                      <p className="truncate px-2 py-1 text-[11px] text-zinc-300">
                        {img.title}
                      </p>
                    </div>
                  ))}

                  {keptCustomImages.map((img) => (
                    <div
                      key={`kept-${img.id}`}
                      className="group relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900"
                    >
                      <div className="aspect-square w-full overflow-hidden">
                        <img
                          src={img.thumbnailUrl}
                          alt={img.title}
                          referrerPolicy="no-referrer"
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setKeptCustomImages((prev) => prev.filter((item) => item.id !== img.id))
                        }
                        aria-label={`Bỏ ảnh ${img.title}`}
                        className="absolute right-1.5 top-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-zinc-950/80 text-zinc-200 transition-colors hover:bg-rose-600 hover:text-white"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                      <p className="truncate px-2 py-1 text-[11px] text-zinc-300">
                        {img.title}
                      </p>
                    </div>
                  ))}

                  {customFiles.map((cf) => (
                    <div
                      key={cf.localId}
                      className="group relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900"
                    >
                      <div className="aspect-square w-full overflow-hidden">
                        <img
                          src={cf.previewUrl}
                          alt={cf.title}
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeCustomFile(cf.localId)}
                        aria-label={`Bỏ ảnh ${cf.title}`}
                        className="absolute right-1.5 top-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-zinc-950/80 text-zinc-200 transition-colors hover:bg-rose-600 hover:text-white"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                      <p className="truncate px-2 py-1 text-[11px] text-zinc-300">
                        {cf.title}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/40 px-4 py-5 text-center text-xs text-zinc-400">
                  Chưa chọn ảnh mẫu. Bạn có thể chọn nhanh từ thư viện hoặc tải ảnh từ thiết bị.
                </div>
              )}

              {/* Inline Library Sample Picker */}
              {showLibraryPicker && (
                <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/70 p-3.5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="relative flex-1">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
                      <input
                        type="text"
                        value={libraryQuery}
                        onChange={(e) => setLibraryQuery(e.target.value)}
                        placeholder="Tìm ảnh mẫu theo tên, từ khóa..."
                        className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-950 pl-8 pr-3 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <select
                      value={libraryCatFilter}
                      onChange={(e) => setLibraryCatFilter(e.target.value)}
                      aria-label="Lọc danh mục ảnh mẫu"
                      className="h-9 rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 text-xs text-zinc-100 focus:border-blue-500 focus:outline-none"
                    >
                      <option value="all">Tất cả danh mục</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {filteredLibraryImages.length === 0 ? (
                    <p className="py-4 text-center text-xs text-zinc-400">
                      Không tìm thấy ảnh mẫu nào phù hợp.
                    </p>
                  ) : (
                    <div className="grid max-h-56 grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-4">
                      {filteredLibraryImages.map((img) => {
                        const isPicked = selectedLibraryIds.includes(img.id);
                        return (
                          <button
                            key={img.id}
                            type="button"
                            onClick={() => toggleLibraryImage(img.id)}
                            className={`group relative overflow-hidden rounded-lg border text-left transition-all ${
                              isPicked
                                ? 'border-blue-500 ring-2 ring-blue-500/40'
                                : 'border-zinc-800 hover:border-zinc-600'
                            }`}
                          >
                            <div className="aspect-square w-full overflow-hidden bg-zinc-950">
                              <img
                                src={img.thumbnailUrl}
                                alt={img.title}
                                loading="lazy"
                                referrerPolicy="no-referrer"
                                className="h-full w-full object-cover"
                              />
                            </div>
                            {isPicked && (
                              <span className="absolute right-1.5 top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white shadow">
                                <Check className="h-3 w-3" />
                              </span>
                            )}
                            <p className="truncate bg-zinc-950/90 px-1.5 py-1 text-[11px] text-zinc-200">
                              {img.title}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {errorMsg && (
              <p className="rounded-lg border border-rose-900/60 bg-rose-950/40 px-3 py-2 text-xs font-medium text-rose-300">
                {errorMsg}
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="flex shrink-0 items-center justify-end gap-2.5 border-t border-zinc-800 bg-zinc-950 px-4 py-3.5 sm:px-6 sm:py-4">
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-lg border border-zinc-700 px-4 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-900 whitespace-nowrap"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="h-10 rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap"
            >
              {isSaving
                ? 'Đang lưu...'
                : editingOrder
                  ? 'Lưu thay đổi'
                  : 'Lưu đơn hàng'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
