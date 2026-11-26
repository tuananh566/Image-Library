import 'dotenv/config';
import { execFile, spawn } from 'child_process';
import crypto from 'crypto';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import fs from 'fs';
import fsp from 'fs/promises';
import type http from 'http';
import multer from 'multer';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import zlib from 'zlib';
import { createServer as createViteServer } from 'vite';

const execFileAsync = promisify(execFile);
const gzipAsync = promisify(zlib.gzip);

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
const RESTORE_STAGING_DIR = path.join(DATA_DIR, 'restore-staging');
const VAULT_FILE = path.join(DATA_DIR, 'vault.json');
const TRUSTED_DEVICES_FILE = path.join(DATA_DIR, 'trusted-devices.json');
const UPDATE_STATE_FILE = path.join(DATA_DIR, 'update-state.json');
const PRE_UPDATE_BACKUP_DIR = path.join(DATA_DIR, 'pre-update-backups');
const ACTIVITY_LOG_FILE = path.join(DATA_DIR, 'server-activity.log');
const DEFAULT_GITHUB_REPO = process.env.GITHUB_REPO || 'tuananh566/Image-Library';
const DEFAULT_GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
const DEVICE_VERIFY_CODE = process.env.DEVICE_VERIFY_CODE || '123456';
const DEVICE_TOKEN_COOKIE = 'khoanh_device_token';

interface TrustedDeviceRecord {
  id: string;
  tokenHash: string;
  label: string;
  deviceName?: string;
  systemInfo?: string;
  userAgent: string;
  fingerprint: string;
  createdAt: number;
  lastSeenAt: number;
  lastIp: string;
}

interface TrustedDevicesFile {
  version: number;
  devices: TrustedDeviceRecord[];
}

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

let storageDirsEnsured = false;
let cachedVault: VaultDataFile | null = null;
let cachedImageById = new Map<string, ServerImageRecord>();

function updateVaultCache(data: VaultDataFile): VaultDataFile {
  cachedVault = data;
  cachedImageById = new Map(data.images.map((img) => [img.id, img]));
  return data;
}

