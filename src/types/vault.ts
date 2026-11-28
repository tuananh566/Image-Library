export type AspectRatioType = 'landscape' | 'portrait' | 'square';

export type AspectFilter = 'all' | AspectRatioType;

export type ViewMode = 'grid' | 'masonry' | 'list';

export type SortOption = 'newest' | 'oldest' | 'title' | 'relevance' | 'size';

export type AppTab = 'library' | 'categories' | 'recent';

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
  categoryIds?: string[];
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

export function getImageCategoryIds(img: {
  categoryId?: string | null;
  categoryIds?: string[];
}): string[] {
  const set = new Set<string>();
  if (Array.isArray(img.categoryIds)) {
    for (const id of img.categoryIds) {
      if (id) set.add(String(id));
    }
  }
  if (img.categoryId) {
    set.add(String(img.categoryId));
  }
  return Array.from(set);
}

export interface VaultImageView
  extends Omit<
    VaultImageRecord,
    'blob' | 'thumbnailBlob' | 'tags' | 'dominantColors' | 'colorFamilies'
  > {
  tags?: string[];
  dominantColors?: string[];
  colorFamilies?: string[];
  thumbnailUrl: string;
  fullUrl?: string;
}

export interface SearchFilterState {
  query: string;
  categoryId: string | 'all' | 'uncategorized';
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
