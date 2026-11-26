import type { Category, OrderRecord, VaultImageRecord, VaultImageView } from '../types/vault';
import {
  dataUrlToBlob,
  parseBackupFileStreaming,
  type BackupImageInput,
  type BackupOrderInput,
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
  orders: OrderRecord[];
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

function hydrateOrderUrls(order: OrderRecord): OrderRecord {
  return {
    ...order,
    sampleImages: (order.sampleImages || []).map((sample) => ({
      ...sample,
      thumbnailUrl: attachDeviceTokenToUrl(sample.thumbnailUrl),
      ...(sample.fullUrl ? { fullUrl: attachDeviceTokenToUrl(sample.fullUrl) } : {}),
    })),
  };
}

async function assertOk(res: Response): Promise<Response> {
  if (res.status === 401) {
    notifyDeviceUnauthorized();
    throw new Error('DEVICE_NOT_TRUSTED');
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    try {
      const parsed = JSON.parse(text) as { error?: string; message?: string };
      if (parsed?.error) throw new Error(parsed.error);
      if (parsed?.message) throw new Error(parsed.message);
    } catch (e) {
      if (e instanceof Error && e.message && !text.startsWith('{')) {
        throw e;
      }
      if (e instanceof Error && text.startsWith('{') && e.message !== 'Unexpected end of JSON input') {
        throw e;
      }
    }
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res;
}

async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  for (const [k, v] of Object.entries(getDeviceAuthHeaders())) {
    if (!headers.has(k)) headers.set(k, v);
  }
  return assertOk(await fetch(input, { ...init, headers }));
}

export async function fetchServerVault(): Promise<ServerVaultResponse> {
  const res = await apiFetch('/api/vault', { cache: 'no-store' });
  const data = (await res.json()) as ServerVaultResponse;
  return {
    ...data,
    images: (data.images || []).map(hydrateImageUrls),
    orders: (data.orders || []).map(hydrateOrderUrls),
  };
}

export async function saveServerCategory(category: Category): Promise<Category> {
  const res = await apiFetch('/api/categories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(category),
  });
  return res.json();
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

export async function reorderServerCategories(orderedIds: string[]): Promise<Category[]> {
  const res = await apiFetch('/api/categories/reorder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderedIds }),
  });
  const data = (await res.json()) as { categories?: Category[] };
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
  return hydrateImageUrls((await res.json()) as VaultImageView);
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
  const data = (await res.json()) as { images?: VaultImageView[] };
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
  return hydrateImageUrls((await res.json()) as VaultImageView);
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
}

export interface CreateServerOrderInput {
  customerName: string;
  customerPhone: string;
  productName: string;
  productDescription: string;
  pickupTime: string;
  price: number;
  depositAmount: number;
  libraryImages: Array<{ imageId: string; title: string }>;
  customFiles: File[];
}

export async function createServerOrder(input: CreateServerOrderInput): Promise<OrderRecord> {
  const formData = new FormData();
  formData.append(
    'metadata',
    JSON.stringify({
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      productName: input.productName,
      productDescription: input.productDescription,
      pickupTime: input.pickupTime,
      price: input.price,
      depositAmount: input.depositAmount,
      libraryImages: input.libraryImages,
    })
  );
  for (const file of input.customFiles) {
    formData.append('customImages', file, file.name || 'sample.jpg');
  }

  const res = await apiFetch('/api/orders', {
    method: 'POST',
    body: formData,
  });
  return hydrateOrderUrls((await res.json()) as OrderRecord);
}

export interface UpdateServerOrderInput extends CreateServerOrderInput {
  keepCustomImageIds: string[];
  isReady?: boolean;
  isReceived?: boolean;
}

export async function saveFullServerOrder(
  orderId: string,
  input: UpdateServerOrderInput
): Promise<OrderRecord> {
  const formData = new FormData();
  formData.append(
    'metadata',
    JSON.stringify({
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      productName: input.productName,
      productDescription: input.productDescription,
      pickupTime: input.pickupTime,
      price: input.price,
      depositAmount: input.depositAmount,
      isReady: input.isReady,
      isReceived: input.isReceived,
      libraryImages: input.libraryImages,
      keepCustomImageIds: input.keepCustomImageIds,
    })
  );
  for (const file of input.customFiles) {
    formData.append('customImages', file, file.name || 'sample.jpg');
  }

  const res = await apiFetch(`/api/orders/${encodeURIComponent(orderId)}`, {
    method: 'PUT',
    body: formData,
  });
  return hydrateOrderUrls((await res.json()) as OrderRecord);
}