async function ensureStorageReady(): Promise<void> {
  if (!storageDirsEnsured) {
    await fsp.mkdir(DATA_DIR, { recursive: true });
    await fsp.mkdir(UPLOADS_DIR, { recursive: true });
    await fsp.mkdir(THUMBS_DIR, { recursive: true });
    await fsp.mkdir(ORDER_IMAGES_DIR, { recursive: true });
    storageDirsEnsured = true;
  }

  if (!cachedVault && !fs.existsSync(VAULT_FILE)) {
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
  if (cachedVault) {
    return cachedVault;
  }
  await ensureStorageReady();
  if (cachedVault) {
    return cachedVault;
  }
  try {
    const raw = await fsp.readFile(VAULT_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<VaultDataFile>;
    return updateVaultCache({
      version: 1,
      seeded: Boolean(parsed.seeded),
      categories: Array.isArray(parsed.categories) ? parsed.categories : [],
      images: Array.isArray(parsed.images) ? parsed.images : [],
      orders: Array.isArray(parsed.orders) ? parsed.orders : [],
    });
  } catch {
    return updateVaultCache({
      version: 1,
      seeded: false,
      categories: [],
      images: [],
      orders: [],
    });
  }
}

async function getCachedImageById(id: string): Promise<ServerImageRecord | undefined> {
  if (!cachedVault) {
    await readVaultFile();
  }
  return cachedImageById.get(id);
}

async function writeVaultFile(data: VaultDataFile): Promise<void> {
  if (!storageDirsEnsured) {
    await fsp.mkdir(DATA_DIR, { recursive: true });
    await fsp.mkdir(UPLOADS_DIR, { recursive: true });
    await fsp.mkdir(THUMBS_DIR, { recursive: true });
    await fsp.mkdir(ORDER_IMAGES_DIR, { recursive: true });
    storageDirsEnsured = true;
  }
  const tmpFile = `${VAULT_FILE}.${process.pid}.${Date.now()}.tmp`;
  await fsp.writeFile(tmpFile, JSON.stringify(data), 'utf8');
  await fsp.rename(tmpFile, VAULT_FILE);
  updateVaultCache(data);
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

function broadcastEvent(type: 'vault-updated' | 'devices-updated'): void {
  const payload = `data: ${JSON.stringify({ type, ts: Date.now() })}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(payload);
    } catch {
      sseClients.delete(res);
    }
  }
}

function broadcastVaultUpdated(): void {
  broadcastEvent('vault-updated');
}

type ActivityLogLevel = 'info' | 'warn' | 'error';
type ActivityLogCategory =
  | 'system'
  | 'device'
  | 'image'
  | 'category'
  | 'order'
  | 'backup'
  | 'github'
  | 'http';

interface ServerActivityLogEntry {
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

const SERVER_STARTED_AT = Date.now();
const SERVER_BOOT_ID = crypto.randomUUID();
const MAX_ACTIVITY_LOGS = 600;
let runningServerFileHash = '';
let activityLogs: ServerActivityLogEntry[] = [];
let activityLogWriteQueue: Promise<unknown> = Promise.resolve();

function broadcastActivityLog(entry: ServerActivityLogEntry): void {
  const payload = `data: ${JSON.stringify({ type: 'activity-log', entry, ts: Date.now() })}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(payload);
    } catch {
      sseClients.delete(res);
    }
  }
}

async function loadActivityLogs(): Promise<void> {
  try {
    await fsp.mkdir(DATA_DIR, { recursive: true });
    if (!fs.existsSync(ACTIVITY_LOG_FILE)) return;
    const raw = await fsp.readFile(ACTIVITY_LOG_FILE, 'utf8');
    const lines = raw.split('\n').filter(Boolean);
    const parsed: ServerActivityLogEntry[] = [];
    for (let i = lines.length - 1; i >= 0 && parsed.length < MAX_ACTIVITY_LOGS; i--) {
      try {
        const item = JSON.parse(lines[i]) as ServerActivityLogEntry;
        if (item && item.id && item.action && typeof item.ts === 'number') {
          parsed.push(item);
        }
      } catch {
        // Skip malformed line
      }
    }
    activityLogs = parsed;
  } catch {
    // Ignore log read errors
  }
}

function enqueueLogFileWrite(task: () => Promise<void>): void {
  activityLogWriteQueue = activityLogWriteQueue.then(task).catch(() => {});
}

function recordActivityLog(
  input: Omit<ServerActivityLogEntry, 'id' | 'ts'> & { ts?: number }
): ServerActivityLogEntry {
  const entry: ServerActivityLogEntry = {
    id: crypto.randomUUID(),
    ts: input.ts || Date.now(),
    level: input.level,
    category: input.category,
    action: input.action,
    ...(input.detail ? { detail: input.detail } : {}),
    ...(input.deviceName ? { deviceName: input.deviceName } : {}),
    ...(input.ip ? { ip: input.ip } : {}),
    ...(input.method ? { method: input.method } : {}),
    ...(input.path ? { path: input.path } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.durationMs !== undefined ? { durationMs: input.durationMs } : {}),
  };

  activityLogs.unshift(entry);
  if (activityLogs.length > MAX_ACTIVITY_LOGS) {
    activityLogs.length = MAX_ACTIVITY_LOGS;
  }

  enqueueLogFileWrite(async () => {
    await fsp.mkdir(DATA_DIR, { recursive: true });
    await fsp.appendFile(ACTIVITY_LOG_FILE, `${JSON.stringify(entry)}\n`, 'utf8');
    const stat = await fsp.stat(ACTIVITY_LOG_FILE).catch(() => null);
    if (stat && stat.size > 1_500_000) {
      const recentLines = activityLogs
        .slice(0, MAX_ACTIVITY_LOGS)
        .reverse()
        .map((e) => JSON.stringify(e))
        .join('\n');
      const tmp = `${ACTIVITY_LOG_FILE}.tmp`;
      await fsp.writeFile(tmp, recentLines ? `${recentLines}\n` : '', 'utf8');
      await fsp.rename(tmp, ACTIVITY_LOG_FILE);
    }
  });

  broadcastActivityLog(entry);
  return entry;
}

async function clearActivityLogs(): Promise<void> {
  activityLogs = [];
  await new Promise<void>((resolve) => {
    enqueueLogFileWrite(async () => {
      await fsp.mkdir(DATA_DIR, { recursive: true });
      await fsp.writeFile(ACTIVITY_LOG_FILE, '', 'utf8');
      resolve();
    });
  });
}

function describeApiActivity(
  method: string,
  reqPath: string,
  status: number
): { category: ActivityLogCategory; action: string; skip?: boolean } {
  const p = reqPath.split('?')[0];

  if (
    p === '/api/health' ||
    p === '/api/events' ||
    p.startsWith('/api/files/') ||
    p === '/api/system/logs'
  ) {
    return { category: 'http', action: '', skip: true };
  }

  if (p === '/api/device/status') {
    if (status < 400) return { category: 'device', action: '', skip: true };
    return { category: 'device', action: 'Kiểm tra thiết bị thất bại' };
  }

  if (p === '/api/vault' && method === 'GET') {
    if (status < 400) return { category: 'http', action: '', skip: true };
    return { category: 'system', action: 'Tải dữ liệu kho thất bại' };
  }

  if (p === '/api/devices' && method === 'GET') {
    if (status < 400) return { category: 'device', action: '', skip: true };
  }

  if (p === '/api/device/verify') {
    return {
      category: 'device',
      action: status >= 400 ? 'Xác thực thiết bị thất bại' : 'Xác thực thiết bị mới',
    };
  }
  if (p === '/api/device/logout') {
    return { category: 'device', action: 'Quên / đăng xuất thiết bị' };
  }
  if (p.startsWith('/api/devices/')) {
    if (method === 'DELETE') return { category: 'device', action: 'Thu hồi quyền thiết bị' };
    if (method === 'PATCH') return { category: 'device', action: 'Đổi tên thiết bị' };
  }

  if (p === '/api/images' && method === 'POST') {
    return { category: 'image', action: 'Tải lên ảnh mẫu' };
  }
  if (p === '/api/images/batch' && method === 'POST') {
    return { category: 'image', action: 'Tải lên hàng loạt ảnh mẫu' };
  }
  if (p === '/api/images/batch-update') {
    return { category: 'image', action: 'Cập nhật hàng loạt ảnh' };
  }
  if (p === '/api/images/batch-delete') {
    return { category: 'image', action: 'Xóa ảnh mẫu' };
  }
  if (p.startsWith('/api/images/') && method === 'PATCH') {
    return { category: 'image', action: 'Cập nhật thông tin ảnh' };
  }

  if (p === '/api/categories' && method === 'POST') {
    return { category: 'category', action: 'Lưu danh mục / album' };
  }
  if (p === '/api/categories/reorder') {
    return { category: 'category', action: 'Sắp xếp thứ tự danh mục' };
  }
  if (p === '/api/categories/batch-delete' || (p.startsWith('/api/categories/') && method === 'DELETE')) {
    return { category: 'category', action: 'Xóa danh mục / album' };
  }

  if (p === '/api/orders' && method === 'POST') {
    return { category: 'order', action: 'Tạo đơn hàng mới' };
  }
  if (p.startsWith('/api/orders/') && (method === 'PUT' || method === 'PATCH')) {
    return { category: 'order', action: 'Cập nhật đơn hàng' };
  }
  if (p.startsWith('/api/orders/') && method === 'DELETE') {
    return { category: 'order', action: 'Xóa đơn hàng' };
  }

  if (p === '/api/vault/backup') {
    return { category: 'backup', action: 'Xuất tệp sao lưu JSON' };
  }
  if (p === '/api/vault/restore/begin') {
    return { category: 'backup', action: 'Bắt đầu khôi phục sao lưu' };
  }
  if (p === '/api/vault/restore/batch') {
    if (status < 400) return { category: 'backup', action: '', skip: true };
    return { category: 'backup', action: 'Lỗi tải lô ảnh khôi phục' };
  }
  if (p === '/api/vault/restore/commit') {
    return { category: 'backup', action: 'Hoàn tất khôi phục sao lưu' };
  }
  if (p === '/api/vault/restore/abort') {
    return { category: 'backup', action: 'Hủy phiên khôi phục sao lưu' };
  }
  if (p === '/api/vault/restore') {
    return { category: 'backup', action: 'Khôi phục sao lưu JSON' };
  }
  if (p === '/api/vault/mark-seeded') {
    return { category: 'backup', action: 'Nạp dữ liệu mẫu ban đầu' };
  }
  if (p === '/api/vault' && method === 'DELETE') {
    return { category: 'backup', action: 'Xóa toàn bộ dữ liệu kho' };
  }

  if (p === '/api/system/github-status') {
    return { category: 'github', action: 'Kiểm tra cập nhật từ GitHub' };
  }
  if (p === '/api/system/github-config') {
    return { category: 'github', action: 'Lưu cấu hình repository GitHub' };
  }
  if (p === '/api/system/github-update') {
    return { category: 'github', action: 'Cập nhật mã nguồn từ GitHub' };
  }
  if (p === '/api/system/restart') {
    return { category: 'system', action: 'Khởi động lại tiến trình Server' };
  }

  return { category: 'http', action: `${method} ${p}` };
}

let cachedDevicesByHash = new Map<string, TrustedDeviceRecord>();
let devicesWriteQueue: Promise<unknown> = Promise.resolve();

function hashDeviceToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function refreshDevicesCache(devices: TrustedDeviceRecord[]): void {
  cachedDevicesByHash = new Map(devices.map((d) => [d.tokenHash, d]));
}

async function readTrustedDevicesFile(): Promise<TrustedDevicesFile> {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  if (!fs.existsSync(TRUSTED_DEVICES_FILE)) {
    const initial: TrustedDevicesFile = { version: 1, devices: [] };
    await writeTrustedDevicesFile(initial);
    return initial;
  }
  try {
    const raw = await fsp.readFile(TRUSTED_DEVICES_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<TrustedDevicesFile>;
    const devices = Array.isArray(parsed.devices) ? parsed.devices : [];
    refreshDevicesCache(devices);
    return { version: 1, devices };
  } catch {
    refreshDevicesCache([]);
    return { version: 1, devices: [] };
  }
}

async function writeTrustedDevicesFile(data: TrustedDevicesFile): Promise<void> {
  const tmpFile = `${TRUSTED_DEVICES_FILE}.${process.pid}.${Date.now()}.tmp`;
  await fsp.writeFile(tmpFile, JSON.stringify(data, null, 2), 'utf8');
  await fsp.rename(tmpFile, TRUSTED_DEVICES_FILE);
  refreshDevicesCache(data.devices);
}

function withDevicesLock<T>(
  task: (file: TrustedDevicesFile) => Promise<{ nextFile?: TrustedDevicesFile; result: T }>
): Promise<T> {
  const next = devicesWriteQueue.then(async () => {
    const current = await readTrustedDevicesFile();
    const { nextFile, result } = await task(current);
    if (nextFile) {
      await writeTrustedDevicesFile(nextFile);
    }
    return result;
  });
  devicesWriteQueue = next.catch(() => {});
  return next;
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    try {
      out[key] = decodeURIComponent(val);
    } catch {
      out[key] = val;
    }
  }
  return out;
}

function extractDeviceToken(req: Request): string {
  const headerToken = req.header('x-device-token');
  if (typeof headerToken === 'string' && headerToken.trim()) {
    return headerToken.trim();
  }
  if (typeof req.query?.dt === 'string' && req.query.dt.trim()) {
    return req.query.dt.trim();
  }
  const cookies = parseCookies(req.headers.cookie);
  return (cookies[DEVICE_TOKEN_COOKIE] || '').trim();
}

function detectDeviceLabel(userAgent: string, customLabel?: string): string {
  const trimmedCustom = String(customLabel || '').trim().slice(0, 60);
  if (trimmedCustom) return trimmedCustom;

  const ua = userAgent || '';
  let osName = 'Thiết bị';
  if (/iPhone/i.test(ua)) osName = 'iPhone';
  else if (/iPad/i.test(ua)) osName = 'iPad';
  else if (/Android/i.test(ua)) osName = 'Android';
  else if (/Mac OS X|Macintosh/i.test(ua)) osName = 'Mac';
  else if (/Windows/i.test(ua)) osName = 'Windows';
  else if (/Linux/i.test(ua)) osName = 'Linux';

  let browserName = 'Trình duyệt';
  if (/Edg\//i.test(ua)) browserName = 'Edge';
  else if (/OPR\/|Opera/i.test(ua)) browserName = 'Opera';
  else if (/CriOS|Chrome/i.test(ua)) browserName = 'Chrome';
  else if (/FxiOS|Firefox/i.test(ua)) browserName = 'Firefox';
  else if (/Safari/i.test(ua)) browserName = 'Safari';

  return `${osName} · ${browserName}`;
}

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return String(first || req.socket.remoteAddress || '')
    .split(',')[0]
    .trim();
}

function verifyCodeMatch(input: string): boolean {
  const expected = Buffer.from(DEVICE_VERIFY_CODE, 'utf8');
  const actual = Buffer.from(input, 'utf8');
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

function setDeviceTokenCookie(req: Request, res: Response, token: string): void {
  const isHttps =
    req.secure ||
    String(req.headers['x-forwarded-proto'] || '')
      .toLowerCase()
      .includes('https');
  const parts = [
    `${DEVICE_TOKEN_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${60 * 60 * 24 * 365}`,
    isHttps ? 'SameSite=None' : 'SameSite=Lax',
  ];
  if (isHttps) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearDeviceTokenCookie(req: Request, res: Response): void {
  const isHttps =
    req.secure ||
    String(req.headers['x-forwarded-proto'] || '')
      .toLowerCase()
      .includes('https');
  const parts = [
    `${DEVICE_TOKEN_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'Max-Age=0',
    isHttps ? 'SameSite=None' : 'SameSite=Lax',
  ];
  if (isHttps) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function isGenericDeviceLabel(label: string): boolean {
  return /^(Thiết bị|iPhone|iPad|Android|Mac|Windows|Linux)\s*·\s*(Trình duyệt|Edge|Opera|Chrome|Firefox|Safari)$/i.test(
    label.trim()
  );
}

function toPublicDevice(rec: TrustedDeviceRecord, currentDeviceId?: string) {
  const systemInfo = rec.systemInfo || detectDeviceLabel(rec.userAgent);
  const deviceName = (rec.deviceName || rec.label || systemInfo).trim();
  return {
    id: rec.id,
    label: deviceName,
    deviceName,
    systemInfo,
    createdAt: rec.createdAt,
    lastSeenAt: rec.lastSeenAt,
    isCurrent: rec.id === currentDeviceId,
  };
}

const verifyFailuresByIp = new Map<string, { count: number; resetAt: number }>();

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
  const match = /^data:([^;,]+)?(?:;[^,]*)?;base64,(.+)$/is.exec(dataUrl.trim());
  if (match) {
    return {
      mimeType: (match[1] || 'image/jpeg').trim(),
      buffer: Buffer.from(match[2].replace(/\s+/g, ''), 'base64'),
    };
  }
  const plainMatch = /^data:([^;,]+)?(?:;[^,]*)?,(.*)$/is.exec(dataUrl.trim());
  if (plainMatch) {
    return {
      mimeType: (plainMatch[1] || 'text/plain').trim(),
      buffer: Buffer.from(decodeURIComponent(plainMatch[2]), 'utf8'),
    };
  }
  return null;
}

async function writeStreamChunk(res: Response, chunk: string): Promise<void> {
  if (res.writableEnded || res.destroyed) return;
  const ok = res.write(chunk, 'utf8');
  if (!ok) {
    await new Promise<void>((resolve, reject) => {
      const onDrain = () => {
        cleanup();
        resolve();
      };
      const onClose = () => {
        cleanup();
        reject(new Error('CLIENT_DISCONNECTED'));
      };
      const cleanup = () => {
        res.off('drain', onDrain);
        res.off('close', onClose);
      };
      res.once('drain', onDrain);
      res.once('close', onClose);
    });
  }
}

async function moveFileOrCopy(srcPath: string, destPath: string): Promise<void> {
  try {
    await fsp.rename(srcPath, destPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EXDEV') {
      await fsp.copyFile(srcPath, destPath);
      await fsp.unlink(srcPath).catch(() => {});
      return;
    }
    throw err;
  }
}

interface RestoreSessionState {
  id: string;
  mode: 'merge' | 'replace';
  stagingDir: string;
  uploadsDir: string;
  thumbsDir: string;
  orderImagesDir: string;
  categories: CategoryRecord[];
  orders?: ServerOrderRecord[];
  images: ServerImageRecord[];
  orderCustomFiles: Map<string, { storedFile: string; mimeType: string }>;
  createdAt: number;
  updatedAt: number;
}

const restoreSessions = new Map<string, RestoreSessionState>();

async function cleanupExpiredRestoreSessions(): Promise<void> {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const [id, session] of restoreSessions.entries()) {
    if (session.updatedAt < cutoff) {
      restoreSessions.delete(id);
      await fsp.rm(session.stagingDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

interface UpdateStateRecord {
  repo: string;
  branch: string;
  githubToken?: string;
  lastCommitSha?: string;
  lastCommitMessage?: string;
  lastCommitDate?: string;
  updatedAt?: number;
}

interface GithubCommitInfo {
  sha: string;
  shortSha: string;
  message: string;
  date: string;
  author: string;
}

let isGithubUpdating = false;
let isRestartingServer = false;

function isValidGithubRepo(repo: string): boolean {
  return /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(repo);
}

function isValidGithubBranch(branch: string): boolean {
  return (
    /^[a-zA-Z0-9._/-]+$/.test(branch) &&
    !branch.includes('..') &&
    !branch.startsWith('/') &&
    !branch.endsWith('/')
  );
}

function parseGithubRepoFromRemote(remoteUrl: string): string | null {
  const trimmed = remoteUrl.trim();
  const httpsMatch = /github\.com\/([^/]+\/[^/]+?)(?:\.git)?\/?$/i.exec(trimmed);
  if (httpsMatch && isValidGithubRepo(httpsMatch[1])) return httpsMatch[1];
  const sshMatch = /github\.com:([^/]+\/[^/]+?)(?:\.git)?$/i.exec(trimmed);
  if (sshMatch && isValidGithubRepo(sshMatch[1])) return sshMatch[1];
  return null;
}

async function readUpdateState(): Promise<UpdateStateRecord> {
  try {
    if (!fs.existsSync(UPDATE_STATE_FILE)) {
      return { repo: DEFAULT_GITHUB_REPO, branch: DEFAULT_GITHUB_BRANCH };
    }
    const raw = await fsp.readFile(UPDATE_STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<UpdateStateRecord>;
    return {
      repo:
        parsed.repo && isValidGithubRepo(parsed.repo)
          ? parsed.repo
          : DEFAULT_GITHUB_REPO,
      branch:
        parsed.branch && isValidGithubBranch(parsed.branch)
          ? parsed.branch
          : DEFAULT_GITHUB_BRANCH,
      githubToken: typeof parsed.githubToken === 'string' ? parsed.githubToken : undefined,
      lastCommitSha: parsed.lastCommitSha,
      lastCommitMessage: parsed.lastCommitMessage,
      lastCommitDate: parsed.lastCommitDate,
      updatedAt: parsed.updatedAt,
    };
  } catch {
    return { repo: DEFAULT_GITHUB_REPO, branch: DEFAULT_GITHUB_BRANCH };
  }
}

async function writeUpdateState(state: UpdateStateRecord): Promise<void> {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  const tmpFile = `${UPDATE_STATE_FILE}.${process.pid}.${Date.now()}.tmp`;
  await fsp.writeFile(tmpFile, JSON.stringify(state, null, 2), { encoding: 'utf8', mode: 0o600 });
  await fsp.rename(tmpFile, UPDATE_STATE_FILE);
}

function getEffectiveGithubToken(savedState: UpdateStateRecord): {
  token: string;
  source: 'env' | 'saved' | 'none';
} {
  const envToken = (process.env.GITHUB_TOKEN || '').trim();
  if (envToken) return { token: envToken, source: 'env' };
  const savedToken = (savedState.githubToken || '').trim();
  if (savedToken) return { token: savedToken, source: 'saved' };
  return { token: '', source: 'none' };
}

async function hashFileIfExists(filePath: string): Promise<string> {
  try {
    const buf = await fsp.readFile(filePath);
    return crypto.createHash('sha256').update(buf).digest('hex');
  } catch {
    return '';
  }
}

async function detectLocalRepoState(overrideRepo?: string, overrideBranch?: string) {
  const cwd = process.cwd();
  const hasGit = fs.existsSync(path.join(cwd, '.git'));
  const saved = await readUpdateState();

  let repo = saved.repo || DEFAULT_GITHUB_REPO;
  let branch = saved.branch || DEFAULT_GITHUB_BRANCH;
  let currentCommit: GithubCommitInfo | null = saved.lastCommitSha
    ? {
        sha: saved.lastCommitSha,
        shortSha: saved.lastCommitSha.slice(0, 7),
        message: saved.lastCommitMessage || '',
        date: saved.lastCommitDate || '',
        author: '',
      }
    : null;

  if (hasGit) {
    try {
      const { stdout: remoteOut } = await execFileAsync(
        'git',
        ['remote', 'get-url', 'origin'],
        { cwd, timeout: 5000 }
      );
      const parsedRepo = parseGithubRepoFromRemote(remoteOut);
      if (parsedRepo) repo = parsedRepo;
    } catch {
      // Ignore if origin is not set
    }

    try {
      const { stdout: branchOut } = await execFileAsync(
        'git',
        ['rev-parse', '--abbrev-ref', 'HEAD'],
        { cwd, timeout: 5000 }
      );
      const b = branchOut.trim();
      if (b && b !== 'HEAD' && isValidGithubBranch(b)) {
        branch = b;
      }
    } catch {
      // Ignore
    }

    try {
      const { stdout: logOut } = await execFileAsync(
        'git',
        ['log', '-1', '--format=%H||%s||%cI||%an'],
        { cwd, timeout: 5000 }
      );
      const [sha, message, date, author] = logOut.trim().split('||');
      if (sha) {
        currentCommit = {
          sha,
          shortSha: sha.slice(0, 7),
          message: message || '',
          date: date || '',
          author: author || '',
        };
      }
    } catch {
      // Ignore
    }
  }

  if (overrideRepo && overrideRepo.trim()) {
    const cleanRepo = overrideRepo.trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '').replace(/\/+$/, '');
    if (!isValidGithubRepo(cleanRepo)) {
      throw new Error('Tên repository GitHub không hợp lệ (định dạng: owner/repo).');
    }
    repo = cleanRepo;
  }

  if (overrideBranch && overrideBranch.trim()) {
    const cleanBranch = overrideBranch.trim();
    if (!isValidGithubBranch(cleanBranch)) {
      throw new Error('Tên nhánh (branch) không hợp lệ.');
    }
    branch = cleanBranch;
  }

  return {
    hasGit,
    repo,
    branch,
    currentCommit,
    savedState: saved,
  };
}

async function fetchLatestGithubCommit(
  repo: string,
  branch: string,
  token?: string
): Promise<GithubCommitInfo> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'KhoAnh-Server-Updater',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(
    `https://api.github.com/repos/${repo}/commits/${encodeURIComponent(branch)}`,
    { headers }
  );
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    if (res.status === 404) {
      throw new Error(
        token
          ? `Không tìm thấy repo "${repo}" hoặc nhánh "${branch}" (hoặc Token chưa có quyền đọc repo này).`
          : `Không tìm thấy repo "${repo}" hoặc nhánh "${branch}". Nếu repo đang để Private, hãy thêm GitHub Token.`
      );
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error('GitHub Token không hợp lệ, đã hết hạn hoặc thiếu quyền đọc repo (Contents: Read-only).');
    }
    throw new Error(`Không thể kết nối GitHub (${res.status}): ${errBody.slice(0, 140)}`);
  }

  const data = (await res.json()) as {
    sha?: string;
    commit?: {
      message?: string;
      author?: { name?: string; date?: string };
      committer?: { date?: string };
    };
  };
  const sha = String(data.sha || '');
  if (!sha) {
    throw new Error('Phản hồi từ GitHub không có mã commit hợp lệ.');
  }
  const fullMsg = String(data.commit?.message || '');
  return {
    sha,
    shortSha: sha.slice(0, 7),
    message: fullMsg.split('\n')[0] || '',
    date: String(data.commit?.committer?.date || data.commit?.author?.date || ''),
    author: String(data.commit?.author?.name || ''),
  };
}

async function createPreUpdateDataSnapshot(): Promise<void> {
  await ensureStorageReady();
  await fsp.mkdir(PRE_UPDATE_BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const snapDir = path.join(PRE_UPDATE_BACKUP_DIR, stamp);
  await fsp.mkdir(snapDir, { recursive: true });

  await withVaultLock(async (vault) => {
    await fsp.writeFile(
      path.join(snapDir, 'vault.json'),
      JSON.stringify(vault, null, 2),
      'utf8'
    );
    return { result: true };
  });

  await withDevicesLock(async (devicesFile) => {
    await fsp.writeFile(
      path.join(snapDir, 'trusted-devices.json'),
      JSON.stringify(devicesFile, null, 2),
      'utf8'
    );
    return { result: true };
  });

  // Keep only the 3 most recent snapshots
  const entries = await fsp.readdir(PRE_UPDATE_BACKUP_DIR, { withFileTypes: true });
  const dirs = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
    .reverse();
  for (const oldDir of dirs.slice(3)) {
    await fsp.rm(path.join(PRE_UPDATE_BACKUP_DIR, oldDir), { recursive: true, force: true }).catch(() => {});
  }
}

function getProtectedRootNames(cwd: string): Set<string> {
  const protectedNames = new Set<string>([
    '.git',
    'node_modules',
    'data',
    'dist',
    '.env',
    '.env.local',
    '.env.development',
    '.env.production',
  ]);
  const relData = path.relative(cwd, DATA_DIR);
  if (relData && !relData.startsWith('..') && !path.isAbsolute(relData)) {
    const topSegment = relData.split(path.sep)[0];
    if (topSegment) protectedNames.add(topSegment);
  }
  return protectedNames;
}

function isProtectedEnvFile(name: string): boolean {
  return name === '.env' || (name.startsWith('.env.') && name !== '.env.example');
}

async function syncDirectoryContents(
  srcDir: string,
  destDir: string,
  pruneDeleted: boolean,
  protectedNames?: Set<string>
): Promise<void> {
  await fsp.mkdir(destDir, { recursive: true });
  const srcEntries = await fsp.readdir(srcDir, { withFileTypes: true });
  const srcNames = new Set(srcEntries.map((e) => e.name));

  if (pruneDeleted) {
    const destEntries = await fsp.readdir(destDir, { withFileTypes: true });
    for (const destEntry of destEntries) {
      if (protectedNames?.has(destEntry.name) || isProtectedEnvFile(destEntry.name)) continue;
      if (!srcNames.has(destEntry.name)) {
        await fsp.rm(path.join(destDir, destEntry.name), { recursive: true, force: true });
      }
    }
  }

  for (const entry of srcEntries) {
    if (protectedNames?.has(entry.name) || isProtectedEnvFile(entry.name)) {
      continue;
    }
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      // Mirror src/ and public/ so deleted/renamed source files don't linger
      const shouldPrune = pruneDeleted || (!protectedNames && (entry.name === 'src' || entry.name === 'public'));
      await syncDirectoryContents(srcPath, destPath, shouldPrune);
    } else if (entry.isFile()) {
      await fsp.copyFile(srcPath, destPath);
    }
  }
}

async function downloadAndApplyGithubTarball(
  repo: string,
  branch: string,
  token?: string
): Promise<void> {
  const cwd = process.cwd();
  const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'khoanh-gh-update-'));
  try {
    const headers: Record<string, string> = {
      'User-Agent': 'KhoAnh-Server-Updater',
    };
    let archiveUrl = `https://codeload.github.com/${repo}/tar.gz/refs/heads/${encodeURIComponent(branch)}`;
    if (token) {
      headers.Authorization = `Bearer ${token}`;
      headers.Accept = 'application/vnd.github+json';
      archiveUrl = `https://api.github.com/repos/${repo}/tarball/${encodeURIComponent(branch)}`;
    }

    const res = await fetch(archiveUrl, { headers, redirect: 'follow' });
    if (!res.ok) {
      throw new Error(`Không thể tải mã nguồn từ GitHub (${res.status}).`);
    }

    const arrayBuf = await res.arrayBuffer();
    const tgzPath = path.join(tempRoot, 'repo.tar.gz');
    const extractDir = path.join(tempRoot, 'extracted');
    await fsp.mkdir(extractDir, { recursive: true });
    await fsp.writeFile(tgzPath, Buffer.from(arrayBuf));

    await execFileAsync('tar', ['-xzf', tgzPath, '-C', extractDir], { timeout: 60_000 });

    const extractedEntries = await fsp.readdir(extractDir, { withFileTypes: true });
    const rootFolder = extractedEntries.find((e) => e.isDirectory());
    if (!rootFolder) {
      throw new Error('Không tìm thấy thư mục mã nguồn trong gói tải về từ GitHub.');
    }

    const sourceRoot = path.join(extractDir, rootFolder.name);
    const protectedRootNames = getProtectedRootNames(cwd);

    // Sync root files and directories without touching data/, node_modules/, .git/, dist/, or .env*
    const rootEntries = await fsp.readdir(sourceRoot, { withFileTypes: true });
    for (const entry of rootEntries) {
      if (protectedRootNames.has(entry.name) || isProtectedEnvFile(entry.name)) {
        continue;
      }
      const srcPath = path.join(sourceRoot, entry.name);
      const destPath = path.join(cwd, entry.name);
      if (entry.isDirectory()) {
        const pruneChild = entry.name === 'src' || entry.name === 'public';
        await syncDirectoryContents(srcPath, destPath, pruneChild);
      } else if (entry.isFile()) {
        await fsp.copyFile(srcPath, destPath);
      }
    }
  } finally {
    await fsp.rm(tempRoot, { recursive: true, force: true }).catch(() => {});
  }
}

