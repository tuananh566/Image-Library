import type { Category, VaultImageRecord, VaultImageView } from '../types/vault';
import { getSuperAdminToken } from './adminAuth';
import {
  dataUrlToBlob,
  parseBackupFileStreaming,
  type BackupImageInput,
} from './backupStreaming';
import { getAllCategories, getAllImages, type VaultBackupBundle } from './db';
import {
  attachDeviceTokenToUrl,
  getDeviceAuthHeaders,
  notifyDeviceUnauthorized,
} from './deviceAuth';
import { generateId, processImageBlob } from './imageProcessor';

export interface ServerVaultResponse {
  categories: Category[];
  images: VaultImageView[];
  seeded: boolean;
}

const DEFAULT_CATEGORIES: Category[] = [
  {
    id: 'cat-architecture',
    name: 'Kiến trúc & Nội thất',
    description: 'Không gian bê tông, ánh sáng tự nhiên và vật liệu đá.',
    color: '#2563EB',
    order: 0,
    createdAt: Date.now() - 500000,
  },
  {
    id: 'cat-product',
    name: 'Sản phẩm & Studio',
    description: 'Gốm thủ công, bố cục bàn chụp và ánh sáng tản.',
    color: '#D97706',
    order: 1,
    createdAt: Date.now() - 400000,
  },
  {
    id: 'cat-fashion',
    name: 'Thời trang & Lookbook',
    description: 'Phom dáng áo khoác, phông nền studio và chân dung.',
    color: '#0F172A',
    order: 2,
    createdAt: Date.now() - 300000,
  },
  {
    id: 'cat-packaging',
    name: 'Đồ họa & Bao bì',
    description: 'Typography in dập nổi, nhãn chai và chất liệu giấy mỹ thuật.',
    color: '#16A34A',
    order: 3,
    createdAt: Date.now() - 200000,
  },
  {
    id: 'cat-landscape',
    name: 'Thiên nhiên & Ánh sáng',
    description: 'Sắc độ bình minh, sương mù và phối màu tự nhiên.',
    color: '#0284C7',
    order: 4,
    createdAt: Date.now() - 100000,
  },
];

const SAMPLE_SEED_ITEMS = [
  {
    id: 'seed-arch-01',
    assetUrl: '/src/assets/images/ref_architecture_concrete_1795023509210.jpg',
    fileName: 'kien-truc-be-tong-cau-thang.jpg',
    title: 'Cầu thang đá travertine & bê tông trần đón nắng chiều',
    notes: 'Tham khảo góc đổ bóng hình học trên bề mặt bê tông thô và lan can kính tối giản.',
    categoryId: 'cat-architecture',
    tags: ['bê tông', 'nội thất', 'ánh sáng tự nhiên', 'tối giản', 'cầu thang'],
    isFavorite: true,
    offsetMs: 450000,
  },
  {
    id: 'seed-prod-02',
    assetUrl: '/src/assets/images/ref_product_ceramic_1795023495699.jpg',
    fileName: 'studio-gom-su-stoneware.jpg',
    title: 'Bộ bình gốm stoneware & đồng thau trên bệ đá vôi',
    notes: 'Bố cục tĩnh vật chụp ngang tầm mắt, ánh sáng cửa sổ tản mềm từ bên trái.',
    categoryId: 'cat-product',
    tags: ['gốm sứ', 'studio', 'tối giản', 'chất liệu thô', 'vật liệu'],
    isFavorite: true,
    offsetMs: 350000,
  },
  {
    id: 'seed-fash-03',
    assetUrl: '/src/assets/images/ref_fashion_editorial_1795023514339.jpg',
    fileName: 'lookbook-ao-khoac-da-xam.jpg',
    title: 'Lookbook áo khoác dạ xám than trên phông xám studio',
    notes: 'Tham khảo dáng cắt cầu vai và ánh sáng softbox định hướng tạo khối trang phục.',
    categoryId: 'cat-fashion',
    tags: ['lookbook', 'chân dung', 'studio', 'phông xám', 'áo khoác'],
    isFavorite: false,
    offsetMs: 250000,
  },
  {
    id: 'seed-pack-04',
    assetUrl: '/src/assets/images/ref_packaging_botanical_1795023504790.jpg',
    fileName: 'bao-bi-my-pham-giay-cotton.jpg',
    title: 'Bao bì tinh dầu chai hổ phách & hộp giấy cotton dập chìm',
    notes: 'Mẫu bố cục typography serif tối giản kết hợp nền đá basalt sẫm màu.',
    categoryId: 'cat-packaging',
    tags: ['bao bì', 'typography', 'chai thủy tinh', 'mỹ phẩm', 'in ấn'],
    isFavorite: true,
    offsetMs: 150000,
  },
  {
    id: 'seed-land-05',
    assetUrl: '/src/assets/images/ref_landscape_mist_1795023496530.jpg',
    fileName: 'nui-thong-suong-som-binh-minh.jpg',
    title: 'Dải núi thông trong sương sớm và ánh vàng nhạt chân trời',
    notes: 'Bảng màu chuyển lớp xanh lam xám và điểm nhấn ấm nhẹ, phù hợp tham khảo color grading.',
    categoryId: 'cat-landscape',
    tags: ['phong cảnh', 'bình minh', 'sương mù', 'phối màu', 'mây núi'],
    isFavorite: false,
    offsetMs: 50000,
  },
];

