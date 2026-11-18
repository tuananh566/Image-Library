import 'dotenv/config';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import fs from 'fs';
import fsp from 'fs/promises';
import multer from 'multer';
import os from 'os';
import path from 'path';
import { createServer as createViteServer } from 'vite';

interface CategoryRecord {
  id: string;
  name: string;
  description: string;
  color: string;
  order: number;
  createdAt: number;
}

interface ServerImageRecord {
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
  aspectRatioType: 'landscape' | 'portrait' | 'square';
  dominantColors: string[];
  colorFamilies: string[];
  isFavorite: boolean;
  createdAt: number;
  updatedAt: number;
  storedFile: string;
  storedThumbFile: string;
  thumbMimeType?: string;
}

interface ServerOrderSampleImage {
  id: string;
  sourceImageId?: string | null;
  title: string;
  storedFile?: string;
  mimeType?: string;
}

interface ServerOrderRecord {
  id: string;
  orderCode: string;
  customerName: string;
  customerPhone: string;
  productName: string;
  productDescription: string;
  pickupTime?: string;
  price: number;
  depositAmount?: number;
  isPaid?: boolean;
  isReady?: boolean;
  isReceived?: boolean;
  sampleImages: ServerOrderSampleImage[];
  createdAt: number;
  updatedAt: number;
}

interface VaultDataFile {
  version: number;
  seeded: boolean;
  categories: CategoryRecord[];
  images: ServerImageRecord[];
  orders?: ServerOrderRecord[];
}

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(process.cwd(), process.env.DATA_DIR || 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const THUMBS_DIR = path.join(DATA_DIR, 'thumbs');
const ORDER_IMAGES_DIR = path.join(DATA_DIR, 'order-images');
const VAULT_FILE = path.join(DATA_DIR, 'vault.json');

const MIME_EXT_MAP: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif',
  'image/svg+xml': '.svg',
  'image/bmp': '.bmp',
  'image/heic': '.heic',
  'image/heif': '.heif',
  'image/tiff': '.tiff',
};

function sanitizeId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '');
}

function getFileExt(mimeType: string, originalName?: string): string {
  const normalizedMime = (mimeType || '').toLowerCase().split(';')[0].trim();
  if (MIME_EXT_MAP[normalizedMime]) return MIME_EXT_MAP[normalizedMime];
  if (originalName) {
    const ext = path.extname(originalName).toLowerCase();
    if (/^\.[a-z0-9]{1,5}$/.test(ext)) return ext;
  }
  return '.jpg';
}

function resolveSafeChild(baseDir: string, fileName: string): string | null {
  const safeName = path.basename(fileName);
  if (!safeName || safeName === '.' || safeName === '..') return null;
  const resolved = path.resolve(baseDir, safeName);
  if (!resolved.startsWith(baseDir + path.sep) && resolved !== baseDir) return null;
  return resolved;
}

async function ensureStorageReady(): Promise<void> {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  await fsp.mkdir(UPLOADS_DIR, { recursive: true });
  await fsp.mkdir(THUMBS_DIR, { recursive: true });
  await fsp.mkdir(ORDER_IMAGES_DIR, { recursive: true });

  if (!fs.existsSync(VAULT_FILE)) {
    const initial: VaultDataFile = {
      version: 1,
      seeded: false,
      categories: [],
      images: [],
      orders: [],
    };
    await writeVaultFile(initial);
  }
}

