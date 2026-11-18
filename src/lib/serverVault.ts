import type { Category, OrderRecord, VaultImageRecord, VaultImageView } from '../types/vault';
import { getAllCategories, getAllImages, type VaultBackupBundle } from './db';
import { processImageBlob } from './imageProcessor';

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

async function assertOk(res: Response): Promise<Response> {
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res;
}

export async function fetchServerVault(): Promise<ServerVaultResponse> {
  const res = await assertOk(await fetch('/api/vault', { cache: 'no-store' }));
  return res.json();
}

export async function saveServerCategory(category: Category): Promise<Category> {
  const res = await assertOk(
    await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(category),
    })
  );
  return res.json();
}

export async function deleteServerCategory(categoryId: string): Promise<void> {
  await assertOk(
    await fetch(`/api/categories/${encodeURIComponent(categoryId)}`, {
      method: 'DELETE',
    })
  );
}

export async function uploadServerImage(record: VaultImageRecord): Promise<VaultImageView> {
  const { blob, thumbnailBlob, ...meta } = record;
  const formData = new FormData();
  formData.append('file', blob, record.fileName || 'image.jpg');
  if (thumbnailBlob) {
    formData.append('thumbnail', thumbnailBlob, 'thumb.jpg');
  }
  formData.append('metadata', JSON.stringify(meta));

  const res = await assertOk(
    await fetch('/api/images', {
      method: 'POST',
      body: formData,
    })
  );
  return res.json();
}

export async function updateServerImageMetadata(
  id: string,
  patch: Partial<Pick<VaultImageRecord, 'title' | 'notes' | 'categoryId' | 'tags' | 'isFavorite'>>
): Promise<VaultImageView> {
  const res = await assertOk(
    await fetch(`/api/images/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
  );
  return res.json();
}

export async function batchUpdateServerImages(
  ids: string[],
  patch: Partial<Pick<VaultImageRecord, 'categoryId' | 'isFavorite'>>
): Promise<void> {
  await assertOk(
    await fetch('/api/images/batch-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, patch }),
    })
  );
}

export async function deleteServerImages(ids: string[]): Promise<void> {
  await assertOk(
    await fetch('/api/images/batch-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    })
  );
}

export async function clearServerVault(): Promise<void> {
  await assertOk(await fetch('/api/vault', { method: 'DELETE' }));
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

  const res = await assertOk(
    await fetch('/api/orders', {
      method: 'POST',
      body: formData,
    })
  );
  return res.json();
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

  const res = await assertOk(
    await fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
      method: 'PUT',
      body: formData,
    })
  );
  return res.json();
}

export async function updateServerOrder(
  orderId: string,
  patch: Partial<Pick<OrderRecord, 'pickupTime' | 'price' | 'depositAmount' | 'isPaid' | 'isReady' | 'isReceived'>>
): Promise<OrderRecord> {
  const res = await assertOk(
    await fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
  );
  return res.json();
}

export async function deleteServerOrder(orderId: string): Promise<void> {
  await assertOk(
    await fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
      method: 'DELETE',
    })
  );
}

export async function exportServerBackup(): Promise<VaultBackupBundle> {
  const res = await assertOk(await fetch('/api/vault/backup', { cache: 'no-store' }));
  return res.json();
}

export async function importServerBackup(
  bundle: VaultBackupBundle,
  mode: 'merge' | 'replace'
): Promise<{ importedCategories: number; importedImages: number }> {
  const res = await assertOk(
    await fetch('/api/vault/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, bundle }),
    })
  );
  return res.json();
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

  await assertOk(await fetch('/api/vault/mark-seeded', { method: 'POST' }));
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
