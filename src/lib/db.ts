import type { Category, VaultImageRecord } from '../types/vault';
import { generateId, processImageBlob } from './imageProcessor';

const DB_NAME = 'KhoAnhLocalVault';
const DB_VERSION = 1;
const STORE_IMAGES = 'images';
const STORE_CATEGORIES = 'categories';
const SEED_FLAG_KEY = 'khoanh_seeded_v1';

let dbPromise: Promise<IDBDatabase> | null = null;

function openVaultDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_CATEGORIES)) {
        const catStore = db.createObjectStore(STORE_CATEGORIES, { keyPath: 'id' });
        catStore.createIndex('order', 'order', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_IMAGES)) {
        const imgStore = db.createObjectStore(STORE_IMAGES, { keyPath: 'id' });
        imgStore.createIndex('categoryId', 'categoryId', { unique: false });
        imgStore.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function getAllCategories(): Promise<Category[]> {
  const db = await openVaultDB();
  const tx = db.transaction(STORE_CATEGORIES, 'readonly');
  const store = tx.objectStore(STORE_CATEGORIES);
  const items = await requestToPromise<Category[]>(store.getAll());
  return items.sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
}

export async function saveCategory(category: Category): Promise<void> {
  const db = await openVaultDB();
  const tx = db.transaction(STORE_CATEGORIES, 'readwrite');
  tx.objectStore(STORE_CATEGORIES).put(category);
  await transactionDone(tx);
}

export async function deleteCategoryAndReassign(categoryId: string): Promise<void> {
  const db = await openVaultDB();
  const tx = db.transaction([STORE_CATEGORIES, STORE_IMAGES], 'readwrite');
  tx.objectStore(STORE_CATEGORIES).delete(categoryId);

  const imgStore = tx.objectStore(STORE_IMAGES);
  const allImgs = await requestToPromise<VaultImageRecord[]>(imgStore.getAll());
  for (const img of allImgs) {
    if (img.categoryId === categoryId) {
      imgStore.put({ ...img, categoryId: null, updatedAt: Date.now() });
    }
  }
  await transactionDone(tx);
}

export async function getAllImages(): Promise<VaultImageRecord[]> {
  const db = await openVaultDB();
  const tx = db.transaction(STORE_IMAGES, 'readonly');
  const items = await requestToPromise<VaultImageRecord[]>(
    tx.objectStore(STORE_IMAGES).getAll()
  );
  return items.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getImageById(id: string): Promise<VaultImageRecord | undefined> {
  const db = await openVaultDB();
  const tx = db.transaction(STORE_IMAGES, 'readonly');
  return requestToPromise<VaultImageRecord | undefined>(
    tx.objectStore(STORE_IMAGES).get(id)
  );
}

export async function saveImageRecord(record: VaultImageRecord): Promise<void> {
  const db = await openVaultDB();
  const tx = db.transaction(STORE_IMAGES, 'readwrite');
  tx.objectStore(STORE_IMAGES).put(record);
  await transactionDone(tx);
}

export async function updateImageMetadata(
  id: string,
  patch: Partial<
    Pick<VaultImageRecord, 'title' | 'notes' | 'categoryId' | 'tags' | 'isFavorite'>
  >
): Promise<VaultImageRecord | null> {
  const db = await openVaultDB();
  const tx = db.transaction(STORE_IMAGES, 'readwrite');
  const store = tx.objectStore(STORE_IMAGES);
  const existing = await requestToPromise<VaultImageRecord | undefined>(store.get(id));
  if (!existing) return null;

  const updated: VaultImageRecord = {
    ...existing,
    ...patch,
    updatedAt: Date.now(),
  };
  store.put(updated);
  await transactionDone(tx);
  return updated;
}

export async function batchUpdateImages(
  ids: string[],
  updater: (img: VaultImageRecord) => VaultImageRecord
): Promise<void> {
  const db = await openVaultDB();
  const tx = db.transaction(STORE_IMAGES, 'readwrite');
  const store = tx.objectStore(STORE_IMAGES);
  for (const id of ids) {
    const existing = await requestToPromise<VaultImageRecord | undefined>(store.get(id));
    if (existing) {
      store.put({ ...updater(existing), updatedAt: Date.now() });
    }
  }
  await transactionDone(tx);
}

export async function deleteImagesByIds(ids: string[]): Promise<void> {
  const db = await openVaultDB();
  const tx = db.transaction(STORE_IMAGES, 'readwrite');
  const store = tx.objectStore(STORE_IMAGES);
  for (const id of ids) {
    store.delete(id);
  }
  await transactionDone(tx);
}

export async function renameTagGlobally(oldTag: string, newTag: string): Promise<void> {
  const cleanNew = newTag.trim().replace(/^#/, '');
  if (!cleanNew) return;
  const db = await openVaultDB();
  const tx = db.transaction(STORE_IMAGES, 'readwrite');
  const store = tx.objectStore(STORE_IMAGES);
  const all = await requestToPromise<VaultImageRecord[]>(store.getAll());
  for (const img of all) {
    if (img.tags.includes(oldTag)) {
      const nextTags = Array.from(
        new Set(img.tags.map((t) => (t === oldTag ? cleanNew : t)))
      );
      store.put({ ...img, tags: nextTags, updatedAt: Date.now() });
    }
  }
  await transactionDone(tx);
}

export async function deleteTagGlobally(tagToRemove: string): Promise<void> {
  const db = await openVaultDB();
  const tx = db.transaction(STORE_IMAGES, 'readwrite');
  const store = tx.objectStore(STORE_IMAGES);
  const all = await requestToPromise<VaultImageRecord[]>(store.getAll());
  for (const img of all) {
    if (img.tags.includes(tagToRemove)) {
      const nextTags = img.tags.filter((t) => t !== tagToRemove);
      store.put({ ...img, tags: nextTags, updatedAt: Date.now() });
    }
  }
  await transactionDone(tx);
}

export async function clearAllVaultData(): Promise<void> {
  const db = await openVaultDB();
  const tx = db.transaction([STORE_IMAGES, STORE_CATEGORIES], 'readwrite');
  tx.objectStore(STORE_IMAGES).clear();
  tx.objectStore(STORE_CATEGORIES).clear();
  await transactionDone(tx);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function base64ToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

export interface VaultBackupBundle {
  version: number;
  exportedAt: number;
  categories: Category[];
  images: Array<
    Omit<VaultImageRecord, 'blob' | 'thumbnailBlob'> & {
      dataUrl: string;
    }
  >;
}

export async function exportVaultBackup(): Promise<VaultBackupBundle> {
  const [categories, images] = await Promise.all([getAllCategories(), getAllImages()]);
  const serializedImages = await Promise.all(
    images.map(async (img) => {
      const { blob: _b, thumbnailBlob: _tb, ...meta } = img;
      const dataUrl = await blobToBase64(img.blob);
      return { ...meta, dataUrl };
    })
  );

  return {
    version: 1,
    exportedAt: Date.now(),
    categories,
    images: serializedImages,
  };
}

export async function importVaultBackup(
  bundle: VaultBackupBundle,
  mode: 'merge' | 'replace'
): Promise<{ importedCategories: number; importedImages: number }> {
  if (mode === 'replace') {
    await clearAllVaultData();
  }

  for (const cat of bundle.categories || []) {
    await saveCategory(cat);
  }

  let imgCount = 0;
  for (const item of bundle.images || []) {
    if (!item.dataUrl) continue;
    const blob = await base64ToBlob(item.dataUrl);
    const processed = await processImageBlob(blob);
    const record: VaultImageRecord = {
      id: item.id || generateId(),
      title: item.title || 'Ảnh mẫu đã khôi phục',
      fileName: item.fileName || 'restored.jpg',
      notes: item.notes || '',
      categoryId: item.categoryId ?? null,
      tags: Array.isArray(item.tags) ? item.tags : [],
      width: item.width || processed.width,
      height: item.height || processed.height,
      size: blob.size,
      mimeType: blob.type || item.mimeType || 'image/jpeg',
      aspectRatioType: processed.aspectRatioType,
      dominantColors: item.dominantColors?.length ? item.dominantColors : processed.dominantColors,
      colorFamilies: item.colorFamilies?.length ? item.colorFamilies : processed.colorFamilies,
      isFavorite: Boolean(item.isFavorite),
      createdAt: item.createdAt || Date.now(),
      updatedAt: Date.now(),
      blob,
      thumbnailBlob: processed.thumbnailBlob,
    };
    await saveImageRecord(record);
    imgCount++;
  }

  return {
    importedCategories: (bundle.categories || []).length,
    importedImages: imgCount,
  };
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

export async function seedSampleVault(force = false): Promise<boolean> {
  if (!force && localStorage.getItem(SEED_FLAG_KEY) === '1') {
    return false;
  }

  const existingImages = await getAllImages();
  const existingCategories = await getAllCategories();
  if (!force && (existingImages.length > 0 || existingCategories.length > 0)) {
    localStorage.setItem(SEED_FLAG_KEY, '1');
    return false;
  }

  for (const cat of DEFAULT_CATEGORIES) {
    await saveCategory(cat);
  }

  for (const item of SAMPLE_SEED_ITEMS) {
    try {
      const response = await fetch(item.assetUrl);
      if (!response.ok) continue;
      const blob = await response.blob();
      const processed = await processImageBlob(blob);
      const now = Date.now() - item.offsetMs;
      const record: VaultImageRecord = {
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
      };
      await saveImageRecord(record);
    } catch {
      // Skip if asset unavailable
    }
  }

  localStorage.setItem(SEED_FLAG_KEY, '1');
  return true;
}