async function readVaultFile(): Promise<VaultDataFile> {
  await ensureStorageReady();
  try {
    const raw = await fsp.readFile(VAULT_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<VaultDataFile>;
    return {
      version: 1,
      seeded: Boolean(parsed.seeded),
      categories: Array.isArray(parsed.categories) ? parsed.categories : [],
      images: Array.isArray(parsed.images) ? parsed.images : [],
      orders: Array.isArray(parsed.orders) ? parsed.orders : [],
    };
  } catch {
    return { version: 1, seeded: false, categories: [], images: [], orders: [] };
  }
}

async function writeVaultFile(data: VaultDataFile): Promise<void> {
  const tmpFile = `${VAULT_FILE}.${process.pid}.${Date.now()}.tmp`;
  await fsp.writeFile(tmpFile, JSON.stringify(data, null, 2), 'utf8');
  await fsp.rename(tmpFile, VAULT_FILE);
}

let writeQueue: Promise<unknown> = Promise.resolve();

function withVaultLock<T>(task: (vault: VaultDataFile) => Promise<{ nextVault?: VaultDataFile; result: T }>): Promise<T> {
  const next = writeQueue.then(async () => {
    const current = await readVaultFile();
    const { nextVault, result } = await task(current);
    if (nextVault) {
      await writeVaultFile(nextVault);
    }
    return result;
  });
  writeQueue = next.catch(() => {});
  return next;
}

const sseClients = new Set<Response>();

function broadcastVaultUpdated(): void {
  const payload = `data: ${JSON.stringify({ type: 'vault-updated', ts: Date.now() })}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(payload);
    } catch {
      sseClients.delete(res);
    }
  }
}

function toClientImage(rec: ServerImageRecord) {
  const { storedFile: _sf, storedThumbFile: _stf, ...rest } = rec;
  const v = rec.updatedAt || rec.createdAt || 1;
  return {
    ...rest,
    thumbnailUrl: `/api/files/thumb/${encodeURIComponent(rec.id)}?v=${v}`,
    fullUrl: `/api/files/image/${encodeURIComponent(rec.id)}?v=${v}`,
  };
}

function toClientOrder(rec: ServerOrderRecord) {
  const v = rec.updatedAt || rec.createdAt || 1;
  const price = Number(rec.price) || 0;
  const depositAmount = Math.max(0, Number(rec.depositAmount) || 0);
  const isPaid = Boolean(rec.isPaid) || (price > 0 && depositAmount >= price);
  return {
    id: rec.id,
    orderCode: rec.orderCode,
    customerName: rec.customerName,
    customerPhone: rec.customerPhone,
    productName: rec.productName,
    productDescription: rec.productDescription,
    pickupTime: String(rec.pickupTime || ''),
    price,
    depositAmount,
    isPaid,
    isReady: Boolean(rec.isReady),
    isReceived: Boolean(rec.isReceived),
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
    sampleImages: (rec.sampleImages || []).map((img) => {
      if (img.storedFile) {
        const url = `/api/files/order-image/${encodeURIComponent(img.storedFile)}?v=${v}`;
        return {
          id: img.id,
          sourceImageId: null,
          title: img.title || 'Ảnh mẫu đơn hàng',
          thumbnailUrl: url,
          fullUrl: url,
        };
      }
      const sourceId = img.sourceImageId || img.id;
      return {
        id: img.id,
        sourceImageId: sourceId,
        title: img.title || 'Ảnh mẫu',
        thumbnailUrl: `/api/files/thumb/${encodeURIComponent(sourceId)}?v=${v}`,
        fullUrl: `/api/files/image/${encodeURIComponent(sourceId)}?v=${v}`,
      };
    }),
  };
}

function base64DataUrlToBuffer(dataUrl: string): { buffer: Buffer; mimeType: string } | null {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl);
  if (!match) return null;
  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], 'base64'),
  };
}

async function startServer() {
  await ensureStorageReady();

  const app = express();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 100 * 1024 * 1024,
      fieldSize: 5 * 1024 * 1024,
    },
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Server-Sent Events for live cross-device updates
  app.get('/api/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    res.write(`data: ${JSON.stringify({ type: 'connected', ts: Date.now() })}\n\n`);

    sseClients.add(res);
    const keepAlive = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        clearInterval(keepAlive);
        sseClients.delete(res);
      }
    }, 25000);

    req.on('close', () => {
      clearInterval(keepAlive);
      sseClients.delete(res);
    });
  });

  // Read full vault metadata
  app.get('/api/vault', async (_req, res, next) => {
    try {
      const vault = await readVaultFile();
      const categories = [...vault.categories].sort(
        (a, b) => a.order - b.order || a.createdAt - b.createdAt
      );
      const images = [...vault.images]
        .sort((a, b) => b.createdAt - a.createdAt)
        .map(toClientImage);
      const nowMs = Date.now();
      const orders = [...(vault.orders || [])]
        .sort((a, b) => {
          const aMs = a.pickupTime ? new Date(a.pickupTime).getTime() : NaN;
          const bMs = b.pickupTime ? new Date(b.pickupTime).getTime() : NaN;
          const aValid = Number.isFinite(aMs);
          const bValid = Number.isFinite(bMs);
          if (!aValid && !bValid) return b.createdAt - a.createdAt;
          if (!aValid) return 1;
          if (!bValid) return -1;
          const aUpcoming = aMs >= nowMs;
          const bUpcoming = bMs >= nowMs;
          if (aUpcoming && !bUpcoming) return -1;
          if (!aUpcoming && bUpcoming) return 1;
          if (aUpcoming && bUpcoming) return aMs - bMs || b.createdAt - a.createdAt;
          return bMs - aMs || b.createdAt - a.createdAt;
        })
        .map(toClientOrder);

      res.json({
        categories,
        images,
        orders,
        seeded: vault.seeded,
      });
    } catch (err) {
      next(err);
    }
  });

  // Mark vault as seeded
  app.post('/api/vault/mark-seeded', async (_req, res, next) => {
    try {
      await withVaultLock(async (vault) => ({
        nextVault: { ...vault, seeded: true },
        result: true,
      }));
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // Serve image or thumbnail binaries
  app.get('/api/files/image/:id', async (req, res, next) => {
    try {
      const vault = await readVaultFile();
      const img = vault.images.find((i) => i.id === req.params.id);
      if (!img) {
        res.status(404).json({ error: 'Image not found' });
        return;
      }
      const filePath = resolveSafeChild(UPLOADS_DIR, img.storedFile);
      if (!filePath || !fs.existsSync(filePath)) {
        res.status(404).json({ error: 'File missing on disk' });
        return;
      }
      res.setHeader('Content-Type', img.mimeType || 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.sendFile(filePath);
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/files/thumb/:id', async (req, res, next) => {
    try {
      const vault = await readVaultFile();
      const img = vault.images.find((i) => i.id === req.params.id);
      if (!img) {
        res.status(404).json({ error: 'Image not found' });
        return;
      }
      const thumbPath = resolveSafeChild(THUMBS_DIR, img.storedThumbFile);
      if (thumbPath && fs.existsSync(thumbPath)) {
        res.setHeader('Content-Type', img.thumbMimeType || 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        res.sendFile(thumbPath);
        return;
      }
      const origPath = resolveSafeChild(UPLOADS_DIR, img.storedFile);
      if (!origPath || !fs.existsSync(origPath)) {
        res.status(404).json({ error: 'File missing on disk' });
        return;
      }
      res.setHeader('Content-Type', img.mimeType || 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.sendFile(origPath);
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/files/order-image/:fileName', async (req, res, next) => {
    try {
      const filePath = resolveSafeChild(ORDER_IMAGES_DIR, req.params.fileName);
      if (!filePath || !fs.existsSync(filePath)) {
        res.status(404).json({ error: 'Order image not found' });
        return;
      }
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.sendFile(filePath);
    } catch (err) {
      next(err);
    }
  });

  // Upload image + thumbnail + metadata
  app.post(
    '/api/images',
    upload.fields([
      { name: 'file', maxCount: 1 },
      { name: 'thumbnail', maxCount: 1 },
    ]),
    async (req, res, next) => {
      try {
        const files = req.files as Record<string, Express.Multer.File[]> | undefined;
        const mainFile = files?.file?.[0];
        if (!mainFile) {
          res.status(400).json({ error: 'Missing image file' });
          return;
        }

        const rawMeta = typeof req.body?.metadata === 'string' ? JSON.parse(req.body.metadata) : {};
        const thumbFile = files?.thumbnail?.[0];
        const safeId = sanitizeId(String(rawMeta.id || '')) || crypto.randomUUID();
        const ext = getFileExt(rawMeta.mimeType || mainFile.mimetype, rawMeta.fileName || mainFile.originalname);
        const storedFile = `${safeId}${ext}`;
        const thumbMimeType = thumbFile?.mimetype || (rawMeta.mimeType || mainFile.mimetype || 'image/jpeg');
        const thumbExt = getFileExt(thumbMimeType, thumbFile?.originalname);
        const storedThumbFile = `${safeId}${thumbExt}`;

        const origPath = resolveSafeChild(UPLOADS_DIR, storedFile);
        const thumbPath = resolveSafeChild(THUMBS_DIR, storedThumbFile);
        if (!origPath || !thumbPath) {
          res.status(400).json({ error: 'Invalid file path' });
          return;
        }

        await fsp.writeFile(origPath, mainFile.buffer);
        await fsp.writeFile(thumbPath, thumbFile ? thumbFile.buffer : mainFile.buffer);

        const now = Date.now();
        const record: ServerImageRecord = {
          id: safeId,
          title: String(rawMeta.title || 'Ảnh mẫu'),
          fileName: String(rawMeta.fileName || mainFile.originalname || `${safeId}${ext}`),
          notes: String(rawMeta.notes || ''),
          categoryId: rawMeta.categoryId ? String(rawMeta.categoryId) : null,
          tags: Array.isArray(rawMeta.tags) ? rawMeta.tags.map(String) : [],
          width: Number(rawMeta.width) || 800,
          height: Number(rawMeta.height) || 600,
          size: Number(rawMeta.size) || mainFile.size,
          mimeType: String(rawMeta.mimeType || mainFile.mimetype || 'image/jpeg'),
          aspectRatioType:
            rawMeta.aspectRatioType === 'landscape' ||
            rawMeta.aspectRatioType === 'portrait' ||
            rawMeta.aspectRatioType === 'square'
              ? rawMeta.aspectRatioType
              : 'square',
          dominantColors: Array.isArray(rawMeta.dominantColors)
            ? rawMeta.dominantColors.map(String)
            : [],
          colorFamilies: Array.isArray(rawMeta.colorFamilies)
            ? rawMeta.colorFamilies.map(String)
            : [],
          isFavorite: Boolean(rawMeta.isFavorite),
          createdAt: Number(rawMeta.createdAt) || now,
          updatedAt: Number(rawMeta.updatedAt) || now,
          storedFile,
          storedThumbFile,
          thumbMimeType,
        };

        await withVaultLock(async (vault) => {
          const filtered = vault.images.filter((i) => i.id !== record.id);
          return {
            nextVault: {
              ...vault,
              seeded: true,
              images: [record, ...filtered],
            },
            result: record,
          };
        });

        broadcastVaultUpdated();
        res.status(201).json(toClientImage(record));
      } catch (err) {
        next(err);
      }
    }
  );

  // Create new order (supports library sample image references + custom uploaded files)
  app.post(
    '/api/orders',
    upload.array('customImages', 10),
    async (req, res, next) => {
      try {
        const rawMeta = typeof req.body?.metadata === 'string' ? JSON.parse(req.body.metadata) : req.body || {};
        const customerName = String(rawMeta.customerName || '').trim();
        const customerPhone = String(rawMeta.customerPhone || '').trim();
        const productName = String(rawMeta.productName || '').trim();
        const productDescription = String(rawMeta.productDescription || '').trim();
        const pickupTime = String(rawMeta.pickupTime || '').trim();
        const price = Math.max(0, Number(rawMeta.price) || 0);
        const depositAmount = Math.max(0, Number(rawMeta.depositAmount) || 0);
        const isPaid = price > 0 && depositAmount >= price;

        if (!customerName || !customerPhone || !productName) {
          res.status(400).json({ error: 'Vui lòng nhập tên khách hàng, số điện thoại và tên sản phẩm' });
          return;
        }

        const sampleImages: ServerOrderSampleImage[] = [];

        if (Array.isArray(rawMeta.libraryImages)) {
          for (const item of rawMeta.libraryImages) {
            if (!item || !item.imageId) continue;
            const imageId = String(item.imageId);
            sampleImages.push({
              id: `lib-${imageId}-${crypto.randomUUID().slice(0, 6)}`,
              sourceImageId: imageId,
              title: String(item.title || 'Ảnh mẫu thư viện'),
            });
          }
        }

        const uploadedFiles = Array.isArray(req.files) ? (req.files as Express.Multer.File[]) : [];
        for (const file of uploadedFiles) {
          const fileId = crypto.randomUUID();
          const ext = getFileExt(file.mimetype, file.originalname);
          const storedFile = `${fileId}${ext}`;
          const destPath = resolveSafeChild(ORDER_IMAGES_DIR, storedFile);
          if (!destPath) continue;
          await fsp.writeFile(destPath, file.buffer);
          sampleImages.push({
            id: fileId,
            sourceImageId: null,
            title: path.basename(file.originalname || 'Ảnh mẫu', ext) || 'Ảnh mẫu tải lên',
            storedFile,
            mimeType: file.mimetype || 'image/jpeg',
          });
        }

        const now = Date.now();
        const orderId = crypto.randomUUID();

        const created = await withVaultLock(async (vault) => {
          const existingOrders = vault.orders || [];
          const nextNum = existingOrders.length + 1;
          const orderCode = `DH-${String(nextNum).padStart(4, '0')}`;
          const record: ServerOrderRecord = {
            id: orderId,
            orderCode,
            customerName,
            customerPhone,
            productName,
            productDescription,
            pickupTime,
            price,
            depositAmount,
            isPaid,
            isReady: Boolean(rawMeta.isReady),
            isReceived: Boolean(rawMeta.isReceived),
            sampleImages,
            createdAt: now,
            updatedAt: now,
          };
          return {
            nextVault: {
              ...vault,
              orders: [record, ...existingOrders],
            },
            result: record,
          };
        });

        broadcastVaultUpdated();
        res.status(201).json(toClientOrder(created));
      } catch (err) {
        next(err);
      }
    }
  );

  // Full edit order (supports updating all fields + adding/removing sample images)
  app.put(
    '/api/orders/:id',
    upload.array('customImages', 10),
    async (req, res, next) => {
      try {
        const orderId = req.params.id;
        const rawMeta = typeof req.body?.metadata === 'string' ? JSON.parse(req.body.metadata) : req.body || {};
        const customerName = String(rawMeta.customerName || '').trim();
        const customerPhone = String(rawMeta.customerPhone || '').trim();
        const productName = String(rawMeta.productName || '').trim();
        const productDescription = String(rawMeta.productDescription || '').trim();
        const pickupTime = String(rawMeta.pickupTime || '').trim();
        const price = Math.max(0, Number(rawMeta.price) || 0);
        const depositAmount = Math.max(0, Number(rawMeta.depositAmount) || 0);
        const isPaid = price > 0 && depositAmount >= price;

        if (!customerName || !customerPhone || !productName) {
          res.status(400).json({ error: 'Vui lòng nhập tên khách hàng, số điện thoại và tên sản phẩm' });
          return;
        }

        const keepCustomIds = new Set(
          Array.isArray(rawMeta.keepCustomImageIds)
            ? rawMeta.keepCustomImageIds.map(String)
            : []
        );

        const nextLibraryImages: ServerOrderSampleImage[] = [];
        if (Array.isArray(rawMeta.libraryImages)) {
          for (const item of rawMeta.libraryImages) {
            if (!item || !item.imageId) continue;
            const imageId = String(item.imageId);
            nextLibraryImages.push({
              id: `lib-${imageId}-${crypto.randomUUID().slice(0, 6)}`,
              sourceImageId: imageId,
              title: String(item.title || 'Ảnh mẫu thư viện'),
            });
          }
        }

        const newCustomImages: ServerOrderSampleImage[] = [];
        const uploadedFiles = Array.isArray(req.files) ? (req.files as Express.Multer.File[]) : [];
        for (const file of uploadedFiles) {
          const fileId = crypto.randomUUID();
          const ext = getFileExt(file.mimetype, file.originalname);
          const storedFile = `${fileId}${ext}`;
          const destPath = resolveSafeChild(ORDER_IMAGES_DIR, storedFile);
          if (!destPath) continue;
          await fsp.writeFile(destPath, file.buffer);
          newCustomImages.push({
            id: fileId,
            sourceImageId: null,
            title: path.basename(file.originalname || 'Ảnh mẫu', ext) || 'Ảnh mẫu tải lên',
            storedFile,
            mimeType: file.mimetype || 'image/jpeg',
          });
        }

        const lockResult = await withVaultLock(async (vault) => {
          const existingOrders = vault.orders || [];
          const target = existingOrders.find((o) => o.id === orderId);
          if (!target) return { result: null };

          const keptCustom = (target.sampleImages || []).filter(
            (img) => Boolean(img.storedFile) && keepCustomIds.has(img.id)
          );
          const removedCustom = (target.sampleImages || []).filter(
            (img) => Boolean(img.storedFile) && !keepCustomIds.has(img.id)
          );

          const nextOrder: ServerOrderRecord = {
            ...target,
            customerName,
            customerPhone,
            productName,
            productDescription,
            pickupTime,
            price,
            depositAmount,
            isPaid,
            isReady:
              rawMeta.isReady !== undefined
                ? Boolean(rawMeta.isReady)
                : Boolean(target.isReady),
            isReceived:
              rawMeta.isReceived !== undefined
                ? Boolean(rawMeta.isReceived)
                : Boolean(target.isReceived),
            sampleImages: [...nextLibraryImages, ...keptCustom, ...newCustomImages],
            updatedAt: Date.now(),
          };

          return {
            nextVault: {
              ...vault,
              orders: existingOrders.map((o) => (o.id === orderId ? nextOrder : o)),
            },
            result: { nextOrder, removedCustom },
          };
        });

        if (!lockResult) {
          res.status(404).json({ error: 'Order not found' });
          return;
        }

        await Promise.all(
          lockResult.removedCustom
            .filter((img) => img.storedFile)
            .map((img) => {
              const p = resolveSafeChild(ORDER_IMAGES_DIR, img.storedFile!);
              return p ? fsp.unlink(p).catch(() => {}) : Promise.resolve();
            })
        );

        broadcastVaultUpdated();
        res.json(toClientOrder(lockResult.nextOrder));
      } catch (err) {
        next(err);
      }
    }
  );

  // JSON routes
  app.use('/api', express.json({ limit: '100mb' }));

  // Update order (e.g. mark paid or update deposit/pickupTime)
  app.patch('/api/orders/:id', async (req, res, next) => {
    try {
      const orderId = req.params.id;
      const patch = req.body as Partial<{
        pickupTime: string;
        price: number;
        depositAmount: number;
        isPaid: boolean;
        isReady: boolean;
        isReceived: boolean;
      }>;

      const updated = await withVaultLock(async (vault) => {
        const existingOrders = vault.orders || [];
        const target = existingOrders.find((o) => o.id === orderId);
        if (!target) return { result: null };

        const nextPrice =
          patch.price !== undefined ? Math.max(0, Number(patch.price) || 0) : Number(target.price) || 0;
        const nextDeposit =
          patch.depositAmount !== undefined
            ? Math.max(0, Number(patch.depositAmount) || 0)
            : Math.max(0, Number(target.depositAmount) || 0);
        const nextIsPaid =
          patch.isPaid !== undefined
            ? Boolean(patch.isPaid)
            : nextPrice > 0 && nextDeposit >= nextPrice;

        const nextOrder: ServerOrderRecord = {
          ...target,
          ...(patch.pickupTime !== undefined ? { pickupTime: String(patch.pickupTime) } : {}),
          ...(patch.isReady !== undefined ? { isReady: Boolean(patch.isReady) } : {}),
          ...(patch.isReceived !== undefined ? { isReceived: Boolean(patch.isReceived) } : {}),
          price: nextPrice,
          depositAmount: nextDeposit,
          isPaid: nextIsPaid,
          updatedAt: Date.now(),
        };

        return {
          nextVault: {
            ...vault,
            orders: existingOrders.map((o) => (o.id === orderId ? nextOrder : o)),
          },
          result: nextOrder,
        };
      });

      if (!updated) {
        res.status(404).json({ error: 'Order not found' });
        return;
      }

      broadcastVaultUpdated();
      res.json(toClientOrder(updated));
    } catch (err) {
      next(err);
    }
  });

  // Delete order & clean up any custom uploaded order images
  app.delete('/api/orders/:id', async (req, res, next) => {
    try {
      const orderId = req.params.id;
      const removed = await withVaultLock(async (vault) => {
        const existingOrders = vault.orders || [];
        const target = existingOrders.find((o) => o.id === orderId) || null;
        return {
          nextVault: {
            ...vault,
            orders: existingOrders.filter((o) => o.id !== orderId),
          },
          result: target,
        };
      });

      if (removed) {
        await Promise.all(
          (removed.sampleImages || [])
            .filter((img) => img.storedFile)
            .map((img) => {
              const p = resolveSafeChild(ORDER_IMAGES_DIR, img.storedFile!);
              return p ? fsp.unlink(p).catch(() => {}) : Promise.resolve();
            })
        );
      }

      broadcastVaultUpdated();
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // Upsert category
  app.post('/api/categories', async (req, res, next) => {
    try {
      const body = req.body as Partial<CategoryRecord>;
      if (!body || !body.id || !body.name) {
        res.status(400).json({ error: 'Invalid category payload' });
        return;
      }

      const category: CategoryRecord = {
        id: String(body.id),
        name: String(body.name).trim(),
        description: String(body.description || ''),
        color: String(body.color || '#2563EB'),
        order: Number.isFinite(body.order) ? Number(body.order) : 0,
        createdAt: Number(body.createdAt) || Date.now(),
      };

      await withVaultLock(async (vault) => {
        const exists = vault.categories.some((c) => c.id === category.id);
        const categories = exists
          ? vault.categories.map((c) => (c.id === category.id ? category : c))
          : [...vault.categories, category];
        return {
          nextVault: { ...vault, seeded: true, categories },
          result: category,
        };
      });

      broadcastVaultUpdated();
      res.json(category);
    } catch (err) {
      next(err);
    }
  });

  // Delete category & unassign its images
  app.delete('/api/categories/:id', async (req, res, next) => {
    try {
      const catId = req.params.id;
      await withVaultLock(async (vault) => {
        const now = Date.now();
        return {
          nextVault: {
            ...vault,
            categories: vault.categories.filter((c) => c.id !== catId),
            images: vault.images.map((img) =>
              img.categoryId === catId ? { ...img, categoryId: null, updatedAt: now } : img
            ),
          },
          result: true,
        };
      });

      broadcastVaultUpdated();
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // Update image metadata
  app.patch('/api/images/:id', async (req, res, next) => {
    try {
      const id = req.params.id;
      const patch = req.body as Partial<{
        title: string;
        notes: string;
        categoryId: string | null;
        tags: string[];
        isFavorite: boolean;
      }>;

      const updated = await withVaultLock(async (vault) => {
        const existing = vault.images.find((i) => i.id === id);
        if (!existing) return { result: null };

        const nextImg: ServerImageRecord = {
          ...existing,
          ...(patch.title !== undefined ? { title: String(patch.title) } : {}),
          ...(patch.notes !== undefined ? { notes: String(patch.notes) } : {}),
          ...(patch.categoryId !== undefined
            ? { categoryId: patch.categoryId ? String(patch.categoryId) : null }
            : {}),
          ...(patch.tags !== undefined && Array.isArray(patch.tags)
            ? { tags: patch.tags.map(String) }
            : {}),
          ...(patch.isFavorite !== undefined ? { isFavorite: Boolean(patch.isFavorite) } : {}),
          updatedAt: Date.now(),
        };

        return {
          nextVault: {
            ...vault,
            images: vault.images.map((i) => (i.id === id ? nextImg : i)),
          },
          result: nextImg,
        };
      });

      if (!updated) {
        res.status(404).json({ error: 'Image not found' });
        return;
      }

      broadcastVaultUpdated();
      res.json(toClientImage(updated));
    } catch (err) {
      next(err);
    }
  });

  // Batch update images
  app.post('/api/images/batch-update', async (req, res, next) => {
    try {
      const { ids, patch } = req.body as {
        ids?: string[];
        patch?: Partial<{ categoryId: string | null; isFavorite: boolean }>;
      };
      if (!Array.isArray(ids) || !patch) {
        res.status(400).json({ error: 'Invalid batch-update payload' });
        return;
      }
      const idSet = new Set(ids.map(String));
      const now = Date.now();

      await withVaultLock(async (vault) => ({
        nextVault: {
          ...vault,
          images: vault.images.map((img) => {
            if (!idSet.has(img.id)) return img;
            return {
              ...img,
              ...(patch.categoryId !== undefined
                ? { categoryId: patch.categoryId ? String(patch.categoryId) : null }
                : {}),
              ...(patch.isFavorite !== undefined
                ? { isFavorite: Boolean(patch.isFavorite) }
                : {}),
              updatedAt: now,
            };
          }),
        },
        result: true,
      }));

      broadcastVaultUpdated();
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // Batch delete images
  app.post('/api/images/batch-delete', async (req, res, next) => {
    try {
      const { ids } = req.body as { ids?: string[] };
      if (!Array.isArray(ids)) {
        res.status(400).json({ error: 'Invalid batch-delete payload' });
        return;
      }
      const idSet = new Set(ids.map(String));

      const deletedFiles = await withVaultLock(async (vault) => {
        const toDelete = vault.images.filter((img) => idSet.has(img.id));
        const remaining = vault.images.filter((img) => !idSet.has(img.id));
        return {
          nextVault: { ...vault, images: remaining },
          result: toDelete,
        };
      });

      await Promise.all(
        deletedFiles.flatMap((img) => {
          const ops: Array<Promise<void>> = [];
          const orig = resolveSafeChild(UPLOADS_DIR, img.storedFile);
          const thumb = resolveSafeChild(THUMBS_DIR, img.storedThumbFile);
          if (orig) ops.push(fsp.unlink(orig).catch(() => {}));
          if (thumb) ops.push(fsp.unlink(thumb).catch(() => {}));
          return ops;
        })
      );

      broadcastVaultUpdated();
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // Export backup JSON bundle from server storage
  app.get('/api/vault/backup', async (_req, res, next) => {
    try {
      const vault = await readVaultFile();
      const serializedImages = await Promise.all(
        vault.images.map(async (img) => {
          const origPath = resolveSafeChild(UPLOADS_DIR, img.storedFile);
          if (!origPath || !fs.existsSync(origPath)) return null;
          const buf = await fsp.readFile(origPath);
          const mime = img.mimeType || 'image/jpeg';
          const { storedFile: _sf, storedThumbFile: _stf, ...meta } = img;
          return {
            ...meta,
            dataUrl: `data:${mime};base64,${buf.toString('base64')}`,
          };
        })
      );

      res.json({
        version: 1,
        exportedAt: Date.now(),
        categories: vault.categories,
        images: serializedImages.filter(Boolean),
      });
    } catch (err) {
      next(err);
    }
  });

  // Restore backup JSON bundle onto server storage
  app.post('/api/vault/restore', async (req, res, next) => {
    try {
      const { mode, bundle } = req.body as {
        mode?: 'merge' | 'replace';
        bundle?: {
          categories?: CategoryRecord[];
          images?: Array<
            Partial<ServerImageRecord> & {
              dataUrl?: string;
            }
          >;
        };
      };

      if (!bundle || !Array.isArray(bundle.images)) {
        res.status(400).json({ error: 'Invalid backup payload' });
        return;
      }

      if (mode === 'replace') {
        const oldVault = await readVaultFile();
        await Promise.all(
          oldVault.images.flatMap((img) => {
            const ops: Array<Promise<void>> = [];
            const orig = resolveSafeChild(UPLOADS_DIR, img.storedFile);
            const thumb = resolveSafeChild(THUMBS_DIR, img.storedThumbFile);
            if (orig) ops.push(fsp.unlink(orig).catch(() => {}));
            if (thumb) ops.push(fsp.unlink(thumb).catch(() => {}));
            return ops;
          })
        );
      }

      const writtenImages: ServerImageRecord[] = [];
      for (const item of bundle.images) {
        if (!item.dataUrl) continue;
        const parsed = base64DataUrlToBuffer(item.dataUrl);
        if (!parsed) continue;
        const safeId = sanitizeId(String(item.id || '')) || crypto.randomUUID();
        const mimeType = item.mimeType || parsed.mimeType || 'image/jpeg';
        const ext = getFileExt(mimeType, item.fileName);
        const storedFile = `${safeId}${ext}`;
        const storedThumbFile = `${safeId}.jpg`;
        const origPath = resolveSafeChild(UPLOADS_DIR, storedFile);
        const thumbPath = resolveSafeChild(THUMBS_DIR, storedThumbFile);
        if (!origPath || !thumbPath) continue;

        await fsp.writeFile(origPath, parsed.buffer);
        await fsp.writeFile(thumbPath, parsed.buffer);

        const now = Date.now();
        writtenImages.push({
          id: safeId,
          title: String(item.title || 'Ảnh mẫu đã khôi phục'),
          fileName: String(item.fileName || `restored${ext}`),
          notes: String(item.notes || ''),
          categoryId: item.categoryId ? String(item.categoryId) : null,
          tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
          width: Number(item.width) || 800,
          height: Number(item.height) || 600,
          size: parsed.buffer.length,
          mimeType,
          aspectRatioType:
            item.aspectRatioType === 'landscape' ||
            item.aspectRatioType === 'portrait' ||
            item.aspectRatioType === 'square'
              ? item.aspectRatioType
              : 'square',
          dominantColors: Array.isArray(item.dominantColors) ? item.dominantColors.map(String) : [],
          colorFamilies: Array.isArray(item.colorFamilies) ? item.colorFamilies.map(String) : [],
          isFavorite: Boolean(item.isFavorite),
          createdAt: Number(item.createdAt) || now,
          updatedAt: now,
          storedFile,
          storedThumbFile,
        });
      }

      const incomingCats = Array.isArray(bundle.categories) ? bundle.categories : [];

      await withVaultLock(async (vault) => {
        const baseCats = mode === 'replace' ? [] : vault.categories;
        const catMap = new Map<string, CategoryRecord>(baseCats.map((c) => [c.id, c]));
        for (const cat of incomingCats) {
          if (cat && cat.id && cat.name) {
            catMap.set(String(cat.id), {
              id: String(cat.id),
              name: String(cat.name),
              description: String(cat.description || ''),
              color: String(cat.color || '#2563EB'),
              order: Number.isFinite(cat.order) ? Number(cat.order) : catMap.size,
              createdAt: Number(cat.createdAt) || Date.now(),
            });
          }
        }

        const baseImgs = mode === 'replace' ? [] : vault.images;
        const imgMap = new Map<string, ServerImageRecord>(baseImgs.map((i) => [i.id, i]));
        for (const img of writtenImages) {
          imgMap.set(img.id, img);
        }

        return {
          nextVault: {
            version: 1,
            seeded: true,
            categories: Array.from(catMap.values()),
            images: Array.from(imgMap.values()),
          },
          result: true,
        };
      });

      broadcastVaultUpdated();
      res.json({
        importedCategories: incomingCats.length,
        importedImages: writtenImages.length,
      });
    } catch (err) {
      next(err);
    }
  });

  // Clear all server vault data
  app.delete('/api/vault', async (_req, res, next) => {
    try {
      const removed = await withVaultLock(async (vault) => ({
        nextVault: {
          version: 1,
          seeded: true,
          categories: [],
          images: [],
          orders: [],
        },
        result: { images: vault.images, orders: vault.orders || [] },
      }));

      await Promise.all([
        ...removed.images.flatMap((img) => {
          const ops: Array<Promise<void>> = [];
          const orig = resolveSafeChild(UPLOADS_DIR, img.storedFile);
          const thumb = resolveSafeChild(THUMBS_DIR, img.storedThumbFile);
          if (orig) ops.push(fsp.unlink(orig).catch(() => {}));
          if (thumb) ops.push(fsp.unlink(thumb).catch(() => {}));
          return ops;
        }),
        ...removed.orders.flatMap((order) =>
          (order.sampleImages || [])
            .filter((img) => img.storedFile)
            .map((img) => {
              const p = resolveSafeChild(ORDER_IMAGES_DIR, img.storedFile!);
              return p ? fsp.unlink(p).catch(() => {}) : Promise.resolve();
            })
        ),
      ]);

      broadcastVaultUpdated();
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // API error handler
  app.use('/api', (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof multer.MulterError) {
      const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      res.status(status).json({ error: err.message });
      return;
    }
    const message = err instanceof Error ? err.message : 'Server error';
    res.status(500).json({ error: message });
  });

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://localhost:${PORT}`);
    const nets = os.networkInterfaces();
    for (const ifaceList of Object.values(nets)) {
      if (!ifaceList) continue;
      for (const net of ifaceList) {
        if (net.family === 'IPv4' && !net.internal) {
          console.log(`Network access: http://${net.address}:${PORT}`);
        }
      }
    }
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
