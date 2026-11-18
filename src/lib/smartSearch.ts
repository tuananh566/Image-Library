import type {
  Category,
  ScoredImage,
  SearchFilterState,
  VaultImageView,
} from '../types/vault';

export function normalizeVietnamese(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .trim();
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);

  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

function tokenMatchScore(queryToken: string, targetText: string): number {
  if (!queryToken || !targetText) return 0;
  const normTarget = normalizeVietnamese(targetText);
  if (normTarget === queryToken) return 1.0;
  if (normTarget.startsWith(queryToken)) return 0.92;
  if (normTarget.includes(queryToken)) return 0.78;

  const words = normTarget.split(/[\s,.;:/_-]+/).filter(Boolean);
  let best = 0;
  for (const word of words) {
    if (word.startsWith(queryToken)) {
      best = Math.max(best, 0.88);
    } else if (queryToken.length >= 4 && Math.abs(word.length - queryToken.length) <= 2) {
      const maxDist = queryToken.length >= 7 ? 2 : 1;
      const dist = levenshteinDistance(queryToken, word);
      if (dist <= maxDist) {
        best = Math.max(best, 0.65 - dist * 0.12);
      }
    }
  }
  return best;
}

export interface ParsedQuery {
  excludedTerms: string[];
  categoryFilter: string | null;
  ratioFilter: 'landscape' | 'portrait' | 'square' | null;
  favoriteOnly: boolean;
  terms: string[];
}

export function parseSmartQuery(rawQuery: string): ParsedQuery {
  const result: ParsedQuery = {
    excludedTerms: [],
    categoryFilter: null,
    ratioFilter: null,
    favoriteOnly: false,
    terms: [],
  };

  const parts = rawQuery.trim().split(/\s+/).filter(Boolean);

  for (const part of parts) {
    const lower = normalizeVietnamese(part);

    if ((lower.startsWith('cat:') || lower.startsWith('dm:')) && lower.includes(':')) {
      const val = lower.split(':')[1];
      if (val) result.categoryFilter = val;
    } else if (lower.startsWith('ratio:') || lower.startsWith('tyle:')) {
      const val = lower.split(':')[1];
      if (val === 'ngang' || val === 'landscape') result.ratioFilter = 'landscape';
      else if (val === 'doc' || val === 'portrait') result.ratioFilter = 'portrait';
      else if (val === 'vuong' || val === 'square') result.ratioFilter = 'square';
    } else if (lower === 'fav:true' || lower === 'yeuthich') {
      result.favoriteOnly = true;
    } else if (lower.startsWith('-') && lower.length > 1) {
      result.excludedTerms.push(lower.slice(1));
    } else {
      result.terms.push(lower);
    }
  }

  return result;
}

export function filterAndScoreImages(
  images: VaultImageView[],
  categories: Category[],
  filters: SearchFilterState
): ScoredImage[] {
  const categoryMap = new Map<string, Category>();
  categories.forEach((c) => categoryMap.set(c.id, c));

  const parsed = parseSmartQuery(filters.query);
  const hasSearchQuery = filters.query.trim().length > 0;

  const scored: ScoredImage[] = [];

  for (const img of images) {
    if (filters.categoryId === 'favorites' && !img.isFavorite) continue;
    if (filters.categoryId === 'uncategorized' && img.categoryId !== null) continue;
    if (
      filters.categoryId !== 'all' &&
      filters.categoryId !== 'favorites' &&
      filters.categoryId !== 'uncategorized' &&
      img.categoryId !== filters.categoryId
    ) {
      continue;
    }

    if (filters.aspectFilter !== 'all' && img.aspectRatioType !== filters.aspectFilter) {
      continue;
    }

    if (parsed.favoriteOnly && !img.isFavorite) continue;
    if (parsed.ratioFilter && img.aspectRatioType !== parsed.ratioFilter) continue;

    const categoryName = img.categoryId ? categoryMap.get(img.categoryId)?.name || '' : '';

    if (parsed.categoryFilter) {
      if (!normalizeVietnamese(categoryName).includes(parsed.categoryFilter)) continue;
    }

    const combinedSearchBlob = normalizeVietnamese(
      `${img.title} ${img.notes} ${img.fileName} ${categoryName}`
    );

    if (parsed.excludedTerms.length > 0) {
      const hasExcludedTerm = parsed.excludedTerms.some((term) =>
        combinedSearchBlob.includes(term)
      );
      if (hasExcludedTerm) continue;
    }

    let score = 1;
    const matchedFields = new Set<string>();

    if (parsed.categoryFilter) {
      score += 6;
      matchedFields.add('Danh mục');
    }

    if (parsed.terms.length > 0) {
      let allTermsMatched = true;
      let totalTermScore = 0;

      for (const term of parsed.terms) {
        const titleScore = tokenMatchScore(term, img.title) * 10;
        const catScore = tokenMatchScore(term, categoryName) * 6;
        const noteScore = tokenMatchScore(term, img.notes) * 4;
        const fileScore = tokenMatchScore(term, img.fileName) * 3;

        const bestFieldScore = Math.max(titleScore, catScore, noteScore, fileScore);

        if (bestFieldScore < 1.5) {
          allTermsMatched = false;
          break;
        }

        if (titleScore >= 2) matchedFields.add('Tiêu đề');
        if (catScore >= 2) matchedFields.add('Danh mục');
        if (noteScore >= 1.5) matchedFields.add('Ghi chú');
        if (fileScore >= 1.5) matchedFields.add('Tên tệp');

        totalTermScore += titleScore + catScore * 0.5 + noteScore * 0.4 + fileScore * 0.2;
      }

      if (!allTermsMatched) continue;
      score += totalTermScore;
    }

    scored.push({
      image: img,
      score,
      matchedFields: Array.from(matchedFields),
    });
  }

  scored.sort((a, b) => {
    if (filters.sortBy === 'relevance' && hasSearchQuery) {
      if (b.score !== a.score) return b.score - a.score;
      return b.image.createdAt - a.image.createdAt;
    }
    if (filters.sortBy === 'oldest') return a.image.createdAt - b.image.createdAt;
    if (filters.sortBy === 'title') return a.image.title.localeCompare(b.image.title, 'vi');
    if (filters.sortBy === 'size') return b.image.size - a.image.size;
    return b.image.createdAt - a.image.createdAt;
  });

  return scored;
}
