import type { AspectRatioType } from '../types/vault';

export interface ProcessedImageResult {
  width: number;
  height: number;
  aspectRatioType: AspectRatioType;
  thumbnailBlob: Blob;
  dominantColors: string[];
  colorFamilies: string[];
  optimizedBlob?: Blob;
  optimizedMimeType?: string;
  optimizedFileName?: string;
}

export interface ProcessImageOptions {
  optimizeLargeUpload?: boolean;
  fileName?: string;
  mimeType?: string;
}

const THUMB_MAX_EDGE = 480;
const UPLOAD_MAX_EDGE = 2048;
const LARGE_UPLOAD_BYTES = 1.5 * 1024 * 1024;

let cachedWebpSupport: boolean | null = null;

function supportsWebpEncode(): boolean {
  if (cachedWebpSupport !== null) return cachedWebpSupport;
  if (typeof document === 'undefined') {
    cachedWebpSupport = false;
    return false;
  }
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 2;
    cachedWebpSupport = canvas.toDataURL('image/webp').startsWith('data:image/webp');
  } catch {
    cachedWebpSupport = false;
  }
  return cachedWebpSupport;
}

function canvasToBlobAsync(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number,
  fallback: Blob
): Promise<Blob> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((result) => resolve(result || fallback), mimeType, quality);
    } catch {
      resolve(fallback);
    }
  });
}

function replaceFileExtension(fileName: string, newExt: string): string {
  if (!fileName) return `image${newExt}`;
  if (/\.[^/.]+$/.test(fileName)) {
    return fileName.replace(/\.[^/.]+$/, newExt);
  }
  return `${fileName}${newExt}`;
}

const warmedImageUrls = new Set<string>();

export function warmImageUrl(url?: string): void {
  if (!url || typeof window === 'undefined' || warmedImageUrls.has(url)) return;
  if (warmedImageUrls.size >= 120) {
    const oldest = warmedImageUrls.values().next().value;
    if (oldest) warmedImageUrls.delete(oldest);
  }
  warmedImageUrls.add(url);
  const img = new Image();
  img.decoding = 'async';
  img.referrerPolicy = 'no-referrer';
  img.src = url;
}

function rgbToHex(r: number, g: number, b: number): string {
  return (
    '#' +
    [r, g, b]
      .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      case bn:
        h = (rn - gn) / d + 4;
        break;
    }
    h /= 6;
  }

  return { h: h * 360, s: s * 100, l: l * 100 };
}

function classifyColorFamily(r: number, g: number, b: number): string[] {
  const { h, s, l } = rgbToHsl(r, g, b);
  const families: string[] = [];

  if (l < 18) {
    families.push('đen', 'tối');
  } else if (l > 86 && s < 18) {
    families.push('trắng', 'sáng');
  } else if (s < 14) {
    families.push('xám', 'trung tính');
  } else {
    if (h < 18 || h >= 342) families.push('đỏ');
    else if (h < 42) families.push(l < 45 ? 'nâu' : 'cam');
    else if (h < 68) families.push('vàng');
    else if (h < 160) families.push('xanh lá');
    else if (h < 255) families.push('xanh dương');
    else if (h < 305) families.push('tím');
    else families.push('hồng');
  }

  return families;
}