function hydrateImageUrls(img: VaultImageView): VaultImageView {
  return {
    ...img,
    thumbnailUrl: attachDeviceTokenToUrl(img.thumbnailUrl),
    ...(img.fullUrl ? { fullUrl: attachDeviceTokenToUrl(img.fullUrl) } : {}),
  };
}

async function assertOk(res: Response): Promise<Response> {
  if (res.status === 401) {
    notifyDeviceUnauthorized();
    throw new Error('DEVICE_NOT_TRUSTED');
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const trimmed = text.trim();
    try {
      const parsed = JSON.parse(trimmed) as { error?: string; message?: string };
      if (parsed?.error) throw new Error(parsed.error);
      if (parsed?.message) throw new Error(parsed.message);
    } catch (e) {
      if (e instanceof Error && e.message && !trimmed.startsWith('{')) {
        throw e;
      }
      if (e instanceof Error && trimmed.startsWith('{') && e.message !== 'Unexpected end of JSON input') {
        throw e;
      }
    }
    if (
      res.status === 404 &&
      (trimmed.startsWith('<!') || trimmed.startsWith('<html') || trimmed.includes('Cannot '))
    ) {
      throw new Error(
        'Máy chủ chưa chạy phiên bản backend mới nhất (thiếu API). Hãy bấm "Restart Server" rồi tải lại trang.'
      );
    }
    throw new Error(trimmed || `HTTP ${res.status}`);
  }
  return res;
}

async function parseJsonResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error(
      'Máy chủ trả về phản hồi rỗng. Vui lòng thử lại hoặc bấm "Restart Server" trong Cài đặt.'
    );
  }
  if (trimmed.startsWith('<!') || trimmed.startsWith('<html')) {
    throw new Error(
      'Máy chủ chưa áp dụng bản cập nhật backend (trả về HTML thay vì JSON). Hãy bấm "Restart Server" rồi tải lại trang.'
    );
  }
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new Error('Phản hồi từ máy chủ không phải dữ liệu JSON hợp lệ.');
  }
}

async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  for (const [k, v] of Object.entries(getDeviceAuthHeaders())) {
    if (!headers.has(k)) headers.set(k, v);
  }
  return assertOk(await fetch(input, { ...init, headers }));
}

const VAULT_SNAPSHOT_KEY = 'khoanh_vault_snapshot_v1';

export function readCachedVaultSnapshot(): ServerVaultResponse | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(VAULT_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ServerVaultResponse>;
    if (!Array.isArray(parsed.categories) || !Array.isArray(parsed.images)) {
      return null;
    }
    return {
      categories: parsed.categories,
      images: parsed.images.map(hydrateImageUrls),
      seeded: Boolean(parsed.seeded),
    };
  } catch {
    return null;
  }
}

export function writeCachedVaultSnapshot(vault: ServerVaultResponse): void {
  if (typeof window === 'undefined') return;
  try {
    const snapshot: ServerVaultResponse = {
      categories: vault.categories,
      images: vault.images.slice(0, 1500),
      seeded: vault.seeded,
    };
    localStorage.setItem(VAULT_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignore Safari private mode or storage quota errors
  }
}

export function clearCachedVaultSnapshot(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(VAULT_SNAPSHOT_KEY);
  } catch {
    // Ignore storage errors
  }
}