export async function updateServerOrder(
  orderId: string,
  patch: Partial<Pick<OrderRecord, 'pickupTime' | 'price' | 'depositAmount' | 'isPaid' | 'isReady' | 'isReceived'>>
): Promise<OrderRecord> {
  const res = await apiFetch(`/api/orders/${encodeURIComponent(orderId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  return hydrateOrderUrls((await res.json()) as OrderRecord);
}

export async function deleteServerOrder(orderId: string): Promise<void> {
  await apiFetch(`/api/orders/${encodeURIComponent(orderId)}`, {
    method: 'DELETE',
  });
}

export async function exportServerBackup(): Promise<VaultBackupBundle> {
  const res = await apiFetch('/api/vault/backup', { cache: 'no-store' });
  return res.json();
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
  importedOrders?: number;
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
  return res.json();
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
  const { sessionId } = (await beginRes.json()) as { sessionId: string };

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

    // Upload any custom order sample images in small chunks as well
    let preparedOrders: BackupOrderInput[] | undefined;
    if (Array.isArray(metadata.orders)) {
      preparedOrders = [];
      let orderFormData = new FormData();
      let orderFileKeys: Array<{ key: string; id: string; mimeType?: string; fileName?: string }> = [];
      let orderBatchBytes = 0;

      const flushOrderFiles = async () => {
        if (orderFileKeys.length === 0) return;
        orderFormData.append('sessionId', sessionId);
        orderFormData.append('orderFileKeys', JSON.stringify(orderFileKeys));
        await apiFetch('/api/vault/restore/batch', {
          method: 'POST',
          body: orderFormData,
        });
        orderFormData = new FormData();
        orderFileKeys = [];
        orderBatchBytes = 0;
      };

      for (let oIdx = 0; oIdx < metadata.orders.length; oIdx++) {
        const order = metadata.orders[oIdx];
        if (!order) continue;
        const nextSamples = [];
        const samples = Array.isArray(order.sampleImages) ? order.sampleImages : [];
        for (let sIdx = 0; sIdx < samples.length; sIdx++) {
          const sample = samples[sIdx];
          if (!sample) continue;
          if (sample.dataUrl) {
            const blob = dataUrlToBlob(sample.dataUrl);
            if (blob && blob.size > 0) {
              const key = `${oIdx}_${sIdx}`;
              const mimeType = sample.mimeType || blob.type || 'image/jpeg';
              orderFormData.append(`order_file_${key}`, blob, `${sample.id || key}.jpg`);
              orderFileKeys.push({
                key,
                id: sample.id || generateId(),
                mimeType,
              });
              orderBatchBytes += blob.size;
              nextSamples.push({
                id: sample.id,
                sourceImageId: null,
                title: sample.title || 'Ảnh mẫu đơn hàng',
                uploadKey: key,
              });
              if (orderFileKeys.length >= MAX_BATCH_IMAGES || orderBatchBytes >= MAX_BATCH_BYTES) {
                await flushOrderFiles();
              }
              continue;
            }
          }
          nextSamples.push({
            id: sample.id,
            sourceImageId: sample.sourceImageId ?? null,
            title: sample.title || 'Ảnh mẫu',
          });
        }
        preparedOrders.push({
          ...order,
          sampleImages: nextSamples,
        });
      }
      await flushOrderFiles();
    }

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
        ...(preparedOrders !== undefined ? { orders: preparedOrders } : {}),
      }),
    });

    return commitRes.json();
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

export async function seedServerSampleVault(force = false): Promise<boolean> {
  const current = await fetchServerVault();
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
  orders: number;
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
  return res.json();
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
  return res.json();
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
  return res.json();
}

export async function restartServer(): Promise<{
  ok: boolean;
  mode: 'supervisor' | 'self-respawn';
}> {
  const res = await apiFetch('/api/system/restart', {
    method: 'POST',
  });
  return res.json();
}

export async function waitForServerHealthy(timeoutMs = 25000): Promise<boolean> {
  await new Promise((r) => setTimeout(r, 900));
  const deadline = Date.now() + timeoutMs;
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
        const data = (await res.json().catch(() => null)) as { ok?: boolean } | null;
        if (data?.ok) return true;
      }
    } catch {
      // Server still restarting
    }
    await new Promise((r) => setTimeout(r, 750));
  }
  return false;
}

export type ActivityLogLevel = 'info' | 'warn' | 'error';
export type ActivityLogCategory =
  | 'system'
  | 'device'
  | 'image'
  | 'category'
  | 'order'
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
  const res = await apiFetch(`/api/system/logs${qs ? `?${qs}` : ''}`, {
    cache: 'no-store',
    headers: { 'X-Super-Admin': 'tuananh' },
  });
  return res.json();
}

export async function clearServerActivityLogs(): Promise<void> {
  await apiFetch('/api/system/logs', {
    method: 'DELETE',
    headers: { 'X-Super-Admin': 'tuananh' },
  });
}
