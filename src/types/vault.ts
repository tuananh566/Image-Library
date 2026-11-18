export type AspectRatioType = 'landscape' | 'portrait' | 'square';

export type AspectFilter = 'all' | AspectRatioType;

export type ViewMode = 'grid' | 'masonry' | 'list';

export type SortOption = 'newest' | 'oldest' | 'title' | 'relevance' | 'size';

export type AppTab = 'library' | 'categories';

export interface Category {
  id: string;
  name: string;
  description: string;
  color: string;
  order: number;
  createdAt: number;
}

export interface VaultImageRecord {
  id: string;
  title: string;
  fileName: string;
  notes: string;
  categoryId: string | null;
  tags: string[];
  width: number;
  height: number;
  size: number;
  mimeType: string;
  aspectRatioType: AspectRatioType;
  dominantColors: string[];
  colorFamilies: string[];
  isFavorite: boolean;
  createdAt: number;
  updatedAt: number;
  blob: Blob;
  thumbnailBlob: Blob;
}

export interface VaultImageView extends Omit<VaultImageRecord, 'blob' | 'thumbnailBlob'> {
  thumbnailUrl: string;
  fullUrl?: string;
}

export interface SearchFilterState {
  query: string;
  categoryId: string | 'all' | 'uncategorized' | 'favorites';
  aspectFilter: AspectFilter;
  sortBy: SortOption;
}

export interface ScoredImage {
  image: VaultImageView;
  score: number;
  matchedFields: string[];
}

export interface StorageStats {
  imageCount: number;
  categoryCount: number;
  totalBytes: number;
  quotaUsedBytes?: number;
  quotaTotalBytes?: number;
}