async function startServer() {
  runningServerFileHash = await hashFileIfExists(path.join(process.cwd(), 'server.ts'));
  await ensureStorageReady();
  await readTrustedDevicesFile();
  await loadActivityLogs();

  const app = express();
  let httpServer: http.Server | null = null;
  let viteServer: Awaited<ReturnType<typeof createViteServer>> | null = null;
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 100 * 1024 * 1024,
      fieldSize: 5 * 1024 * 1024,
    },
  });

  // Record API activity logs
  app.use('/api', (req, res, next) => {
    const startMs = Date.now();
    const fullPath = req.originalUrl || req.url;
    res.on('finish', () => {
      const status = res.statusCode || 200;
      const meta = describeApiActivity(req.method, fullPath, status);
      if (meta.skip) return;

      const reqWithDevice = req as Request & {
        trustedDeviceName?: string;
        activityDetail?: string;
      };
      let deviceName = reqWithDevice.trustedDeviceName;
      if (!deviceName) {
        const tok = extractDeviceToken(req);
        if (tok) {
          const matched = cachedDevicesByHash.get(hashDeviceToken(tok));
          if (matched) {
            deviceName = matched.deviceName || matched.label;
          }
        }
      }

      const level: ActivityLogLevel =
        status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
      const durationMs = Date.now() - startMs;
      const cleanPath = fullPath.split('?')[0];

      recordActivityLog({
        level,
        category: meta.category,
        action: meta.action,
        detail:
          reqWithDevice.activityDetail ||
          `${req.method} ${cleanPath} → ${status} (${durationMs}ms)`,
        deviceName,
        ip: getClientIp(req),
        method: req.method,
        path: cleanPath,
        status,
        durationMs,
      });
    });
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      bootId: SERVER_BOOT_ID,
      startedAt: SERVER_STARTED_AT,
    });
  });

  // Familiar device detection & verification endpoints (allowed before device auth)
  app.post('/api/device/status', express.json({ limit: '64kb' }), async (req, res, next) => {
    try {
      const ua = String(req.headers['user-agent'] || '');
      const body = (req.body || {}) as {
        deviceLabel?: string;
        deviceModel?: string;
        systemSummary?: string;
        fingerprint?: string;
      };
      const systemSummary =
        String(body.systemSummary || '').trim().slice(0, 60) || detectDeviceLabel(ua);
      const detectedModel = String(body.deviceModel || '').trim().slice(0, 80);
      const detectedLabel =
        String(body.deviceLabel || '').trim().slice(0, 80) ||
        detectedModel ||
        systemSummary;
      const token = extractDeviceToken(req);

      if (!token) {
        res.json({
          trusted: false,
          detectedLabel,
          detectedModel: detectedModel || undefined,
          systemSummary,
          reason: 'new_device',
        });
        return;
      }

      const tokenHash = hashDeviceToken(token);
      const matched = cachedDevicesByHash.get(tokenHash);
      if (!matched) {
        clearDeviceTokenCookie(req, res);
        res.json({
          trusted: false,
          detectedLabel,
          detectedModel: detectedModel || undefined,
          systemSummary,
          reason: 'revoked_or_unknown',
        });
        return;
      }

      const now = Date.now();
      const ip = getClientIp(req);
      const needsSystemUpgrade = !matched.systemInfo && Boolean(systemSummary);
      const needsModelUpgrade =
        !matched.deviceName &&
        Boolean(detectedModel) &&
        isGenericDeviceLabel(matched.label);
      let currentRecord = matched;
      if (
        now - matched.lastSeenAt > 30_000 ||
        matched.lastIp !== ip ||
        needsSystemUpgrade ||
        needsModelUpgrade
      ) {
        currentRecord = await withDevicesLock(async (file) => {
          const found = file.devices.find((d) => d.id === matched.id);
          if (!found) return { result: matched };
          const upgradedName =
            !found.deviceName && detectedModel && isGenericDeviceLabel(found.label)
              ? detectedModel
              : found.deviceName || found.label;
          const updated: TrustedDeviceRecord = {
            ...found,
            label: upgradedName,
            deviceName: upgradedName,
            systemInfo: found.systemInfo || systemSummary,
            lastSeenAt: now,
            lastIp: ip,
            userAgent: ua || found.userAgent,
          };
          return {
            nextFile: {
              ...file,
              devices: file.devices.map((d) => (d.id === matched.id ? updated : d)),
            },
            result: updated,
          };
        });
      }

      setDeviceTokenCookie(req, res, token);
      res.json({
        trusted: true,
        detectedLabel: currentRecord.deviceName || currentRecord.label,
        detectedModel: detectedModel || currentRecord.deviceName,
        systemSummary: currentRecord.systemInfo || systemSummary,
        device: toPublicDevice(currentRecord, currentRecord.id),
      });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/device/verify', express.json({ limit: '64kb' }), async (req, res, next) => {
    try {
      const ip = getClientIp(req) || 'unknown';
      const now = Date.now();
      const failureState = verifyFailuresByIp.get(ip);
      if (failureState && failureState.resetAt > now && failureState.count >= 10) {
        res.status(429).json({
          error: 'Bạn đã nhập sai mã quá nhiều lần. Vui lòng thử lại sau ít phút.',
        });
        return;
      }

      const body = (req.body || {}) as {
        code?: string;
        deviceLabel?: string;
        deviceModel?: string;
        systemSummary?: string;
        fingerprint?: string;
      };
      const code = String(body.code || '').trim();

      if (!verifyCodeMatch(code)) {
        const nextCount =
          failureState && failureState.resetAt > now ? failureState.count + 1 : 1;
        verifyFailuresByIp.set(ip, {
          count: nextCount,
          resetAt:
            failureState && failureState.resetAt > now
              ? failureState.resetAt
              : now + 5 * 60 * 1000,
        });
        res.status(401).json({
          error: 'Mã xác nhận không đúng. Vui lòng kiểm tra lại.',
        });
        return;
      }

      verifyFailuresByIp.delete(ip);
      const ua = String(req.headers['user-agent'] || '');
      const deviceId = crypto.randomUUID();
      const rawToken = `${deviceId}.${crypto.randomBytes(24).toString('hex')}`;
      const tokenHash = hashDeviceToken(rawToken);
      const systemInfo =
        String(body.systemSummary || '').trim().slice(0, 60) || detectDeviceLabel(ua);
      const customName = String(body.deviceLabel || '').trim().slice(0, 80);
      const modelName = String(body.deviceModel || '').trim().slice(0, 80);
      const deviceName = customName || modelName || systemInfo;
      const fingerprint = String(body.fingerprint || '').slice(0, 200);

      const newRecord: TrustedDeviceRecord = {
        id: deviceId,
        tokenHash,
        label: deviceName,
        deviceName,
        systemInfo,
        userAgent: ua,
        fingerprint,
        createdAt: now,
        lastSeenAt: now,
        lastIp: ip,
      };

      await withDevicesLock(async (file) => ({
        nextFile: {
          ...file,
          devices: [newRecord, ...file.devices],
        },
        result: newRecord,
      }));

      setDeviceTokenCookie(req, res, rawToken);
      broadcastEvent('devices-updated');
      res.status(201).json({
        trusted: true,
        deviceToken: rawToken,
        device: toPublicDevice(newRecord, newRecord.id),
      });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/device/logout', async (req, res, next) => {
    try {
      const token = extractDeviceToken(req);
      if (token) {
        const tokenHash = hashDeviceToken(token);
        await withDevicesLock(async (file) => ({
          nextFile: {
            ...file,
            devices: file.devices.filter((d) => d.tokenHash !== tokenHash),
          },
          result: true,
        }));
      }
      clearDeviceTokenCookie(req, res);
      broadcastEvent('devices-updated');
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // Require familiar/verified device for all other /api/* routes
  app.use('/api', (req, res, next) => {
    const token = extractDeviceToken(req);
    if (!token) {
      res.status(401).json({
        error: 'DEVICE_NOT_TRUSTED',
        message: 'Thiết bị mới cần nhập mã xác nhận để truy cập.',
      });
      return;
    }

    const matched = cachedDevicesByHash.get(hashDeviceToken(token));
    if (!matched) {
      res.status(401).json({
        error: 'DEVICE_NOT_TRUSTED',
        message: 'Thiết bị chưa được xác nhận hoặc đã bị thu hồi quyền.',
      });
      return;
    }

    (req as Request & { trustedDeviceId?: string; trustedDeviceName?: string }).trustedDeviceId = matched.id;
    (req as Request & { trustedDeviceId?: string; trustedDeviceName?: string }).trustedDeviceName =
      matched.deviceName || matched.label;
    next();
  });

  app.get('/api/devices', async (req, res, next) => {
    try {
      const currentDeviceId = (req as Request & { trustedDeviceId?: string }).trustedDeviceId;
      const file = await readTrustedDevicesFile();
      const sorted = [...file.devices]
        .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
        .map((d) => toPublicDevice(d, currentDeviceId));
      res.json({
        currentDeviceId: currentDeviceId || null,
        devices: sorted,
      });
    } catch (err) {
      next(err);
    }
  });

  app.delete('/api/devices/:id', async (req, res, next) => {
    try {
      const targetId = req.params.id;
      const currentDeviceId = (req as Request & { trustedDeviceId?: string }).trustedDeviceId;
      await withDevicesLock(async (file) => ({
        nextFile: {
          ...file,
          devices: file.devices.filter((d) => d.id !== targetId),
        },
        result: true,
      }));
      if (targetId === currentDeviceId) {
        clearDeviceTokenCookie(req, res);
      }
      broadcastEvent('devices-updated');
      res.json({ ok: true, revokedCurrent: targetId === currentDeviceId });
    } catch (err) {
      next(err);
    }
  });

  app.patch('/api/devices/:id', express.json({ limit: '64kb' }), async (req, res, next) => {
    try {
      const targetId = req.params.id;
      const currentDeviceId = (req as Request & { trustedDeviceId?: string }).trustedDeviceId;
      const body = (req.body || {}) as { deviceName?: string };
      const nextName = String(body.deviceName || '').trim().slice(0, 80);
      if (!nextName) {
        res.status(400).json({ error: 'Tên thiết bị không được để trống.' });
        return;
      }

      const updated = await withDevicesLock(async (file) => {
        const found = file.devices.find((d) => d.id === targetId);
        if (!found) return { result: null };
        const nextRec: TrustedDeviceRecord = {
          ...found,
          label: nextName,
          deviceName: nextName,
        };
        return {
          nextFile: {
            ...file,
            devices: file.devices.map((d) => (d.id === targetId ? nextRec : d)),
          },
          result: nextRec,
        };
      });

      if (!updated) {
        res.status(404).json({ error: 'Không tìm thấy thiết bị.' });
        return;
      }

      broadcastEvent('devices-updated');
      res.json({ device: toPublicDevice(updated, currentDeviceId) });
    } catch (err) {
      next(err);
    }
  });

  // Save or clear GitHub config (repo, branch, private token) on server
  app.post('/api/system/github-config', express.json({ limit: '64kb' }), async (req, res, next) => {
    try {
      const body = (req.body || {}) as {
        repo?: string;
        branch?: string;
        githubToken?: string;
        clearToken?: boolean;
      };
      const local = await detectLocalRepoState(body.repo, body.branch);
      const nextToken = body.clearToken
        ? undefined
        : typeof body.githubToken === 'string' && body.githubToken.trim()
          ? body.githubToken.trim()
          : local.savedState.githubToken;

      const nextState: UpdateStateRecord = {
        ...local.savedState,
        repo: local.repo,
        branch: local.branch,
        ...(nextToken ? { githubToken: nextToken } : { githubToken: undefined }),
      };
      await writeUpdateState(nextState);
      const tokenInfo = getEffectiveGithubToken(nextState);
      res.json({
        ok: true,
        repo: nextState.repo,
        branch: nextState.branch,
        hasToken: Boolean(tokenInfo.token),
        tokenSource: tokenInfo.source,
      });
    } catch (err) {
      next(err);
    }
  });

  // Check GitHub update status (requires trusted device)
  app.get('/api/system/github-status', async (req, res, next) => {
    try {
      const repoParam = typeof req.query.repo === 'string' ? req.query.repo : undefined;
      const branchParam = typeof req.query.branch === 'string' ? req.query.branch : undefined;
      const local = await detectLocalRepoState(repoParam, branchParam);
      const tokenInfo = getEffectiveGithubToken(local.savedState);
      let latestCommit: GithubCommitInfo | null = null;
      let checkError: string | null = null;

      try {
        latestCommit = await fetchLatestGithubCommit(local.repo, local.branch, tokenInfo.token);
      } catch (err) {
        checkError = err instanceof Error ? err.message : 'Không thể kiểm tra GitHub.';
      }

      const [vault, devicesFile, diskServerHash] = await Promise.all([
        readVaultFile(),
        readTrustedDevicesFile(),
        hashFileIfExists(path.join(process.cwd(), 'server.ts')),
      ]);

      const hasUpdate = Boolean(
        latestCommit &&
          (!local.currentCommit || local.currentCommit.sha !== latestCommit.sha)
      );
      const serverPendingRestart = Boolean(
        runningServerFileHash && diskServerHash && runningServerFileHash !== diskServerHash
      );

      res.json({
        repo: local.repo,
        branch: local.branch,
        hasGit: local.hasGit,
        hasToken: Boolean(tokenInfo.token),
        tokenSource: tokenInfo.source,
        currentCommit: local.currentCommit,
        latestCommit,
        hasUpdate,
        serverPendingRestart,
        runningBootId: SERVER_BOOT_ID,
        checkError,
        lastUpdatedAt: local.savedState.updatedAt || null,
        preservedData: {
          images: vault.images.length,
          categories: vault.categories.length,
          orders: (vault.orders || []).length,
          devices: devicesFile.devices.length,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  // Update application code from GitHub while preserving all server data (DATA_DIR)
  app.post('/api/system/github-update', express.json({ limit: '64kb' }), async (req, res, next) => {
    if (isGithubUpdating) {
      res.status(409).json({
        error: 'Hệ thống đang thực hiện cập nhật từ GitHub. Vui lòng đợi hoàn tất.',
      });
      return;
    }

    isGithubUpdating = true;
    try {
      const body = (req.body || {}) as {
        repo?: string;
        branch?: string;
        githubToken?: string;
      };
      const local = await detectLocalRepoState(body.repo, body.branch);
      const inlineToken = typeof body.githubToken === 'string' ? body.githubToken.trim() : '';
      const tokenInfo = getEffectiveGithubToken(local.savedState);
      const effectiveToken = inlineToken || tokenInfo.token;
      const cwd = process.cwd();

      // 1. Fetch latest commit metadata from GitHub first to ensure repo/branch exist
      const latestCommit = await fetchLatestGithubCommit(local.repo, local.branch, effectiveToken);

      // 2. Snapshot vault.json and trusted-devices.json inside DATA_DIR before touching code files
      await createPreUpdateDataSnapshot();

      const pkgHashBefore = await hashFileIfExists(path.join(cwd, 'package.json'));
      const serverHashBefore = await hashFileIfExists(path.join(cwd, 'server.ts'));

      // 3. Apply code update without touching DATA_DIR (uploads, thumbs, order-images, vault.json, trusted-devices.json) or .env*
      if (local.hasGit) {
        const expectedUrl = `https://github.com/${local.repo}.git`;
        try {
          const { stdout: currentRemote } = await execFileAsync(
            'git',
            ['remote', 'get-url', 'origin'],
            { cwd, timeout: 5000 }
          );
          const currentParsed = parseGithubRepoFromRemote(currentRemote);
          if (currentParsed !== local.repo) {
            await execFileAsync('git', ['remote', 'set-url', 'origin', expectedUrl], {
              cwd,
              timeout: 5000,
            });
          }
        } catch {
          await execFileAsync('git', ['remote', 'add', 'origin', expectedUrl], {
            cwd,
            timeout: 5000,
          }).catch(() => {});
        }

        const gitFetchArgs: string[] = [];
        if (effectiveToken) {
          const basicAuth = Buffer.from(`x-access-token:${effectiveToken}`, 'utf8').toString('base64');
          gitFetchArgs.push('-c', `http.https://github.com/.extraheader=AUTHORIZATION: basic ${basicAuth}`);
        }
        gitFetchArgs.push('fetch', 'origin', local.branch);

        await execFileAsync('git', gitFetchArgs, {
          cwd,
          timeout: 60_000,
          env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
        });
        await execFileAsync('git', ['reset', '--hard', `origin/${local.branch}`], {
          cwd,
          timeout: 30_000,
        });
      } else {
        await downloadAndApplyGithubTarball(local.repo, local.branch, effectiveToken);
      }

      // 4. Reinstall npm dependencies if package.json changed
      const pkgHashAfter = await hashFileIfExists(path.join(cwd, 'package.json'));
      let npmInstalled = false;
      if (pkgHashAfter && pkgHashAfter !== pkgHashBefore) {
        await execFileAsync('npm', ['install', '--no-audit', '--no-fund'], {
          cwd,
          timeout: 180_000,
        });
        npmInstalled = true;
      }

      // 5. Rebuild dist if dist exists or running in production
      let builtDist = false;
      if (fs.existsSync(path.join(cwd, 'dist')) || process.env.NODE_ENV === 'production') {
        await execFileAsync('npm', ['run', 'build'], {
          cwd,
          timeout: 180_000,
        });
        builtDist = true;
      }

      const serverHashAfter = await hashFileIfExists(path.join(cwd, 'server.ts'));
      const serverChanged = Boolean(serverHashBefore && serverHashAfter && serverHashBefore !== serverHashAfter);

      const now = Date.now();
      await writeUpdateState({
        ...local.savedState,
        repo: local.repo,
        branch: local.branch,
        ...(inlineToken ? { githubToken: inlineToken } : {}),
        lastCommitSha: latestCommit.sha,
        lastCommitMessage: latestCommit.message,
        lastCommitDate: latestCommit.date,
        updatedAt: now,
      });

      // 6. Re-read data from DATA_DIR & refresh devices cache to verify everything is intact
      cachedVault = null;
      const [vault, devicesFile] = await Promise.all([
        readVaultFile(),
        readTrustedDevicesFile(),
      ]);

      res.json({
        ok: true,
        repo: local.repo,
        branch: local.branch,
        method: local.hasGit ? 'git' : 'tarball',
        commit: latestCommit,
        npmInstalled,
        builtDist,
        serverChanged,
        updatedAt: now,
        preservedData: {
          images: vault.images.length,
          categories: vault.categories.length,
          orders: (vault.orders || []).length,
          devices: devicesFile.devices.length,
        },
      });
    } catch (err) {
      next(err);
    } finally {
      isGithubUpdating = false;
    }
  });

  // View server activity logs (Super-admin `tuananh` mode only)
  app.get('/api/system/logs', (req, res) => {
    if (req.header('x-super-admin') !== 'tuananh') {
      res.status(403).json({
        error: 'Chức năng xem log server chỉ khả dụng khi mở khóa bằng mật khẩu đặc biệt.',
      });
      return;
    }

    const levelFilter = String(req.query.level || 'all').toLowerCase();
    const categoryFilter = String(req.query.category || 'all').toLowerCase();
    const queryFilter = String(req.query.q || '').trim().toLowerCase();
    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw)
      ? Math.min(MAX_ACTIVITY_LOGS, Math.max(10, Math.floor(limitRaw)))
      : 200;

    const filtered = activityLogs.filter((entry) => {
      if (levelFilter !== 'all' && entry.level !== levelFilter) return false;
      if (categoryFilter !== 'all' && entry.category !== categoryFilter) return false;
      if (queryFilter) {
        const hay = [
          entry.action,
          entry.detail || '',
          entry.deviceName || '',
          entry.path || '',
          entry.ip || '',
          entry.category,
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(queryFilter)) return false;
      }
      return true;
    });

    const mem = process.memoryUsage();
    res.json({
      logs: filtered.slice(0, limit),
      totalBuffered: activityLogs.length,
      serverStartedAt: SERVER_STARTED_AT,
      uptimeSec: Math.floor(process.uptime()),
      memoryMb: Math.round((mem.rss / (1024 * 1024)) * 10) / 10,
    });
  });

  app.delete('/api/system/logs', async (req, res, next) => {
    try {
      if (req.header('x-super-admin') !== 'tuananh') {
        res.status(403).json({
          error: 'Chức năng xóa log server chỉ khả dụng khi mở khóa bằng mật khẩu đặc biệt.',
        });
        return;
      }
      await clearActivityLogs();
      const reqWithDevice = req as Request & { trustedDeviceName?: string };
      recordActivityLog({
        level: 'info',
        category: 'system',
        action: 'Đã dọn sạch nhật ký hoạt động server',
        deviceName: reqWithDevice.trustedDeviceName,
        ip: getClientIp(req),
      });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // Gracefully flush pending writes, close listeners, and restart the Node server process
  app.post('/api/system/restart', (_req, res) => {
    if (isGithubUpdating) {
      res.status(409).json({
        error: 'Hệ thống đang cập nhật từ GitHub. Vui lòng đợi hoàn tất trước khi khởi động lại.',
      });
      return;
    }
    if (isRestartingServer) {
      res.status(409).json({
        error: 'Server đang trong quá trình khởi động lại.',
      });
      return;
    }

    isRestartingServer = true;
    const hasProcessManager = Boolean(
      process.env.pm_id !== undefined ||
        process.env.NODE_APP_INSTANCE !== undefined ||
        process.env.INVOCATION_ID ||
        process.env.SUPERVISOR_ENABLED ||
        fs.existsSync('/.dockerenv')
    );

    res.json({
      ok: true,
      mode: hasProcessManager ? 'supervisor' : 'self-respawn',
      bootId: SERVER_BOOT_ID,
    });

    const performRestart = async () => {
      try {
        await Promise.allSettled([writeQueue, devicesWriteQueue, activityLogWriteQueue]);

        for (const client of sseClients) {
          try {
            client.end();
          } catch {
            // Ignore closed SSE client
          }
        }
        sseClients.clear();

        if (httpServer) {
          await new Promise<void>((resolve) => {
            const safetyTimer = setTimeout(resolve, 1500);
            httpServer!.close(() => {
              clearTimeout(safetyTimer);
              resolve();
            });
            httpServer!.closeAllConnections?.();
          });
        }

        if (viteServer) {
          await Promise.race([
            viteServer.close().catch(() => {}),
            new Promise((r) => setTimeout(r, 1500)),
          ]);
        }

        if (!hasProcessManager) {
          const filteredExecArgv = process.execArgv.filter(
            (arg) => !arg.startsWith('--inspect') && !arg.startsWith('--eval')
          );
          const child = spawn(
            process.execPath,
            [...filteredExecArgv, ...process.argv.slice(1)],
            {
              cwd: process.cwd(),
              detached: true,
              stdio: 'inherit',
              env: process.env,
              windowsHide: true,
            }
          );
          child.unref();
        }
      } catch (err) {
        console.error('Error during graceful server restart:', err);
      } finally {
        process.exit(process.env.INVOCATION_ID ? 1 : 0);
      }
    };

    setTimeout(() => {
      void performRestart();
    }, 150);
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

  // Read full vault metadata (gzip-compressed when client supports it)
  app.get('/api/vault', async (req, res, next) => {
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

      const json = JSON.stringify({
        categories,
        images,
        orders,
        seeded: vault.seeded,
      });

      const acceptEncoding = String(req.headers['accept-encoding'] || '');
      if (json.length > 1024 && acceptEncoding.includes('gzip')) {
        const compressed = await gzipAsync(Buffer.from(json, 'utf8'), { level: 4 });
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Encoding', 'gzip');
        res.setHeader('Vary', 'Accept-Encoding');
        res.send(compressed);
        return;
      }

      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.send(json);
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

  // Serve image or thumbnail binaries with immutable browser caching
  app.get('/api/files/image/:id', async (req, res, next) => {
    try {
      const img = await getCachedImageById(req.params.id);
      if (!img) {
        res.status(404).json({ error: 'Image not found' });
        return;
      }
      const filePath = resolveSafeChild(UPLOADS_DIR, img.storedFile);
      if (!filePath) {
        res.status(404).json({ error: 'File missing on disk' });
        return;
      }
      res.setHeader('Content-Type', img.mimeType || 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.sendFile(
        filePath,
        { cacheControl: false, dotfiles: 'deny' },
        (err) => {
          if (err && !res.headersSent) {
            res.removeHeader('Cache-Control');
            const status = (err as NodeJS.ErrnoException).code === 'ENOENT' ? 404 : 500;
            res.status(status).json({ error: status === 404 ? 'File missing on disk' : 'File read error' });
          }
        }
      );
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/files/thumb/:id', async (req, res, next) => {
    try {
      const img = await getCachedImageById(req.params.id);
      if (!img) {
        res.status(404).json({ error: 'Image not found' });
        return;
      }
      const thumbPath = resolveSafeChild(THUMBS_DIR, img.storedThumbFile);
      const origPath = resolveSafeChild(UPLOADS_DIR, img.storedFile);

      const sendOrigFallback = () => {
        if (!origPath) {
          if (!res.headersSent) {
            res.removeHeader('Cache-Control');
            res.status(404).json({ error: 'File missing on disk' });
          }
          return;
        }
        res.setHeader('Content-Type', img.mimeType || 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        res.sendFile(
          origPath,
          { cacheControl: false, dotfiles: 'deny' },
          (err) => {
            if (err && !res.headersSent) {
              res.removeHeader('Cache-Control');
              const status = (err as NodeJS.ErrnoException).code === 'ENOENT' ? 404 : 500;
              res.status(status).json({ error: status === 404 ? 'File missing on disk' : 'File read error' });
            }
          }
        );
      };

      if (thumbPath) {
        res.setHeader('Content-Type', img.thumbMimeType || 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        res.sendFile(
          thumbPath,
          { cacheControl: false, dotfiles: 'deny' },
          (err) => {
            if (err && !res.headersSent) {
              if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
                sendOrigFallback();
              } else {
                res.removeHeader('Cache-Control');
                res.status(500).json({ error: 'File read error' });
              }
            }
          }
        );
        return;
      }

      sendOrigFallback();
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/files/order-image/:fileName', async (req, res, next) => {
    try {
      const filePath = resolveSafeChild(ORDER_IMAGES_DIR, req.params.fileName);
      if (!filePath) {
        res.status(404).json({ error: 'Order image not found' });
        return;
      }
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.sendFile(
        filePath,
        { cacheControl: false, dotfiles: 'deny' },
        (err) => {
          if (err && !res.headersSent) {
            res.removeHeader('Cache-Control');
            const status = (err as NodeJS.ErrnoException).code === 'ENOENT' ? 404 : 500;
            res.status(status).json({ error: status === 404 ? 'Order image not found' : 'File read error' });
          }
        }
      );
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

        await Promise.all([
          fsp.writeFile(origPath, mainFile.buffer),
          fsp.writeFile(thumbPath, thumbFile ? thumbFile.buffer : mainFile.buffer),
        ]);

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

  // Batch upload multiple images + thumbnails in one vault write & SSE broadcast
  app.post(
    '/api/images/batch',
    upload.any(),
    async (req, res, next) => {
      try {
        const uploadedList = Array.isArray(req.files)
          ? (req.files as Express.Multer.File[])
          : [];
        const fileByField = new Map<string, Express.Multer.File>();
        for (const f of uploadedList) {
          fileByField.set(f.fieldname, f);
        }

        const rawMetaList =
          typeof req.body?.metadata === 'string'
            ? (JSON.parse(req.body.metadata) as Array<Record<string, unknown>>)
            : [];

        if (!Array.isArray(rawMetaList) || rawMetaList.length === 0) {
          res.status(400).json({ error: 'Missing batch metadata' });
          return;
        }

        const writeTasks: Array<Promise<void>> = [];
        const records: ServerImageRecord[] = [];
        const now = Date.now();

        for (let idx = 0; idx < rawMetaList.length; idx++) {
          const rawMeta = rawMetaList[idx] || {};
          const mainFile = fileByField.get(`file_${idx}`);
          if (!mainFile) continue;

          const thumbFile = fileByField.get(`thumb_${idx}`);
          const safeId = sanitizeId(String(rawMeta.id || '')) || crypto.randomUUID();
          const mimeType = String(rawMeta.mimeType || mainFile.mimetype || 'image/jpeg');
          const fileName = String(rawMeta.fileName || mainFile.originalname || `${safeId}.jpg`);
          const ext = getFileExt(mimeType, fileName);
          const storedFile = `${safeId}${ext}`;
          const thumbMimeType = thumbFile?.mimetype || mimeType;
          const thumbExt = getFileExt(thumbMimeType, thumbFile?.originalname);
          const storedThumbFile = `${safeId}${thumbExt}`;

          const origPath = resolveSafeChild(UPLOADS_DIR, storedFile);
          const thumbPath = resolveSafeChild(THUMBS_DIR, storedThumbFile);
          if (!origPath || !thumbPath) continue;

          writeTasks.push(fsp.writeFile(origPath, mainFile.buffer));
          writeTasks.push(fsp.writeFile(thumbPath, thumbFile ? thumbFile.buffer : mainFile.buffer));

          records.push({
            id: safeId,
            title: String(rawMeta.title || 'Ảnh mẫu'),
            fileName,
            notes: String(rawMeta.notes || ''),
            categoryId: rawMeta.categoryId ? String(rawMeta.categoryId) : null,
            tags: Array.isArray(rawMeta.tags) ? rawMeta.tags.map(String) : [],
            width: Number(rawMeta.width) || 800,
            height: Number(rawMeta.height) || 600,
            size: Number(rawMeta.size) || mainFile.size,
            mimeType,
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
            createdAt: Number(rawMeta.createdAt) || now + idx,
            updatedAt: Number(rawMeta.updatedAt) || now + idx,
            storedFile,
            storedThumbFile,
            thumbMimeType,
          });
        }

        if (records.length === 0) {
          res.status(400).json({ error: 'No valid image files in batch' });
          return;
        }

        await Promise.all(writeTasks);

        const insertedIds = new Set(records.map((r) => r.id));
        await withVaultLock(async (vault) => {
          const filtered = vault.images.filter((i) => !insertedIds.has(i.id));
          return {
            nextVault: {
              ...vault,
              seeded: true,
              images: [...records.slice().reverse(), ...filtered],
            },
            result: records.length,
          };
        });

        broadcastVaultUpdated();
        res.status(201).json({ images: records.map(toClientImage) });
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
        const dateParts = new Intl.DateTimeFormat('en-GB', {
          timeZone: process.env.TZ || 'Asia/Ho_Chi_Minh',
          day: '2-digit',
          month: '2-digit',
          year: '2-digit',
        }).formatToParts(new Date(now));
        const dd = dateParts.find((p) => p.type === 'day')?.value || '01';
        const mm = dateParts.find((p) => p.type === 'month')?.value || '01';
        const yy = dateParts.find((p) => p.type === 'year')?.value || '26';
        const dateStamp = `${dd}${mm}${yy}`;
        const codePrefix = `DH-${dateStamp}-`;

        const created = await withVaultLock(async (vault) => {
          const existingOrders = vault.orders || [];
          let maxDailySeq = 0;
          for (const existing of existingOrders) {
            if (existing.orderCode?.startsWith(codePrefix)) {
              const seqPart = Number.parseInt(
                existing.orderCode.slice(codePrefix.length),
                10
              );
              if (Number.isFinite(seqPart) && seqPart > maxDailySeq) {
                maxDailySeq = seqPart;
              }
            }
          }
          const nextNum = maxDailySeq + 1;
          const orderCode = `${codePrefix}${String(nextNum).padStart(3, '0')}`;
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

  // Chunked multipart batch upload for atomic backup restore
  app.post(
    '/api/vault/restore/batch',
    upload.any(),
    async (req, res, next) => {
      try {
        const sessionId = sanitizeId(String(req.body?.sessionId || ''));
        const session = sessionId ? restoreSessions.get(sessionId) : undefined;
        if (!session) {
          res.status(404).json({ error: 'Phiên khôi phục không tồn tại hoặc đã hết hạn.' });
          return;
        }
        session.updatedAt = Date.now();

        const uploadedList = Array.isArray(req.files)
          ? (req.files as Express.Multer.File[])
          : [];
        const fileByField = new Map<string, Express.Multer.File>();
        for (const f of uploadedList) {
          fileByField.set(f.fieldname, f);
        }

        const rawMetaList =
          typeof req.body?.metadata === 'string'
            ? (JSON.parse(req.body.metadata) as Array<Record<string, unknown>>)
            : [];
        const rawOrderFileKeys =
          typeof req.body?.orderFileKeys === 'string'
            ? (JSON.parse(req.body.orderFileKeys) as Array<{ key: string; id: string; mimeType?: string; fileName?: string }>)
            : [];

        const writeTasks: Array<Promise<void>> = [];
        const stagedRecords: ServerImageRecord[] = [];
        const now = Date.now();

        for (let idx = 0; idx < rawMetaList.length; idx++) {
          const rawMeta = rawMetaList[idx] || {};
          const mainFile = fileByField.get(`file_${idx}`);
          if (!mainFile) continue;

          const thumbFile = fileByField.get(`thumb_${idx}`);
          const safeId = sanitizeId(String(rawMeta.id || '')) || crypto.randomUUID();
          const mimeType = String(rawMeta.mimeType || mainFile.mimetype || 'image/jpeg');
          const fileName = String(rawMeta.fileName || mainFile.originalname || `${safeId}.jpg`);
          const ext = getFileExt(mimeType, fileName);
          const storedFile = `${safeId}${ext}`;
          const thumbMimeType = thumbFile?.mimetype || mimeType;
          const thumbExt = getFileExt(thumbMimeType, thumbFile?.originalname);
          const storedThumbFile = `${safeId}${thumbExt}`;

          const stagedOrigPath = resolveSafeChild(session.uploadsDir, storedFile);
          const stagedThumbPath = resolveSafeChild(session.thumbsDir, storedThumbFile);
          if (!stagedOrigPath || !stagedThumbPath) continue;

          writeTasks.push(fsp.writeFile(stagedOrigPath, mainFile.buffer));
          writeTasks.push(fsp.writeFile(stagedThumbPath, thumbFile ? thumbFile.buffer : mainFile.buffer));

          stagedRecords.push({
            id: safeId,
            title: String(rawMeta.title || 'Ảnh mẫu đã khôi phục'),
            fileName,
            notes: String(rawMeta.notes || ''),
            categoryId: rawMeta.categoryId ? String(rawMeta.categoryId) : null,
            tags: Array.isArray(rawMeta.tags) ? rawMeta.tags.map(String) : [],
            width: Number(rawMeta.width) || 800,
            height: Number(rawMeta.height) || 600,
            size: Number(rawMeta.size) || mainFile.size,
            mimeType,
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
            createdAt: Number(rawMeta.createdAt) || now + idx,
            updatedAt: Number(rawMeta.updatedAt) || now + idx,
            storedFile,
            storedThumbFile,
            thumbMimeType,
          });
        }

        for (const item of rawOrderFileKeys) {
          const orderFile = fileByField.get(`order_file_${item.key}`);
          if (!orderFile) continue;
          const fileId = sanitizeId(String(item.id || '')) || crypto.randomUUID();
          const mimeType = String(item.mimeType || orderFile.mimetype || 'image/jpeg');
          const ext = getFileExt(mimeType, item.fileName || orderFile.originalname);
          const storedFile = `${fileId}${ext}`;
          const stagedPath = resolveSafeChild(session.orderImagesDir, storedFile);
          if (!stagedPath) continue;
          writeTasks.push(fsp.writeFile(stagedPath, orderFile.buffer));
          session.orderCustomFiles.set(item.key, { storedFile, mimeType });
        }

        await Promise.all(writeTasks);
        session.images.push(...stagedRecords);

        res.json({ accepted: stagedRecords.length });
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

      const savedCategory = await withVaultLock(async (vault) => {
        const existing = vault.categories.find((c) => c.id === String(body.id));
        const resolvedOrder = Number.isFinite(body.order)
          ? Number(body.order)
          : existing
            ? existing.order
            : vault.categories.reduce(
                (max, c) => Math.max(max, Number.isFinite(c.order) ? c.order : -1),
                -1
              ) + 1;
        const category: CategoryRecord = {
          id: String(body.id),
          name: String(body.name).trim(),
          description: String(body.description || ''),
          color: String(body.color || '#2563EB'),
          order: resolvedOrder,
          createdAt: Number(body.createdAt) || existing?.createdAt || Date.now(),
        };
        const categories = existing
          ? vault.categories.map((c) => (c.id === category.id ? category : c))
          : [...vault.categories, category];
        return {
          nextVault: { ...vault, seeded: true, categories },
          result: category,
        };
      });

      broadcastVaultUpdated();
      res.json(savedCategory);
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

  // Batch delete categories & unassign their images
  app.post('/api/categories/batch-delete', async (req, res, next) => {
    try {
      const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
      if (ids.length === 0) {
        res.status(400).json({ error: 'No category IDs provided' });
        return;
      }
      const idSet = new Set(ids);

      await withVaultLock(async (vault) => {
        const now = Date.now();
        return {
          nextVault: {
            ...vault,
            categories: vault.categories.filter((c) => !idSet.has(c.id)),
            images: vault.images.map((img) =>
              img.categoryId && idSet.has(img.categoryId)
                ? { ...img, categoryId: null, updatedAt: now }
                : img
            ),
          },
          result: true,
        };
      });

      broadcastVaultUpdated();
      res.json({ ok: true, count: idSet.size });
    } catch (err) {
      next(err);
    }
  });

  // Reorder categories
  app.post('/api/categories/reorder', async (req, res, next) => {
    try {
      const orderedIds: string[] = Array.isArray(req.body?.orderedIds)
        ? req.body.orderedIds.map((item: unknown) => String(item))
        : [];
      if (orderedIds.length === 0) {
        res.status(400).json({ error: 'No category IDs provided' });
        return;
      }

      const updatedCategories = await withVaultLock(async (vault) => {
        const rankMap = new Map<string, number>();
        orderedIds.forEach((id: string, idx: number) => {
          if (!rankMap.has(id)) {
            rankMap.set(id, idx);
          }
        });

        const existingSorted = [...vault.categories].sort(
          (a, b) => a.order - b.order || a.createdAt - b.createdAt
        );
        let tailOrder = rankMap.size;
        const nextCategories = existingSorted
          .map((cat) => ({
            ...cat,
            order: rankMap.has(cat.id) ? rankMap.get(cat.id)! : tailOrder++,
          }))
          .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt)
          .map((cat, idx) => ({ ...cat, order: idx }));

        return {
          nextVault: { ...vault, seeded: true, categories: nextCategories },
          result: nextCategories,
        };
      });

      broadcastVaultUpdated();
      res.json({ categories: updatedCategories });
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

  // Export backup JSON bundle from server storage (streamed to avoid RAM/buffer limits)
  app.get('/api/vault/backup', async (req, res, next) => {
    let clientClosed = false;
    req.on('close', () => {
      clientClosed = true;
    });

    try {
      const vault = await readVaultFile();
      const categories = [...vault.categories];
      const images = [...vault.images];
      const orders = [...(vault.orders || [])];

      const dateStr = new Date().toISOString().slice(0, 10);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      if (req.query.download === '1') {
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="mai-huong-bakery-sao-luu-${dateStr}.json"`
        );
      }

      await writeStreamChunk(
        res,
        `{"version":1,"exportedAt":${Date.now()},"categories":${JSON.stringify(categories)},"orders":[`
      );

      let wroteFirstOrder = false;
      for (const order of orders) {
        if (clientClosed) return;
        const serializedSamples = [];
        for (const sample of order.sampleImages || []) {
          if (sample.storedFile) {
            const orderImgPath = resolveSafeChild(ORDER_IMAGES_DIR, sample.storedFile);
            if (orderImgPath && fs.existsSync(orderImgPath)) {
              const buf = await fsp.readFile(orderImgPath);
              const mime = sample.mimeType || 'image/jpeg';
              serializedSamples.push({
                id: sample.id,
                sourceImageId: null,
                title: sample.title,
                mimeType: mime,
                dataUrl: `data:${mime};base64,${buf.toString('base64')}`,
              });
            }
          } else {
            serializedSamples.push({
              id: sample.id,
              sourceImageId: sample.sourceImageId || sample.id,
              title: sample.title,
            });
          }
        }
        const serializedOrder = {
          ...order,
          sampleImages: serializedSamples,
        };
        const prefix = wroteFirstOrder ? ',' : '';
        wroteFirstOrder = true;
        await writeStreamChunk(res, `${prefix}${JSON.stringify(serializedOrder)}`);
      }

      await writeStreamChunk(res, '],"images":[');

      let wroteFirstImage = false;
      for (const img of images) {
        if (clientClosed) return;
        const origPath = resolveSafeChild(UPLOADS_DIR, img.storedFile);
        if (!origPath || !fs.existsSync(origPath)) continue;
        const buf = await fsp.readFile(origPath);
        const mime = img.mimeType || 'image/jpeg';
        const { storedFile: _sf, storedThumbFile: _stf, ...meta } = img;
        const payload = JSON.stringify({
          ...meta,
          dataUrl: `data:${mime};base64,${buf.toString('base64')}`,
        });
        const prefix = wroteFirstImage ? ',' : '';
        wroteFirstImage = true;
        await writeStreamChunk(res, `${prefix}${payload}`);
      }

      await writeStreamChunk(res, ']}');
      res.end();
    } catch (err) {
      if ((err as Error)?.message === 'CLIENT_DISCONNECTED' || clientClosed) {
        return;
      }
      if (!res.headersSent) {
        next(err);
      } else {
        res.destroy();
      }
    }
  });

  // Begin chunked atomic restore session
  app.post('/api/vault/restore/begin', async (req, res, next) => {
    try {
      await cleanupExpiredRestoreSessions();
      const body = (req.body || {}) as {
        mode?: 'merge' | 'replace';
        categories?: CategoryRecord[];
        orders?: ServerOrderRecord[];
      };
      const mode: 'merge' | 'replace' = body.mode === 'replace' ? 'replace' : 'merge';
      const sessionId = crypto.randomUUID();
      const stagingDir = path.join(RESTORE_STAGING_DIR, sessionId);
      const uploadsDir = path.join(stagingDir, 'uploads');
      const thumbsDir = path.join(stagingDir, 'thumbs');
      const orderImagesDir = path.join(stagingDir, 'order-images');

      await Promise.all([
        fsp.mkdir(uploadsDir, { recursive: true }),
        fsp.mkdir(thumbsDir, { recursive: true }),
        fsp.mkdir(orderImagesDir, { recursive: true }),
      ]);

      const now = Date.now();
      restoreSessions.set(sessionId, {
        id: sessionId,
        mode,
        stagingDir,
        uploadsDir,
        thumbsDir,
        orderImagesDir,
        categories: Array.isArray(body.categories) ? body.categories : [],
        orders: Array.isArray(body.orders) ? body.orders : undefined,
        images: [],
        orderCustomFiles: new Map(),
        createdAt: now,
        updatedAt: now,
      });

      res.status(201).json({ sessionId });
    } catch (err) {
      next(err);
    }
  });

  // Commit staged restore atomically into vault.json & storage directories
  app.post('/api/vault/restore/commit', async (req, res, next) => {
    try {
      const body = (req.body || {}) as {
        sessionId?: string;
        categories?: CategoryRecord[];
        orders?: Array<
          Omit<Partial<ServerOrderRecord>, 'sampleImages'> & {
            sampleImages?: Array<{
              id?: string;
              sourceImageId?: string | null;
              title?: string;
              uploadKey?: string;
            }>;
          }
        >;
      };
      const sessionId = sanitizeId(String(body.sessionId || ''));
      const session = sessionId ? restoreSessions.get(sessionId) : undefined;
      if (!session) {
        res.status(404).json({ error: 'Phiên khôi phục không tồn tại hoặc đã hết hạn.' });
        return;
      }

      const incomingCats = Array.isArray(body.categories)
        ? body.categories
        : session.categories;
      const incomingOrders = Array.isArray(body.orders)
        ? body.orders
        : session.orders;

      // Move all staged binary files into live storage directories
      for (const img of session.images) {
        const srcOrig = resolveSafeChild(session.uploadsDir, img.storedFile);
        const destOrig = resolveSafeChild(UPLOADS_DIR, img.storedFile);
        if (srcOrig && destOrig && fs.existsSync(srcOrig)) {
          await moveFileOrCopy(srcOrig, destOrig);
        }

        const srcThumb = resolveSafeChild(session.thumbsDir, img.storedThumbFile);
        const destThumb = resolveSafeChild(THUMBS_DIR, img.storedThumbFile);
        if (srcThumb && destThumb && fs.existsSync(srcThumb)) {
          await moveFileOrCopy(srcThumb, destThumb);
        }
      }

      for (const custom of session.orderCustomFiles.values()) {
        const srcOrderImg = resolveSafeChild(session.orderImagesDir, custom.storedFile);
        const destOrderImg = resolveSafeChild(ORDER_IMAGES_DIR, custom.storedFile);
        if (srcOrderImg && destOrderImg && fs.existsSync(srcOrderImg)) {
          await moveFileOrCopy(srcOrderImg, destOrderImg);
        }
      }

      const now = Date.now();
      const restoredOrders: ServerOrderRecord[] | undefined = incomingOrders
        ? incomingOrders
            .filter((o) => o && o.id && o.customerName)
            .map((o) => {
              const price = Math.max(0, Number(o.price) || 0);
              const depositAmount = Math.max(0, Number(o.depositAmount) || 0);
              return {
                id: String(o.id),
                orderCode: String(o.orderCode || `DH-${String(o.id).slice(0, 6)}`),
                customerName: String(o.customerName || ''),
                customerPhone: String(o.customerPhone || ''),
                productName: String(o.productName || ''),
                productDescription: String(o.productDescription || ''),
                pickupTime: String(o.pickupTime || ''),
                price,
                depositAmount,
                isPaid: Boolean(o.isPaid) || (price > 0 && depositAmount >= price),
                isReady: Boolean(o.isReady),
                isReceived: Boolean(o.isReceived),
                sampleImages: (o.sampleImages || []).map((s) => {
                  const uploadKey = 'uploadKey' in s ? s.uploadKey : undefined;
                  const stagedCustom = uploadKey
                    ? session.orderCustomFiles.get(String(uploadKey))
                    : undefined;
                  if (stagedCustom) {
                    return {
                      id: String(s.id || crypto.randomUUID()),
                      sourceImageId: null,
                      title: String(s.title || 'Ảnh mẫu đơn hàng'),
                      storedFile: stagedCustom.storedFile,
                      mimeType: stagedCustom.mimeType,
                    };
                  }
                  return {
                    id: String(s.id || crypto.randomUUID()),
                    sourceImageId: s.sourceImageId ? String(s.sourceImageId) : null,
                    title: String(s.title || 'Ảnh mẫu'),
                  };
                }),
                createdAt: Number(o.createdAt) || now,
                updatedAt: Number(o.updatedAt) || now,
              };
            })
        : undefined;

      const cleanupResult = await withVaultLock(async (vault) => {
        const baseCats = session.mode === 'replace' ? [] : vault.categories;
        const catMap = new Map<string, CategoryRecord>(baseCats.map((c) => [c.id, c]));
        for (const cat of incomingCats) {
          if (cat && cat.id && cat.name) {
            catMap.set(String(cat.id), {
              id: String(cat.id),
              name: String(cat.name),
              description: String(cat.description || ''),
              color: String(cat.color || '#2563EB'),
              order: Number.isFinite(cat.order) ? Number(cat.order) : catMap.size,
              createdAt: Number(cat.createdAt) || now,
            });
          }
        }

        const baseImgs = session.mode === 'replace' ? [] : vault.images;
        const imgMap = new Map<string, ServerImageRecord>(baseImgs.map((i) => [i.id, i]));
        for (const img of session.images) {
          imgMap.set(img.id, img);
        }
        const nextImages = Array.from(imgMap.values());
        const keptStoredFiles = new Set(nextImages.map((i) => i.storedFile));
        const keptThumbFiles = new Set(nextImages.map((i) => i.storedThumbFile));

        const oldOrphanImages = vault.images.filter(
          (oldImg) =>
            !keptStoredFiles.has(oldImg.storedFile) ||
            !keptThumbFiles.has(oldImg.storedThumbFile)
        );

        let nextOrders = vault.orders || [];
        if (restoredOrders !== undefined) {
          if (session.mode === 'replace') {
            nextOrders = restoredOrders;
          } else {
            const orderMap = new Map<string, ServerOrderRecord>(
              nextOrders.map((o) => [o.id, o])
            );
            for (const o of restoredOrders) {
              orderMap.set(o.id, o);
            }
            nextOrders = Array.from(orderMap.values());
          }
        }

        const keptOrderFiles = new Set(
          nextOrders.flatMap((o) =>
            (o.sampleImages || []).map((s) => s.storedFile).filter(Boolean) as string[]
          )
        );
        const oldOrphanOrderFiles = (vault.orders || [])
          .flatMap((o) =>
            (o.sampleImages || []).map((s) => s.storedFile).filter(Boolean) as string[]
          )
          .filter((fileName) => !keptOrderFiles.has(fileName));

        return {
          nextVault: {
            version: 1,
            seeded: true,
            categories: Array.from(catMap.values()),
            images: nextImages,
            orders: nextOrders,
          },
          result: {
            oldOrphanImages,
            oldOrphanOrderFiles,
            keptStoredFiles,
            keptThumbFiles,
            importedCategories: incomingCats.length,
            importedImages: session.images.length,
            importedOrders: restoredOrders ? restoredOrders.length : 0,
          },
        };
      });

      // Clean up replaced files only after vault.json commit succeeded
      await Promise.all([
        ...cleanupResult.oldOrphanImages.flatMap((img) => {
          const ops: Array<Promise<void>> = [];
          if (!cleanupResult.keptStoredFiles.has(img.storedFile)) {
            const orig = resolveSafeChild(UPLOADS_DIR, img.storedFile);
            if (orig) ops.push(fsp.unlink(orig).catch(() => {}));
          }
          if (!cleanupResult.keptThumbFiles.has(img.storedThumbFile)) {
            const thumb = resolveSafeChild(THUMBS_DIR, img.storedThumbFile);
            if (thumb) ops.push(fsp.unlink(thumb).catch(() => {}));
          }
          return ops;
        }),
        ...cleanupResult.oldOrphanOrderFiles.map((fileName) => {
          const p = resolveSafeChild(ORDER_IMAGES_DIR, fileName);
          return p ? fsp.unlink(p).catch(() => {}) : Promise.resolve();
        }),
      ]);

      restoreSessions.delete(sessionId);
      await fsp.rm(session.stagingDir, { recursive: true, force: true }).catch(() => {});

      broadcastVaultUpdated();
      res.json({
        importedCategories: cleanupResult.importedCategories,
        importedImages: cleanupResult.importedImages,
        importedOrders: cleanupResult.importedOrders,
      });
    } catch (err) {
      next(err);
    }
  });

  // Abort staged restore and clean up temporary staging directory
  app.post('/api/vault/restore/abort', async (req, res, next) => {
    try {
      const sessionId = sanitizeId(String(req.body?.sessionId || ''));
      const session = sessionId ? restoreSessions.get(sessionId) : undefined;
      if (session) {
        restoreSessions.delete(sessionId);
        await fsp.rm(session.stagingDir, { recursive: true, force: true }).catch(() => {});
      }
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // Legacy single-request restore endpoint (kept for small payloads & compatibility)
  app.post('/api/vault/restore', async (req, res, next) => {
    try {
      const { mode, bundle } = req.body as {
        mode?: 'merge' | 'replace';
        bundle?: {
          categories?: CategoryRecord[];
          orders?: Array<
            Partial<ServerOrderRecord> & {
              sampleImages?: Array<{
                id?: string;
                sourceImageId?: string | null;
                title?: string;
                mimeType?: string;
                dataUrl?: string;
              }>;
            }
          >;
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

      const writtenImages: ServerImageRecord[] = [];
      for (const item of bundle.images) {
        if (!item.dataUrl) continue;
        const parsed = base64DataUrlToBuffer(item.dataUrl);
        if (!parsed) continue;
        const safeId = sanitizeId(String(item.id || '')) || crypto.randomUUID();
        const mimeType = item.mimeType || parsed.mimeType || 'image/jpeg';
        const ext = getFileExt(mimeType, item.fileName);
        const storedFile = `${safeId}${ext}`;
        const storedThumbFile = `${safeId}${ext}`;
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
          thumbMimeType: mimeType,
        });
      }

      const incomingCats = Array.isArray(bundle.categories) ? bundle.categories : [];
      const incomingOrders = Array.isArray(bundle.orders) ? bundle.orders : undefined;

      const writtenOrders: ServerOrderRecord[] | undefined = incomingOrders
        ? await Promise.all(
            incomingOrders
              .filter((o) => o && o.id && o.customerName)
              .map(async (o) => {
                const now = Date.now();
                const price = Math.max(0, Number(o.price) || 0);
                const depositAmount = Math.max(0, Number(o.depositAmount) || 0);
                const sampleImages: ServerOrderSampleImage[] = [];
                for (const s of o.sampleImages || []) {
                  if (s.dataUrl) {
                    const parsed = base64DataUrlToBuffer(s.dataUrl);
                    if (parsed) {
                      const fileId = sanitizeId(String(s.id || '')) || crypto.randomUUID();
                      const mimeType = s.mimeType || parsed.mimeType || 'image/jpeg';
                      const ext = getFileExt(mimeType);
                      const storedFile = `${fileId}${ext}`;
                      const destPath = resolveSafeChild(ORDER_IMAGES_DIR, storedFile);
                      if (destPath) {
                        await fsp.writeFile(destPath, parsed.buffer);
                        sampleImages.push({
                          id: fileId,
                          sourceImageId: null,
                          title: String(s.title || 'Ảnh mẫu đơn hàng'),
                          storedFile,
                          mimeType,
                        });
                      }
                    }
                  } else {
                    sampleImages.push({
                      id: String(s.id || crypto.randomUUID()),
                      sourceImageId: s.sourceImageId ? String(s.sourceImageId) : null,
                      title: String(s.title || 'Ảnh mẫu'),
                    });
                  }
                }
                return {
                  id: String(o.id),
                  orderCode: String(o.orderCode || `DH-${String(o.id).slice(0, 6)}`),
                  customerName: String(o.customerName || ''),
                  customerPhone: String(o.customerPhone || ''),
                  productName: String(o.productName || ''),
                  productDescription: String(o.productDescription || ''),
                  pickupTime: String(o.pickupTime || ''),
                  price,
                  depositAmount,
                  isPaid: Boolean(o.isPaid) || (price > 0 && depositAmount >= price),
                  isReady: Boolean(o.isReady),
                  isReceived: Boolean(o.isReceived),
                  sampleImages,
                  createdAt: Number(o.createdAt) || now,
                  updatedAt: Number(o.updatedAt) || now,
                };
              })
          )
        : undefined;

      const oldOrphans = await withVaultLock(async (vault) => {
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
        const nextImages = Array.from(imgMap.values());
        const keptStoredFiles = new Set(nextImages.map((i) => i.storedFile));
        const keptThumbFiles = new Set(nextImages.map((i) => i.storedThumbFile));
        const removedImages = vault.images.filter(
          (i) => !keptStoredFiles.has(i.storedFile) || !keptThumbFiles.has(i.storedThumbFile)
        );

        let nextOrders = vault.orders || [];
        if (writtenOrders !== undefined) {
          if (mode === 'replace') {
            nextOrders = writtenOrders;
          } else {
            const orderMap = new Map<string, ServerOrderRecord>(nextOrders.map((o) => [o.id, o]));
            for (const o of writtenOrders) {
              orderMap.set(o.id, o);
            }
            nextOrders = Array.from(orderMap.values());
          }
        }

        return {
          nextVault: {
            version: 1,
            seeded: true,
            categories: Array.from(catMap.values()),
            images: nextImages,
            orders: nextOrders,
          },
          result: { removedImages, keptStoredFiles, keptThumbFiles },
        };
      });

      await Promise.all(
        oldOrphans.removedImages.flatMap((img) => {
          const ops: Array<Promise<void>> = [];
          if (!oldOrphans.keptStoredFiles.has(img.storedFile)) {
            const orig = resolveSafeChild(UPLOADS_DIR, img.storedFile);
            if (orig) ops.push(fsp.unlink(orig).catch(() => {}));
          }
          if (!oldOrphans.keptThumbFiles.has(img.storedThumbFile)) {
            const thumb = resolveSafeChild(THUMBS_DIR, img.storedThumbFile);
            if (thumb) ops.push(fsp.unlink(thumb).catch(() => {}));
          }
          return ops;
        })
      );

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

  // Catch unmatched /api routes so they never fall through to SPA HTML
  app.use('/api', (_req, res) => {
    res.status(404).json({
      error: 'API không tồn tại. Nếu bạn vừa cập nhật mã nguồn, hãy Restart Server.',
    });
  });

  // API error handler
  app.use('/api', (err: unknown, req: Request, res: Response, _next: NextFunction) => {
    const reqWithDevice = req as Request & { trustedDeviceName?: string };
    const message = err instanceof Error ? err.message : 'Server error';
    recordActivityLog({
      level: 'error',
      category: 'system',
      action: 'Lỗi xử lý API trên server',
      detail: `${req.method} ${(req.originalUrl || req.url).split('?')[0]} — ${message}`,
      deviceName: reqWithDevice.trustedDeviceName,
      ip: getClientIp(req),
      method: req.method,
      path: (req.originalUrl || req.url).split('?')[0],
      status: err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE' ? 413 : 500,
    });

    if (err instanceof multer.MulterError) {
      const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      res.status(status).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: message });
  });

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(
      express.static(distDir, {
        maxAge: '30d',
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache');
          } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        },
      })
    );
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    viteServer = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(viteServer.middlewares);
  }

  const listenWithRetry = async (maxAttempts = 12): Promise<http.Server> => {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await new Promise<http.Server>((resolve, reject) => {
          const server = app.listen(PORT, '0.0.0.0', () => {
            resolve(server);
          });
          server.once('error', (err) => {
            server.close(() => {});
            reject(err);
          });
        });
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE' && attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 350));
          continue;
        }
        throw err;
      }
    }
    throw new Error(`Port ${PORT} is still in use`);
  };

  httpServer = await listenWithRetry();
  console.log(`Server listening on http://localhost:${PORT}`);
  void readVaultFile().then((vault) => {
    recordActivityLog({
      level: 'info',
      category: 'system',
      action: 'Server đã khởi động',
      detail: `Cổng ${PORT} · ${vault.images.length} ảnh · ${vault.categories.length} danh mục · ${(vault.orders || []).length} đơn hàng`,
    });
  });
  const nets = os.networkInterfaces();
  for (const ifaceList of Object.values(nets)) {
    if (!ifaceList) continue;
    for (const net of ifaceList) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`Network access: http://${net.address}:${PORT}`);
      }
    }
  }
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
