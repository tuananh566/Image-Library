import {
  CalendarClock,
  Check,
  CheckCircle2,
  ClipboardPlus,
  Clock,
  ImageIcon,
  PackageCheck,
  Pencil,
  Phone,
  Search,
  ShoppingBag,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import type { OrderRecord } from '../types/vault';

interface OrdersViewProps {
  orders: OrderRecord[];
  onOpenCreateOrder: () => void;
  onEditOrder: (order: OrderRecord) => void;
  onToggleOrderReady: (order: OrderRecord) => Promise<void>;
  onMarkOrderReceived: (order: OrderRecord) => Promise<void>;
  onDeleteOrder: (orderId: string) => Promise<void>;
}

function formatPriceVnd(price: number): string {
  if (!Number.isFinite(price) || price <= 0) return 'Thỏa thuận';
  return `${new Intl.NumberFormat('vi-VN').format(price)} đ`;
}

function formatDateTime(ts: number): string {
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ts));
}

function formatPickupTime(raw: string): string {
  if (!raw) return '';
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(parsed);
}

function parsePickupMs(raw?: string): number | null {
  if (!raw) return null;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function compareOrdersByNearestPickup(a: OrderRecord, b: OrderRecord, nowMs: number): number {
  const aMs = parsePickupMs(a.pickupTime);
  const bMs = parsePickupMs(b.pickupTime);

  if (aMs === null && bMs === null) return b.createdAt - a.createdAt;
  if (aMs === null) return 1;
  if (bMs === null) return -1;

  const aUpcoming = aMs >= nowMs;
  const bUpcoming = bMs >= nowMs;

  if (aUpcoming && !bUpcoming) return -1;
  if (!aUpcoming && bUpcoming) return 1;

  if (aUpcoming && bUpcoming) {
    return aMs - bMs || b.createdAt - a.createdAt;
  }

  return bMs - aMs || b.createdAt - a.createdAt;
}

export function OrdersView({
  orders,
  onOpenCreateOrder,
  onEditOrder,
  onToggleOrderReady,
  onMarkOrderReceived,
  onDeleteOrder,
}: OrdersViewProps) {
  const [query, setQuery] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmReceiveId, setConfirmReceiveId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingReadyId, setTogglingReadyId] = useState<string | null>(null);
  const [markingReceivedId, setMarkingReceivedId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<{ url: string; title: string } | null>(null);

  const filteredOrders = useMemo(() => {
    const nowMs = Date.now();
    const q = query.trim().toLowerCase();
    const list = !q
      ? [...orders]
      : orders.filter(
          (o) =>
            o.orderCode.toLowerCase().includes(q) ||
            o.customerName.toLowerCase().includes(q) ||
            o.customerPhone.toLowerCase().includes(q) ||
            o.productName.toLowerCase().includes(q) ||
            o.productDescription.toLowerCase().includes(q)
        );
    return list.sort((a, b) => compareOrdersByNearestPickup(a, b, nowMs));
  }, [orders, query]);

  const handleConfirmDelete = async (orderId: string) => {
    setDeletingId(orderId);
    try {
      await onDeleteOrder(orderId);
      setConfirmDeleteId(null);
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleReady = async (order: OrderRecord) => {
    setTogglingReadyId(order.id);
    try {
      await onToggleOrderReady(order);
    } finally {
      setTogglingReadyId(null);
    }
  };

  const handleMarkReceived = async (order: OrderRecord) => {
    setMarkingReceivedId(order.id);
    try {
      await onMarkOrderReceived(order);
      setConfirmReceiveId(null);
    } finally {
      setMarkingReceivedId(null);
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-3 pb-16 sm:p-5 sm:pb-20">
      <div className="mx-auto max-w-3xl space-y-3.5">
        {/* Search + Action Bar */}
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm đơn theo tên khách, SĐT, tên sản phẩm, mã đơn..."
              aria-label="Tìm kiếm đơn hàng"
              className="h-9 w-full rounded-xl border border-zinc-800 bg-zinc-900/90 pl-9 pr-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <button
            type="button"
            onClick={onOpenCreateOrder}
            className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 whitespace-nowrap"
          >
            <ClipboardPlus className="h-4 w-4" />
            <span>Tạo đơn hàng</span>
          </button>
        </div>

        {/* Orders List / Empty State */}
        {filteredOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/30 px-6 py-16 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-400">
              <ShoppingBag className="h-6 w-6" />
            </div>
            <h2 className="font-display text-base font-semibold text-zinc-100">
              {query.trim() ? 'Không tìm thấy đơn hàng phù hợp' : 'Chưa có đơn hàng nào'}
            </h2>
            <p className="mt-1.5 max-w-md text-sm text-zinc-400">
              {query.trim()
                ? 'Hãy thử từ khóa khác hoặc xóa bộ lọc tìm kiếm hiện tại.'
                : 'Nhấn "Tạo đơn hàng" để lưu thông tin khách hàng, sản phẩm, giá tiền, tiền cọc và ảnh mẫu.'}
            </p>
            {!query.trim() && (
              <button
                type="button"
                onClick={onOpenCreateOrder}
                className="mt-5 inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
              >
                <ClipboardPlus className="h-4 w-4" />
                <span>Tạo đơn hàng đầu tiên</span>
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2.5">
            {filteredOrders.map((order) => {
              const primarySample = order.sampleImages[0];
              const isConfirmingDelete = confirmDeleteId === order.id;
              const isConfirmingReceive = confirmReceiveId === order.id;
              const deposit = Math.max(0, Number(order.depositAmount) || 0);
              const isPaidInFull =
                Boolean(order.isPaid) || (order.price > 0 && deposit >= order.price);
              const isReady = Boolean(order.isReady);
              const isReceived = Boolean(order.isReceived);
              const remaining = Math.max(0, order.price - deposit);
              const pickupFormatted = formatPickupTime(order.pickupTime);

              return (
                <article
                  key={order.id}
                  className={`grid grid-cols-[104px_minmax(0,1fr)] gap-x-3 gap-y-2 rounded-xl border bg-zinc-900/60 p-2.5 transition-colors sm:grid-cols-[176px_minmax(0,1fr)] sm:p-3 md:grid-cols-[192px_minmax(0,1fr)] ${
                    isReady && !isReceived
                      ? 'border-emerald-700/70 hover:border-emerald-600/80'
                      : 'border-zinc-800 hover:border-zinc-700'
                  }`}
                >
                  {/* Sample Image: spans full height of row 1 on mobile, and full 3-row card height on sm+ */}
                  {primarySample ? (
                    <button
                      type="button"
                      onClick={() =>
                        setPreviewUrl({
                          url: primarySample.fullUrl,
                          title: primarySample.title || order.productName,
                        })
                      }
                      title="Nhấn để phóng to ảnh mẫu"
                      className="group relative col-start-1 row-start-1 min-h-[104px] w-full self-stretch overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 sm:row-span-3 sm:min-h-[144px]"
                    >
                      <img
                        src={primarySample.thumbnailUrl}
                        alt={order.productName}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                      />
                      {order.sampleImages.length > 1 && (
                        <span className="tabular-nums absolute bottom-1.5 right-1.5 rounded bg-zinc-950/85 px-1.5 py-0.5 text-[11px] font-semibold text-zinc-100">
                          +{order.sampleImages.length - 1}
                        </span>
                      )}
                    </button>
                  ) : (
                    <div className="col-start-1 row-start-1 flex min-h-[104px] w-full items-center justify-center self-stretch rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-600 sm:row-span-3 sm:min-h-[144px]">
                      <ImageIcon className="h-7 w-7" />
                    </div>
                  )}

                  {/* Top: Product Name, Order Meta, Ready Tick & Customer Info */}
                  <div className="col-start-2 row-start-1 min-w-0 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <h3 className="font-display truncate text-sm font-semibold leading-snug text-zinc-50 sm:text-base">
                            {order.productName}
                          </h3>
                          <span className="tabular-nums shrink-0 text-[11px] text-zinc-400">
                            <span className="font-mono text-zinc-300">{order.orderCode}</span>
                            <span aria-hidden="true"> · </span>
                            <span>{formatDateTime(order.createdAt)}</span>
                          </span>
                        </div>

                        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-zinc-300">
                          <span className="inline-flex items-center gap-1">
                            <User className="h-3 w-3 text-zinc-500" />
                            <span>{order.customerName}</span>
                          </span>
                          <a
                            href={`tel:${order.customerPhone.replace(/\s+/g, '')}`}
                            className="tabular-nums inline-flex items-center gap-1 text-zinc-300 hover:text-blue-400"
                          >
                            <Phone className="h-3 w-3 text-zinc-500" />
                            <span>{order.customerPhone}</span>
                          </a>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleToggleReady(order)}
                        disabled={togglingReadyId === order.id}
                        aria-pressed={isReady}
                        title={
                          isReady
                            ? 'Bỏ đánh dấu bánh sẵn sàng'
                            : 'Tick đánh dấu đã chuẩn bị bánh sẵn sàng'
                        }
                        className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-medium transition-colors whitespace-nowrap disabled:opacity-50 ${
                          isReady
                            ? 'border-emerald-600/80 bg-emerald-950/60 text-emerald-300 hover:bg-emerald-900/60'
                            : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100'
                        }`}
                      >
                        <span
                          className={`flex h-4 w-4 items-center justify-center rounded border transition-colors ${
                            isReady
                              ? 'border-emerald-500 bg-emerald-500 text-zinc-950'
                              : 'border-zinc-500 bg-zinc-950 text-transparent'
                          }`}
                        >
                          <Check className="h-3 w-3 stroke-[3]" />
                        </span>
                        <span className="hidden sm:inline">Bánh sẵn sàng</span>
                        <span className="sm:hidden">Sẵn sàng</span>
                      </button>
                    </div>

                    {order.sampleImages.length > 1 && (
                      <div className="flex items-center gap-1 pt-0.5">
                        {order.sampleImages.map((img) => (
                          <button
                            key={img.id}
                            type="button"
                            onClick={() =>
                              setPreviewUrl({
                                url: img.fullUrl,
                                title: img.title || order.productName,
                              })
                            }
                            className="h-6 w-6 shrink-0 overflow-hidden rounded border border-zinc-800 bg-zinc-950 hover:border-zinc-500"
                          >
                            <img
                              src={img.thumbnailUrl}
                              alt={img.title}
                              referrerPolicy="no-referrer"
                              className="h-full w-full object-cover"
                            />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Middle: Cake Description (Left) + Dedicated Pickup Time (Right) */}
                  <div className="col-span-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5 border-t border-zinc-800/70 pt-2 sm:col-span-1 sm:col-start-2 sm:row-start-2">
                    <div className="min-w-0">
                      <span className="text-[11px] font-medium text-zinc-500">
                        Mô tả bánh:{' '}
                      </span>
                      <p
                        title={order.productDescription || undefined}
                        className="line-clamp-2 whitespace-pre-line text-xs leading-relaxed text-zinc-200 sm:text-sm"
                      >
                        {order.productDescription || 'Không có mô tả'}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-col justify-center rounded-lg border border-blue-900/50 bg-blue-950/25 px-2.5 py-1.5 text-right sm:min-w-[180px] sm:px-3">
                      <span className="inline-flex items-center justify-end gap-1 text-[11px] font-medium text-blue-300/80">
                        <CalendarClock className="h-3.5 w-3.5 text-blue-400" />
                        <span>Thời gian lấy</span>
                      </span>
                      <span className="tabular-nums text-sm font-bold text-blue-200 sm:text-base">
                        {pickupFormatted || 'Chưa hẹn'}
                      </span>
                    </div>
                  </div>

                  {/* Bottom: Order Price & Payment/Received Status (Bottom-Left) + Edit/Receive/Delete Actions (Bottom-Right) */}
                  <div className="col-span-2 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800/80 pt-2 sm:col-span-1 sm:col-start-2 sm:row-start-3">
                    <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                      <span className="tabular-nums text-sm font-bold text-blue-400 sm:text-base">
                        {formatPriceVnd(order.price)}
                      </span>

                      {order.price > 0 ? (
                        isPaidInFull ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400">
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                            <span>Đã trả đủ</span>
                          </span>
                        ) : (
                          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                            <span className="inline-flex items-center gap-1 font-semibold text-amber-300">
                              <Clock className="h-3 w-3 shrink-0 text-amber-400" />
                              <span className="tabular-nums">
                                Còn thiếu: {formatPriceVnd(remaining)}
                              </span>
                            </span>
                            {deposit > 0 && (
                              <>
                                <span aria-hidden="true" className="text-zinc-600">
                                  ·
                                </span>
                                <span className="tabular-nums text-zinc-400">
                                  Đã cọc: {formatPriceVnd(deposit)}
                                </span>
                              </>
                            )}
                          </span>
                        )
                      ) : (
                        deposit > 0 && (
                          <span className="tabular-nums text-xs text-zinc-300">
                            Đã cọc: {formatPriceVnd(deposit)}
                          </span>
                        )
                      )}

                      {isReceived && (
                        <>
                          <span aria-hidden="true" className="text-zinc-600">
                            ·
                          </span>
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400">
                            <PackageCheck className="h-3.5 w-3.5 shrink-0" />
                            <span>Đã nhận hàng</span>
                          </span>
                        </>
                      )}
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                      {!isConfirmingDelete && !isConfirmingReceive && (
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmReceiveId(null);
                            setConfirmDeleteId(null);
                            onEditOrder(order);
                          }}
                          aria-label={`Chỉnh sửa đơn ${order.orderCode}`}
                          className="inline-flex h-7 items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900 px-2 text-xs font-medium text-zinc-200 transition-colors hover:bg-zinc-800 whitespace-nowrap"
                        >
                          <Pencil className="h-3 w-3" />
                          <span>Sửa</span>
                        </button>
                      )}

                      {!isConfirmingDelete && !isReceived && (
                        isConfirmingReceive ? (
                          <>
                            <span className="text-xs font-medium text-emerald-300">
                              Xác nhận nhận hàng?
                            </span>
                            <button
                              type="button"
                              onClick={() => setConfirmReceiveId(null)}
                              disabled={markingReceivedId === order.id}
                              className="h-7 rounded-md border border-zinc-700 px-2 text-xs font-medium text-zinc-300 hover:bg-zinc-800 whitespace-nowrap"
                            >
                              Hủy
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMarkReceived(order)}
                              disabled={markingReceivedId === order.id}
                              className="inline-flex h-7 items-center gap-1 rounded-md bg-emerald-600 px-2.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50 whitespace-nowrap"
                            >
                              <PackageCheck className="h-3 w-3" />
                              <span>
                                {markingReceivedId === order.id ? 'Đang lưu...' : 'Xác nhận'}
                              </span>
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setConfirmDeleteId(null);
                              setConfirmReceiveId(order.id);
                            }}
                            className="inline-flex h-7 items-center gap-1 rounded-md border border-emerald-800/80 bg-emerald-950/40 px-2 text-xs font-medium text-emerald-300 transition-colors hover:bg-emerald-900/50 whitespace-nowrap"
                          >
                            <PackageCheck className="h-3 w-3" />
                            <span>Đánh dấu nhận hàng</span>
                          </button>
                        )
                      )}

                      {!isConfirmingReceive && (
                        isConfirmingDelete ? (
                          <>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              disabled={deletingId === order.id}
                              className="h-7 rounded-md border border-zinc-700 px-2 text-xs font-medium text-zinc-300 hover:bg-zinc-800 whitespace-nowrap"
                            >
                              Hủy
                            </button>
                            <button
                              type="button"
                              onClick={() => handleConfirmDelete(order.id)}
                              disabled={deletingId === order.id}
                              className="h-7 rounded-md bg-rose-600 px-2.5 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-50 whitespace-nowrap"
                            >
                              {deletingId === order.id ? 'Đang xóa...' : 'Xóa đơn'}
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setConfirmReceiveId(null);
                              setConfirmDeleteId(order.id);
                            }}
                            aria-label={`Xóa đơn ${order.orderCode}`}
                            className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-zinc-400 transition-colors hover:bg-rose-950/60 hover:text-rose-300 whitespace-nowrap"
                          >
                            <Trash2 className="h-3 w-3" />
                            <span>Xóa</span>
                          </button>
                        )
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {/* Simple Sample Image Lightbox */}
      {previewUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/85 p-4 backdrop-blur-sm"
          onClick={() => setPreviewUrl(null)}
        >
          <div
            className="relative max-h-[90vh] max-w-3xl overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPreviewUrl(null)}
              aria-label="Đóng ảnh"
              className="absolute right-3 top-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full bg-zinc-950/80 text-zinc-200 hover:bg-zinc-800"
            >
              <X className="h-5 w-5" />
            </button>
            <img
              src={previewUrl.url}
              alt={previewUrl.title}
              referrerPolicy="no-referrer"
              className="max-h-[82vh] w-auto object-contain"
            />
            <div className="border-t border-zinc-800 px-4 py-2.5 text-xs text-zinc-300">
              {previewUrl.title}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