export async function fetchServerVault(): Promise<ServerVaultResponse> {
  const res = await apiFetch('/api/vault', { cache: 'no-cache' });
  const data = await parseJsonResponse<ServerVaultResponse>(res);
  writeCachedVaultSnapshot(data);
  return {
    ...data,
    images: (data.images || []).map(hydrateImageUrls),
  };
}

export async function saveServerCategory(category: Category): Promise<Category> {
  const res = await apiFetch('/api/categories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(category),
  });
  return parseJsonResponse<Category>(res);
}

export async function deleteServerCategory(categoryId: string): Promise<void> {
  await apiFetch(`/api/categories/${encodeURIComponent(categoryId)}`, {
    method: 'DELETE',
  });
}

export async function deleteServerCategories(ids: string[]): Promise<void> {
  await apiFetch('/api/categories/batch-delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
}

export async function mergeCreateServerCategory(input: {
  category: Category;
  sourceCategoryIds?: string[];
  sourceImageIds?: string[];
}): Promise<{ category: Category; addedImageCount: number }> {
  const res = await apiFetch('/api/categories/merge-create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return parseJsonResponse<{ category: Category; addedImageCount: number }>(res);
}

export async function reorderServerCategories(orderedIds: string[]): Promise<Category[]> {
  const res = await apiFetch('/api/categories/reorder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderedIds }),
  });
  const data = await parseJsonResponse<{ categories?: Category[] }>(res);
  return data.categories || [];
}

export async function uploadServerImage(record: VaultImageRecord): Promise<VaultImageView> {
  const { blob, thumbnailBlob, ...meta } = record;
  const formData = new FormData();
  formData.append('file', blob, record.fileName || 'image.jpg');
  if (thumbnailBlob) {
    const thumbExt = thumbnailBlob.type === 'image/webp' ? 'thumb.webp' : 'thumb.jpg';
    formData.append('thumbnail', thumbnailBlob, thumbExt);
  }
  formData.append('metadata', JSON.stringify(meta));

  const res = await apiFetch('/api/images', {
    method: 'POST',
    body: formData,
  });
  return hydrateImageUrls(await parseJsonResponse<VaultImageView>(res));
}

export async function uploadServerImagesBatch(records: VaultImageRecord[]): Promise<VaultImageView[]> {
  if (records.length === 0) return [];
  if (records.length === 1) {
    return [await uploadServerImage(records[0])];
  }

  const formData = new FormData();
  const metaList = records.map((record, idx) => {
    const { blob, thumbnailBlob, ...meta } = record;
    formData.append(`file_${idx}`, blob, record.fileName || `image-${idx}.jpg`);
    if (thumbnailBlob) {
      const thumbExt = thumbnailBlob.type === 'image/webp' ? `thumb-${idx}.webp` : `thumb-${idx}.jpg`;
      formData.append(`thumb_${idx}`, thumbnailBlob, thumbExt);
    }
    return meta;
  });
  formData.append('metadata', JSON.stringify(metaList));

  const res = await apiFetch('/api/images/batch', {
    method: 'POST',
    body: formData,
  });
  const data = await parseJsonResponse<{ images?: VaultImageView[] }>(res);
  return (data.images || []).map(hydrateImageUrls);
}

export async function updateServerImageMetadata(
  id: string,
  patch: Partial<Pick<VaultImageRecord, 'title' | 'notes' | 'categoryId' | 'tags' | 'isFavorite'>>
): Promise<VaultImageView> {
  const res = await apiFetch(`/api/images/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  return hydrateImageUrls(await parseJsonResponse<VaultImageView>(res));
}

export async function batchUpdateServerImages(
  ids: string[],
  patch: Partial<Pick<VaultImageRecord, 'categoryId' | 'isFavorite'>>
): Promise<void> {
  await apiFetch('/api/images/batch-update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, patch }),
  });
}

export async function deleteServerImages(ids: string[]): Promise<void> {
  await apiFetch('/api/images/batch-delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
}

export async function clearServerVault(): Promise<void> {
  await apiFetch('/api/vault', { method: 'DELETE' });
  clearCachedVaultSnapshot();
}

export async function exportServerBackup(): Promise<VaultBackupBundle> {
  const res = await apiFetch('/api/vault/backup', { cache: 'no-store' });
  return parseJsonResponse<VaultBackupBundle>(res);
}

export async function downloadServerBackupBlob(): Promise<Blob> {
  const res = await apiFetch('/api/vault/backup?download=1', { cache: 'no-store' });
  return res.blob();
}

export interface BackupImportProgress {
  phase: 'reading' | 'uploading' | 'committing';
  importedImages: number;
  readPercent: number;
}

export interface BackupImportResult {
  importedCategories: number;
  importedImages: number;
}

export async function importServerBackup(
  bundle: VaultBackupBundle,
  mode: 'merge' | 'replace'
): Promise<BackupImportResult> {
  const res = await apiFetch('/api/vault/restore', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, bundle }),
  });
  return parseJsonResponse<BackupImportResult>(res);
}

interface PendingRestoreImage {
  meta: Record<string, unknown>;
  blob: Blob;
  thumbBlob: Blob;
  approxBytes: number;
}

export async function importServerBackupFile(
  file: File,
  mode: 'merge' | 'replace',
  onProgress?: (progress: BackupImportProgress) => void
): Promise<BackupImportResult> {
  const beginRes = await apiFetch('/api/vault/restore/begin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode }),
  });
  const { sessionId } = await parseJsonResponse<{ sessionId: string }>(beginRes);

  const MAX_BATCH_IMAGES = 4;
  const MAX_BATCH_BYTES = 3.5 * 1024 * 1024;
  let pending: PendingRestoreImage[] = [];
  let pendingBytes = 0;
  let uploadedImages = 0;
  let lastReadPercent = 0;

  const flushImageBatch = async () => {
    if (pending.length === 0) return;
    const batch = pending;
    pending = [];
    pendingBytes = 0;

    onProgress?.({
      phase: 'uploading',
      importedImages: uploadedImages,
      readPercent: lastReadPercent,
    });

    const formData = new FormData();
    formData.append('sessionId', sessionId);
    const metaList = batch.map((entry, idx) => {
      const fileName = String(entry.meta.fileName || `restored-${idx}.jpg`);
      formData.append(`file_${idx}`, entry.blob, fileName);
      const thumbExt = entry.thumbBlob.type === 'image/webp' ? `thumb-${idx}.webp` : `thumb-${idx}.jpg`;
      formData.append(`thumb_${idx}`, entry.thumbBlob, thumbExt);
      return entry.meta;
    });
    formData.append('metadata', JSON.stringify(metaList));

    await apiFetch('/api/vault/restore/batch', {
      method: 'POST',
      body: formData,
    });

    uploadedImages += batch.length;
    onProgress?.({
      phase: 'uploading',
      importedImages: uploadedImages,
      readPercent: lastReadPercent,
    });
  };

  try {
    const metadata = await parseBackupFileStreaming(file, {
      onProgressBytes: (readBytes, totalBytes) => {
        if (totalBytes > 0) {
          lastReadPercent = Math.min(99, Math.round((readBytes / totalBytes) * 100));
          onProgress?.({
            phase: 'reading',
            importedImages: uploadedImages,
            readPercent: lastReadPercent,
          });
        }
      },
      onImage: async (item: BackupImageInput) => {
        if (!item || typeof item.dataUrl !== 'string' || !item.dataUrl) return;
        const blob = dataUrlToBlob(item.dataUrl);
        if (!blob || blob.size === 0) return;

        const mimeType = item.mimeType || blob.type || 'image/jpeg';
        const fileName = item.fileName || 'restored.jpg';
        const processed = await processImageBlob(blob, {
          optimizeLargeUpload: false,
          fileName,
          mimeType,
        });

        const meta: Record<string, unknown> = {
          id: item.id || generateId(),
          title: item.title || 'Ảnh mẫu đã khôi phục',
          fileName,
          notes: item.notes || '',
          categoryId: item.categoryId ?? null,
          ...(Array.isArray(item.categoryIds) ? { categoryIds: item.categoryIds } : {}),
          tags: Array.isArray(item.tags) ? item.tags : [],
          width: item.width || processed.width,
          height: item.height || processed.height,
          size: blob.size,
          mimeType,
          aspectRatioType:
            item.aspectRatioType === 'landscape' ||
            item.aspectRatioType === 'portrait' ||
            item.aspectRatioType === 'square'
              ? item.aspectRatioType
              : processed.aspectRatioType,
          dominantColors:
            Array.isArray(item.dominantColors) && item.dominantColors.length > 0
              ? item.dominantColors
              : processed.dominantColors,
          colorFamilies:
            Array.isArray(item.colorFamilies) && item.colorFamilies.length > 0
              ? item.colorFamilies
              : processed.colorFamilies,
          isFavorite: Boolean(item.isFavorite),
          createdAt: item.createdAt || Date.now(),
          updatedAt: item.updatedAt || Date.now(),
        };

        const entryBytes = blob.size + processed.thumbnailBlob.size;
        pending.push({
          meta,
          blob,
          thumbBlob: processed.thumbnailBlob,
          approxBytes: entryBytes,
        });
        pendingBytes += entryBytes;

        if (pending.length >= MAX_BATCH_IMAGES || pendingBytes >= MAX_BATCH_BYTES) {
          await flushImageBatch();
        }
      },
    });

    await flushImageBatch();

    onProgress?.({
      phase: 'committing',
      importedImages: uploadedImages,
      readPercent: 100,
    });

    const commitRes = await apiFetch('/api/vault/restore/commit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        categories: Array.isArray(metadata.categories) ? metadata.categories : [],
      }),
    });

    return parseJsonResponse<BackupImportResult>(commitRes);
  } catch (err) {
    await fetch('/api/vault/restore/abort', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getDeviceAuthHeaders(),
      },
      body: JSON.stringify({ sessionId }),
    }).catch(() => {});
    throw err;
  }
}

export async function seedServerSampleVault(
  force = false,
  existingVault?: ServerVaultResponse
): Promise<boolean> {
  const current = existingVault ?? (await fetchServerVault());
  if (!force && (current.seeded || current.images.length > 0 || current.categories.length > 0)) {
    return false;
  }

  for (const cat of DEFAULT_CATEGORIES) {
    await saveServerCategory(cat);
  }

  for (const item of SAMPLE_SEED_ITEMS) {
    try {
      const response = await fetch(item.assetUrl);
      if (!response.ok) continue;
      const blob = await response.blob();
      const processed = await processImageBlob(blob);
      const now = Date.now() - item.offsetMs;
      await uploadServerImage({
        id: item.id,
        title: item.title,
        fileName: item.fileName,
        notes: item.notes,
        categoryId: item.categoryId,
        tags: item.tags,
        width: processed.width,
        height: processed.height,
        size: blob.size,
        mimeType: blob.type || 'image/jpeg',
        aspectRatioType: processed.aspectRatioType,
        dominantColors: processed.dominantColors,
        colorFamilies: processed.colorFamilies,
        isFavorite: item.isFavorite,
        createdAt: now,
        updatedAt: now,
        blob,
        thumbnailBlob: processed.thumbnailBlob,
      });
    } catch {
      // Skip if sample asset unavailable
    }
  }

  await apiFetch('/api/vault/mark-seeded', { method: 'POST' });
  return true;
}

export async function getPendingLocalSyncCount(
  serverCategoryIds: Set<string>,
  serverImageIds: Set<string>
): Promise<{ categories: number; images: number }> {
  try {
    const [localCats, localImgs] = await Promise.all([getAllCategories(), getAllImages()]);
    const missingCats = localCats.filter((c) => !serverCategoryIds.has(c.id)).length;
    const missingImgs = localImgs.filter((i) => !serverImageIds.has(i.id)).length;
    return { categories: missingCats, images: missingImgs };
  } catch {
    return { categories: 0, images: 0 };
  }
}

export async function syncLocalIndexedDbToServer(
  serverCategoryIds: Set<string>,
  serverImageIds: Set<string>
): Promise<{ syncedCategories: number; syncedImages: number }> {
  const [localCats, localImgs] = await Promise.all([getAllCategories(), getAllImages()]);
  let syncedCategories = 0;
  let syncedImages = 0;

  for (const cat of localCats) {
    if (!serverCategoryIds.has(cat.id)) {
      await saveServerCategory(cat);
      syncedCategories++;
    }
  }

  for (const img of localImgs) {
    if (!serverImageIds.has(img.id)) {
      await uploadServerImage(img);
      syncedImages++;
    }
  }

  return { syncedCategories, syncedImages };
}

export interface GithubCommitInfo {
  sha: string;
  shortSha: string;
  message: string;
  date: string;
  author: string;
}

export interface GithubPreservedCounts {
  images: number;
  categories: number;
  devices: number;
}

export interface GithubUpdateStatusResponse {
  repo: string;
  branch: string;
  hasGit: boolean;
  hasToken: boolean;
  tokenSource: 'env' | 'saved' | 'none';
  currentCommit: GithubCommitInfo | null;
  latestCommit: GithubCommitInfo | null;
  hasUpdate: boolean;
  serverPendingRestart?: boolean;
  runningBootId?: string;
  checkError: string | null;
  lastUpdatedAt: number | null;
  preservedData: GithubPreservedCounts;
}

export interface GithubUpdateResult {
  ok: boolean;
  repo: string;
  branch: string;
  method: 'git' | 'tarball';
  commit: GithubCommitInfo;
  npmInstalled: boolean;
  builtDist: boolean;
  serverChanged: boolean;
  updatedAt: number;
  preservedData: GithubPreservedCounts;
}

export async function fetchGithubUpdateStatus(
  repo?: string,
  branch?: string
): Promise<GithubUpdateStatusResponse> {
  const params = new URLSearchParams();
  if (repo?.trim()) params.set('repo', repo.trim());
  if (branch?.trim()) params.set('branch', branch.trim());
  const qs = params.toString();
  const res = await apiFetch(`/api/system/github-status${qs ? `?${qs}` : ''}`, {
    cache: 'no-store',
  });
  return parseJsonResponse<GithubUpdateStatusResponse>(res);
}

export async function saveGithubConfig(input: {
  repo?: string;
  branch?: string;
  githubToken?: string;
  clearToken?: boolean;
}): Promise<{
  ok: boolean;
  repo: string;
  branch: string;
  hasToken: boolean;
  tokenSource: 'env' | 'saved' | 'none';
}> {
  const res = await apiFetch('/api/system/github-config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return parseJsonResponse(res);
}

export async function triggerGithubUpdate(
  repo?: string,
  branch?: string,
  githubToken?: string
): Promise<GithubUpdateResult> {
  const res = await apiFetch('/api/system/github-update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...(repo?.trim() ? { repo: repo.trim() } : {}),
      ...(branch?.trim() ? { branch: branch.trim() } : {}),
      ...(githubToken?.trim() ? { githubToken: githubToken.trim() } : {}),
    }),
  });
  return parseJsonResponse<GithubUpdateResult>(res);
}

export async function restartServer(): Promise<{
  ok: boolean;
  mode: 'supervisor' | 'self-respawn';
  bootId?: string;
}> {
  const res = await apiFetch('/api/system/restart', {
    method: 'POST',
  });
  return parseJsonResponse(res);
}

export async function waitForServerHealthy(
  timeoutMs = 25000,
  previousBootId?: string
): Promise<'restarted' | 'same-process' | 'timeout'> {
  await new Promise((r) => setTimeout(r, 1000));
  const startTime = Date.now();
  const deadline = startTime + timeoutMs;
  let sawDisconnect = false;
  let sawSameBoot = false;
  let legacyHealthyCount = 0;

  while (Date.now() < deadline) {
    try {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 2000);
      const res = await fetch('/api/health', {
        cache: 'no-store',
        signal: controller.signal,
      });
      window.clearTimeout(timer);
      if (res.ok) {
        const data = (await res.json().catch(() => null)) as {
          ok?: boolean;
          bootId?: string;
        } | null;
        if (data?.ok) {
          if (previousBootId) {
            if (data.bootId && data.bootId !== previousBootId) {
              return 'restarted';
            }
            if (!data.bootId && sawDisconnect) {
              return 'restarted';
            }
            sawSameBoot = true;
          } else {
            if (data.bootId || sawDisconnect) {
              return 'restarted';
            }
            legacyHealthyCount++;
            if (legacyHealthyCount >= 5 && Date.now() - startTime > 4000) {
              return 'same-process';
            }
          }
        } else {
          sawDisconnect = true;
        }
      } else {
        sawDisconnect = true;
      }
    } catch {
      sawDisconnect = true;
    }
    await new Promise((r) => setTimeout(r, 750));
  }

  return sawSameBoot || (!sawDisconnect && legacyHealthyCount > 0)
    ? 'same-process'
    : 'timeout';
}

export type ActivityLogLevel = 'info' | 'warn' | 'error';
export type ActivityLogCategory =
  | 'system'
  | 'device'
  | 'image'
  | 'category'
  | 'backup'
  | 'github'
  | 'http';

export interface ServerActivityLogEntry {
  id: string;
  ts: number;
  level: ActivityLogLevel;
  category: ActivityLogCategory;
  action: string;
  detail?: string;
  deviceName?: string;
  ip?: string;
  method?: string;
  path?: string;
  status?: number;
  durationMs?: number;
}

export interface ServerActivityLogsResponse {
  logs: ServerActivityLogEntry[];
  totalBuffered: number;
  serverStartedAt: number;
  uptimeSec: number;
  memoryMb: number;
}

export async function verifyAdminPassword(password: string): Promise<{
  ok: boolean;
  unlimited?: boolean;
  superToken?: string;
}> {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  for (const [k, v] of Object.entries(getDeviceAuthHeaders())) {
    headers.set(k, v);
  }
  const res = await fetch('/api/admin/verify', {
    method: 'POST',
    headers,
    body: JSON.stringify({ password }),
  });
  if (res.status === 401) {
    const payload = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
    if (payload.error === 'DEVICE_NOT_TRUSTED') {
      notifyDeviceUnauthorized();
      throw new Error('DEVICE_NOT_TRUSTED');
    }
    return { ok: false };
  }
  await assertOk(res);
  return parseJsonResponse<{ ok: boolean; unlimited?: boolean; superToken?: string }>(res);
}

export async function fetchServerActivityLogs(options?: {
  level?: 'all' | ActivityLogLevel;
  category?: 'all' | ActivityLogCategory;
  q?: string;
  limit?: number;
}): Promise<ServerActivityLogsResponse> {
  const params = new URLSearchParams();
  if (options?.level && options.level !== 'all') params.set('level', options.level);
  if (options?.category && options.category !== 'all') params.set('category', options.category);
  if (options?.q?.trim()) params.set('q', options.q.trim());
  if (options?.limit) params.set('limit', String(options.limit));
  const qs = params.toString();
  const superToken = getSuperAdminToken();
  const res = await apiFetch(`/api/system/logs${qs ? `?${qs}` : ''}`, {
    cache: 'no-store',
    ...(superToken ? { headers: { 'X-Super-Admin': superToken } } : {}),
  });
  return parseJsonResponse<ServerActivityLogsResponse>(res);
}

export async function clearServerActivityLogs(): Promise<void> {
  const superToken = getSuperAdminToken();
  await apiFetch('/api/system/logs', {
    method: 'DELETE',
    ...(superToken ? { headers: { 'X-Super-Admin': superToken } } : {}),
  });
}

export interface AutoBackupProgress {
  phase: 'preparing' | 'writing' | 'finalizing';
  processed: number;
  total: number;
  startedAt: number;
}

export interface AutoBackupStatusResponse {
  exists: boolean;
  savedAt: number | null;
  nextBackupAt: number | null;
  intervalMs: number;
  sizeBytes: number;
  imageCount: number;
  categoryCount: number;
  trigger: 'auto' | 'manual' | null;
  isBackingUp: boolean;
  isRestoring: boolean;
  progress?: AutoBackupProgress | null;
  lastError?: string | null;
}

export interface AutoBackupRestoreResult {
  ok: boolean;
  importedCategories: number;
  importedImages: number;
  restoredFromSavedAt: number;
}

export async function fetchAutoBackupStatus(): Promise<AutoBackupStatusResponse> {
  const res = await apiFetch('/api/vault/auto-backup/status', {
    cache: 'no-store',
  });
  return parseJsonResponse<AutoBackupStatusResponse>(res);
}

export async function runAutoBackupNow(): Promise<{
  ok: boolean;
  started?: boolean;
  alreadyRunning?: boolean;
  status: AutoBackupStatusResponse;
}> {
  const res = await apiFetch('/api/vault/auto-backup/run', {
    method: 'POST',
  });
  return parseJsonResponse(res);
}

export async function downloadAutoBackupBlob(): Promise<Blob> {
  const res = await apiFetch('/api/vault/auto-backup/download', {
    cache: 'no-store',
  });
  return res.blob();
}

export async function restoreFromAutoBackup(): Promise<AutoBackupRestoreResult> {
  const res = await apiFetch('/api/vault/auto-backup/restore', {
    method: 'POST',
  });
  return parseJsonResponse<AutoBackupRestoreResult>(res);
}