function extractPalette(ctx: CanvasRenderingContext2D, w: number, h: number): {
  dominantColors: string[];
  colorFamilies: string[];
} {
  const data = ctx.getImageData(0, 0, w, h).data;
  const buckets = new Map<string, { count: number; rSum: number; gSum: number; bSum: number }>();

  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha < 128) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    // Quantize into 24-step buckets for crisp perceptual grouping
    const rq = Math.floor(r / 28);
    const gq = Math.floor(g / 28);
    const bq = Math.floor(b / 28);
    const key = `${rq}-${gq}-${bq}`;

    const existing = buckets.get(key);
    if (existing) {
      existing.count += 1;
      existing.rSum += r;
      existing.gSum += g;
      existing.bSum += b;
    } else {
      buckets.set(key, { count: 1, rSum: r, gSum: g, bSum: b });
    }
  }

  const sorted = Array.from(buckets.values()).sort((a, b) => b.count - a.count);
  const chosen: Array<{ r: number; g: number; b: number }> = [];

  for (const bucket of sorted) {
    const r = bucket.rSum / bucket.count;
    const g = bucket.gSum / bucket.count;
    const b = bucket.bSum / bucket.count;

    const tooClose = chosen.some((c) => {
      const dist = Math.sqrt((c.r - r) ** 2 + (c.g - g) ** 2 + (c.b - b) ** 2);
      return dist < 42;
    });

    if (!tooClose) {
      chosen.push({ r, g, b });
    }
    if (chosen.length >= 5) break;
  }

  if (chosen.length === 0 && sorted.length > 0) {
    const b0 = sorted[0];
    chosen.push({ r: b0.rSum / b0.count, g: b0.gSum / b0.count, b: b0.bSum / b0.count });
  }

  const dominantColors = chosen.map((c) => rgbToHex(c.r, c.g, c.b));
  const familySet = new Set<string>();
  chosen.forEach((c) => {
    classifyColorFamily(c.r, c.g, c.b).forEach((f) => familySet.add(f));
  });

  return {
    dominantColors,
    colorFamilies: Array.from(familySet),
  };
}

function loadImageElement(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}

async function decodeDrawableImage(
  blob: Blob
): Promise<{ source: CanvasImageSource; width: number; height: number; close?: () => void } | null> {
  if (typeof createImageBitmap === 'function' && blob.type !== 'image/svg+xml') {
    try {
      const bitmap = await createImageBitmap(blob);
      return {
        source: bitmap,
        width: bitmap.width || 800,
        height: bitmap.height || 600,
        close: () => bitmap.close(),
      };
    } catch {
      // Fallback to HTMLImageElement below
    }
  }
  try {
    const img = await loadImageElement(blob);
    return {
      source: img,
      width: img.naturalWidth || 800,
      height: img.naturalHeight || 600,
    };
  } catch {
    return null;
  }
}

