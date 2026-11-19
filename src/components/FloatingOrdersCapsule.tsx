import { Plus, ShoppingBag } from 'lucide-react';

interface FloatingOrdersCapsuleProps {
  showOrdersMobile: boolean;
  showOrdersDesktop: boolean;
  onOpenOrders: () => void;
  canAdd?: boolean;
  onAddClick?: () => void;
  addTitle?: string;
  addAriaLabel?: string;
}

export function FloatingOrdersCapsule({
  showOrdersMobile,
  showOrdersDesktop,
  onOpenOrders,
  canAdd = false,
  onAddClick,
  addTitle = 'Thêm mới',
  addAriaLabel = 'Thêm mới',
}: FloatingOrdersCapsuleProps) {
  const showAddButton = Boolean(canAdd && onAddClick);

  if (!showAddButton && !showOrdersMobile && !showOrdersDesktop) {
    return null;
  }

  const ordersVisibilityClass = `${
    showOrdersMobile ? 'inline-flex' : 'hidden'
  } ${showOrdersDesktop ? 'md:inline-flex' : 'md:hidden'}`;

  return (
    <div className="absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-5 z-30 flex items-center gap-2.5 sm:bottom-6 sm:right-6">
      <button
        type="button"
        onClick={onOpenOrders}
        title="Mở danh sách đơn hàng"
        aria-label="Mở danh sách đơn hàng"
        className={`${ordersVisibilityClass} h-12 w-12 items-center justify-center rounded-full border border-zinc-700/75 bg-zinc-900/85 text-white shadow-xl backdrop-blur-xl transition-colors hover:bg-zinc-800/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500`}
      >
        <ShoppingBag className="h-5 w-5 text-white" />
      </button>

      {showAddButton && onAddClick && (
        <button
          type="button"
          onClick={onAddClick}
          title={addTitle}
          aria-label={addAriaLabel}
          className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-zinc-700/75 bg-zinc-900/85 text-zinc-100 shadow-xl backdrop-blur-xl transition-colors hover:bg-zinc-800/90 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
        >
          <Plus className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}
