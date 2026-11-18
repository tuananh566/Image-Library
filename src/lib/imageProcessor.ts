import type { AspectRatioType } from '../types/vault';

export interface ProcessedImageResult {
  width: number;
  height: number;
  aspectRatioType: AspectRatioType;
  thumbnailBlob: Blob;
  dominantColors: string[];
  colorFamilies: string[];
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

export async function processImageBlob(blob: Blob): Promise<ProcessedImageResult> {
  const img = await loadImageElement(blob);
  const width = img.naturalWidth || 800;
  const height = img.naturalHeight || 600;

  const ratio = width / height;
  let aspectRatioType: AspectRatioType = 'square';
  if (ratio > 1.12) aspectRatioType = 'landscape';
  else if (ratio < 0.88) aspectRatioType = 'portrait';

  // Generate compact thumbnail (max edge 640px)
  const maxEdge = 640;
  let thumbW = width;
  let thumbH = height;
  if (width > maxEdge || height > maxEdge) {
    if (width >= height) {
      thumbW = maxEdge;
      thumbH = Math.max(1, Math.round((height / width) * maxEdge));
    } else {
      thumbH = maxEdge;
      thumbW = Math.max(1, Math.round((width / height) * maxEdge));
    }
  }

  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = thumbW;
  thumbCanvas.height = thumbH;
  const thumbCtx = thumbCanvas.getContext('2d');
  if (thumbCtx) {
    thumbCtx.drawImage(img, 0, 0, thumbW, thumbH);
  }

  const thumbnailBlob = await new Promise<Blob>((resolve) => {
    thumbCanvas.toBlob(
      (result) => resolve(result || blob),
      'image/jpeg',
      0.86
    );
  });

  // Extract palette on tiny 48x48 canvas
  const sampleCanvas = document.createElement('canvas');
  sampleCanvas.width = 48;
  sampleCanvas.height = 48;
  const sampleCtx = sampleCanvas.getContext('2d');
  let dominantColors: string[] = [];
  let colorFamilies: string[] = [];

  if (sampleCtx) {
    sampleCtx.drawImage(img, 0, 0, 48, 48);
    const palette = extractPalette(sampleCtx, 48, 48);
    dominantColors = palette.dominantColors;
    colorFamilies = palette.colorFamilies;
  }

  return {
    width,
    height,
    aspectRatioType,
    thumbnailBlob,
    dominantColors,
    colorFamilies,
  };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function stripFileExtension(filename: string): string {
  return filename.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ').trim();
}