export async function processImageBlob(
  blob: Blob,
  options: ProcessImageOptions = {}
): Promise<ProcessedImageResult> {
  const decoded = await decodeDrawableImage(blob);
  if (!decoded) {
    return {
      width: 1200,
      height: 1200,
      aspectRatioType: 'square',
      thumbnailBlob: blob,
      dominantColors: [],
      colorFamilies: [],
    };
  }

  const { source, width, height, close } = decoded;
  const sourceMime = (options.mimeType || blob.type || '').toLowerCase();
  const isVectorOrAnimated =
    sourceMime === 'image/svg+xml' || sourceMime === 'image/gif';

  let finalWidth = width;
  let finalHeight = height;
  let optimizedBlob: Blob | undefined;
  let optimizedMimeType: string | undefined;
  let optimizedFileName: string | undefined;
  let thumbSource: CanvasImageSource = source;

  const useWebp = supportsWebpEncode();
  const targetEncodeMime = useWebp ? 'image/webp' : 'image/jpeg';
  const targetEncodeExt = useWebp ? '.webp' : '.jpg';

  try {
    // Smart-optimize huge camera/raw photos (>2048px or >1.5MB) so import & preview load stay fast
    if (
      options.optimizeLargeUpload &&
      !isVectorOrAnimated &&
      (width > UPLOAD_MAX_EDGE || height > UPLOAD_MAX_EDGE || blob.size > LARGE_UPLOAD_BYTES)
    ) {
      let targetW = width;
      let targetH = height;
      if (width > UPLOAD_MAX_EDGE || height > UPLOAD_MAX_EDGE) {
        if (width >= height) {
          targetW = UPLOAD_MAX_EDGE;
          targetH = Math.max(1, Math.round((height / width) * UPLOAD_MAX_EDGE));
        } else {
          targetH = UPLOAD_MAX_EDGE;
          targetW = Math.max(1, Math.round((width / height) * UPLOAD_MAX_EDGE));
        }
      }

      const uploadCanvas = document.createElement('canvas');
      uploadCanvas.width = targetW;
      uploadCanvas.height = targetH;
      const uploadCtx = uploadCanvas.getContext('2d');
      if (uploadCtx) {
        uploadCtx.drawImage(source, 0, 0, targetW, targetH);
        thumbSource = uploadCanvas;
        const candidateBlob = await canvasToBlobAsync(
          uploadCanvas,
          targetEncodeMime,
          0.88,
          blob
        );
        if (candidateBlob !== blob && candidateBlob.size < blob.size * 0.92) {
          optimizedBlob = candidateBlob;
          optimizedMimeType = candidateBlob.type || targetEncodeMime;
          optimizedFileName = options.fileName
            ? replaceFileExtension(options.fileName, targetEncodeExt)
            : undefined;
          finalWidth = targetW;
          finalHeight = targetH;
        }
      }
    }

    const ratio = finalWidth / finalHeight;
    let aspectRatioType: AspectRatioType = 'square';
    if (ratio > 1.12) aspectRatioType = 'landscape';
    else if (ratio < 0.88) aspectRatioType = 'portrait';

    // Generate compact thumbnail (max edge 480px)
    let thumbW = finalWidth;
    let thumbH = finalHeight;
    if (finalWidth > THUMB_MAX_EDGE || finalHeight > THUMB_MAX_EDGE) {
      if (finalWidth >= finalHeight) {
        thumbW = THUMB_MAX_EDGE;
        thumbH = Math.max(1, Math.round((finalHeight / finalWidth) * THUMB_MAX_EDGE));
      } else {
        thumbH = THUMB_MAX_EDGE;
        thumbW = Math.max(1, Math.round((finalWidth / finalHeight) * THUMB_MAX_EDGE));
      }
    }

    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = thumbW;
    thumbCanvas.height = thumbH;
    const thumbCtx = thumbCanvas.getContext('2d');
    if (thumbCtx) {
      thumbCtx.drawImage(thumbSource, 0, 0, thumbW, thumbH);
    }

    const thumbnailBlob = await canvasToBlobAsync(
      thumbCanvas,
      targetEncodeMime,
      0.82,
      optimizedBlob || blob
    );

    // Extract palette directly from the downscaled thumbCanvas (avoids re-sampling full-res source)
    const sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = 48;
    sampleCanvas.height = 48;
    const sampleCtx = sampleCanvas.getContext('2d');
    let dominantColors: string[] = [];
    let colorFamilies: string[] = [];

    if (sampleCtx) {
      try {
        sampleCtx.drawImage(thumbCanvas, 0, 0, 48, 48);
        const palette = extractPalette(sampleCtx, 48, 48);
        dominantColors = palette.dominantColors;
        colorFamilies = palette.colorFamilies;
      } catch {
        // Ignore tainted/unsupported canvas readback
      }
    }

    return {
      width: finalWidth,
      height: finalHeight,
      aspectRatioType,
      thumbnailBlob,
      dominantColors,
      colorFamilies,
      optimizedBlob,
      optimizedMimeType,
      optimizedFileName,
    };
  } finally {
    close?.();
  }
}

export function generateId(): string {
  if (typeof crypto !== 'undefined') {
    if (typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    if (typeof crypto.getRandomValues === 'function') {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;
}

const IMAGE_EXT_REGEX = /\.(jpe?g|png|webp|gif|svg|avif|bmp|heic|heif|jfif|tiff?)$/i;

export function isImageFile(file: File): boolean {
  if (file.type && file.type.startsWith('image/')) return true;
  return IMAGE_EXT_REGEX.test(file.name || '');
}

const EXT_TO_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  jfif: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  bmp: 'image/bmp',
  heic: 'image/heic',
  heif: 'image/heif',
  tif: 'image/tiff',
  tiff: 'image/tiff',
};

export function inferImageMimeType(file: File): string {
  if (file.type && file.type.startsWith('image/')) return file.type;
  const ext = (file.name || '').split('.').pop()?.toLowerCase() || '';
  return EXT_TO_MIME[ext] || 'image/jpeg';
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function stripFileExtension(filename: string): string {
  return filename.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ').trim();
}
