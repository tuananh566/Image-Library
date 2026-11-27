import { Plus } from 'lucide-react';

interface FloatingAddButtonProps {
  canAdd?: boolean;
  onAddClick?: () => void;
  addTitle?: string;
  addAriaLabel?: string;
}

export function FloatingAddButton({
  canAdd = false,
  onAddClick,
  addTitle = 'Thêm mới',
  addAriaLabel = 'Thêm mới',
}: FloatingAddButtonProps) {
  if (!canAdd || !onAddClick) {
    return null;
  }

  return (
    <div className="absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-5 z-30 flex items-center sm:bottom-6 sm:right-6">
      <button
        type="button"
        onClick={onAddClick}
        title={addTitle}
        aria-label={addAriaLabel}
        className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-zinc-700/75 bg-zinc-900/85 text-zinc-100 shadow-xl backdrop-blur-xl transition-colors hover:bg-zinc-800/90 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
      >
        <Plus className="h-5 w-5" />
      </button>
    </div>
  );
}
