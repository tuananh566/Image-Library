import type { Category, OrderRecord, VaultImageRecord } from '../types/vault';

export interface BackupOrderSampleImageInput {
  id: string;
  sourceImageId?: string | null;
  title?: string;
  mimeType?: string;
  dataUrl?: string;
}

export interface BackupOrderInput extends Omit<OrderRecord, 'sampleImages'> {
  sampleImages?: BackupOrderSampleImageInput[];
}

export interface BackupImageInput
  extends Partial<Omit<VaultImageRecord, 'blob' | 'thumbnailBlob'>> {
  dataUrl?: string;
}

export interface ParsedBackupMetadata {
  version?: number;
  exportedAt?: number;
  categories?: Category[];
  orders?: BackupOrderInput[];
}

export interface StreamParseBackupCallbacks {
  onImage: (image: BackupImageInput, countSoFar: number) => Promise<void> | void;
  onProgressBytes?: (readBytes: number, totalBytes: number) => void;
}

export function dataUrlToBlob(dataUrl: string): Blob | null {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const trimmed = dataUrl.trim();
  const base64Match = /^data:([^;,]+)?(?:;[^,]*)?;base64,(.+)$/is.exec(trimmed);
  if (base64Match) {
    const mimeType = (base64Match[1] || 'image/jpeg').trim();
    const base64Body = base64Match[2].replace(/\s+/g, '');
    try {
      const binary = atob(base64Body);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return new Blob([bytes], { type: mimeType });
    } catch {
      return null;
    }
  }

  const plainMatch = /^data:([^;,]+)?(?:;[^,]*)?,(.*)$/is.exec(trimmed);
  if (plainMatch) {
    const mimeType = (plainMatch[1] || 'text/plain').trim();
    try {
      const decoded = decodeURIComponent(plainMatch[2]);
      return new Blob([decoded], { type: mimeType });
    } catch {
      return null;
    }
  }

  return null;
}

type ParserState =
  | 'INIT'
  | 'EXPECT_ROOT_KEY_OR_END'
  | 'EXPECT_COLON'
  | 'EXPECT_VALUE_START'
  | 'READ_KEY'
  | 'READ_VALUE'
  | 'IN_IMAGES_ARRAY'
  | 'READ_IMAGE_ITEM'
  | 'DONE';

function isWhitespaceCode(code: number): boolean {
  return code === 32 || code === 9 || code === 10 || code === 13;
}

/**
 * Incrementally parses a KhoAnh backup JSON file of arbitrary size (even 500MB+)
 * without loading the entire file into a single JS string.
 */
export async function parseBackupFileStreaming(
  file: File,
  callbacks: StreamParseBackupCallbacks
): Promise<ParsedBackupMetadata> {
  const metadata: ParsedBackupMetadata = {};
  let foundImagesArray = false;
  let imageCount = 0;

  const ctx: { state: ParserState } = { state: 'INIT' };
  let currentKey = '';

  // Buffer state for READ_KEY / READ_VALUE / READ_IMAGE_ITEM
  let chunks: string[] = [];
  let inString = false;
  let escaped = false;
  let valueDepth = 0;
  let valueKind: 'container' | 'string' | 'primitive' = 'primitive';
  let readingImageNonObject = false;

  const flushChunks = (): string => {
    const joined = chunks.length === 1 ? chunks[0] : chunks.join('');
    chunks = [];
    return joined;
  };

  const scanStringEnd = (text: string, startPos: number): number => {
    let pos = startPos;
    const len = text.length;
    while (pos < len) {
      if (escaped) {
        escaped = false;
        pos++;
        continue;
      }
      const nextQuote = text.indexOf('"', pos);
      const nextSlash = text.indexOf('\\', pos);
      if (nextQuote === -1 && nextSlash === -1) {
        return len;
      }
      if (nextQuote !== -1 && (nextSlash === -1 || nextQuote < nextSlash)) {
        inString = false;
        return nextQuote + 1;
      }
      // nextSlash is before nextQuote (or nextQuote === -1)
      escaped = true;
      pos = nextSlash + 1;
    }
    return len;
  };

  const assignTopLevelKey = (key: string, rawValue: string) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawValue);
    } catch {
      throw new Error(`Dữ liệu mục "${key}" trong tệp sao lưu bị hỏng.`);
    }
    if (key === 'version' && typeof parsed === 'number') {
      metadata.version = parsed;
    } else if (key === 'exportedAt' && typeof parsed === 'number') {
      metadata.exportedAt = parsed;
    } else if (key === 'categories') {
      if (parsed === null || parsed === undefined) {
        metadata.categories = [];
      } else if (!Array.isArray(parsed)) {
        throw new Error('Danh sách danh mục trong tệp sao lưu không hợp lệ.');
      } else {
        metadata.categories = parsed as Category[];
      }
    } else if (key === 'orders') {
      if (Array.isArray(parsed)) {
        metadata.orders = parsed as BackupOrderInput[];
      } else if (parsed === null) {
        metadata.orders = [];
      }
    }
  };

  const processTextChunk = async (text: string) => {
    let pos = 0;
    const len = text.length;

    while (pos < len) {
      if (ctx.state === 'DONE') {
        break;
      }

      if (ctx.state === 'INIT') {
        while (pos < len) {
          const code = text.charCodeAt(pos);
          if (code === 0xfeff || isWhitespaceCode(code)) {
            pos++;
          } else {
            break;
          }
        }
        if (pos >= len) break;
        if (text.charCodeAt(pos) !== 123 /* '{' */) {
          throw new Error('Tệp sao lưu không phải đối tượng JSON hợp lệ.');
        }
        pos++;
        ctx.state = 'EXPECT_ROOT_KEY_OR_END';
        continue;
      }

      if (ctx.state === 'EXPECT_ROOT_KEY_OR_END') {
        while (pos < len) {
          const code = text.charCodeAt(pos);
          if (isWhitespaceCode(code) || code === 44 /* ',' */) {
            pos++;
          } else {
            break;
          }
        }
        if (pos >= len) break;
        const ch = text.charCodeAt(pos);
        if (ch === 125 /* '}' */) {
          pos++;
          ctx.state = 'DONE';
          continue;
        }
        if (ch !== 34 /* '"' */) {
          throw new Error('Cấu trúc khóa JSON ở cấp gốc không hợp lệ.');
        }
        chunks = ['"'];
        inString = true;
        escaped = false;
        pos++;
        ctx.state = 'READ_KEY';
        continue;
      }

      if (ctx.state === 'READ_KEY') {
        const startPos = pos;
        pos = scanStringEnd(text, pos);
        chunks.push(text.slice(startPos, pos));
        if (!inString) {
          const rawKey = flushChunks();
          try {
            currentKey = JSON.parse(rawKey) as string;
          } catch {
            throw new Error('Tên trường JSON trong tệp sao lưu không hợp lệ.');
          }
          ctx.state = 'EXPECT_COLON';
        }
        continue;
      }

      if (ctx.state === 'EXPECT_COLON') {
        while (pos < len && isWhitespaceCode(text.charCodeAt(pos))) {
          pos++;
        }
        if (pos >= len) break;
        if (text.charCodeAt(pos) !== 58 /* ':' */) {
          throw new Error(`Thiếu dấu ":" sau khóa "${currentKey}".`);
        }
        pos++;
        ctx.state = 'EXPECT_VALUE_START';
        continue;
      }

      if (ctx.state === 'EXPECT_VALUE_START') {
        while (pos < len && isWhitespaceCode(text.charCodeAt(pos))) {
          pos++;
        }
        if (pos >= len) break;
        const ch = text.charCodeAt(pos);

        if (currentKey === 'images' && ch === 91 /* '[' */) {
          foundImagesArray = true;
          pos++;
          ctx.state = 'IN_IMAGES_ARRAY';
          continue;
        }

        chunks = [];
        inString = false;
        escaped = false;

        if (ch === 123 /* '{' */ || ch === 91 /* '[' */) {
          valueKind = 'container';
          valueDepth = 0;
        } else if (ch === 34 /* '"' */) {
          valueKind = 'string';
          chunks.push('"');
          inString = true;
          pos++;
        } else {
          valueKind = 'primitive';
        }
        ctx.state = 'READ_VALUE';
        continue;
      }

      if (ctx.state === 'READ_VALUE') {
        if (valueKind === 'string') {
          const startPos = pos;
          pos = scanStringEnd(text, pos);
          chunks.push(text.slice(startPos, pos));
          if (!inString) {
            const raw = flushChunks();
            assignTopLevelKey(currentKey, raw);
            ctx.state = 'EXPECT_ROOT_KEY_OR_END';
          }
          continue;
        }

        if (valueKind === 'primitive') {
          const startPos = pos;
          while (pos < len) {
            const ch = text.charCodeAt(pos);
            if (ch === 44 /* ',' */ || ch === 125 /* '}' */ || isWhitespaceCode(ch)) {
              chunks.push(text.slice(startPos, pos));
              const raw = flushChunks();
              assignTopLevelKey(currentKey, raw);
              ctx.state = 'EXPECT_ROOT_KEY_OR_END';
              break;
            }
            pos++;
          }
          if (ctx.state === 'READ_VALUE') {
            chunks.push(text.slice(startPos, pos));
          }
          continue;
        }

        // valueKind === 'container'
        const startPos = pos;
        let completed = false;
        while (pos < len) {
          if (inString) {
            pos = scanStringEnd(text, pos);
            continue;
          }
          const ch = text.charCodeAt(pos);
          if (ch === 34 /* '"' */) {
            inString = true;
            escaped = false;
            pos++;
          } else if (ch === 123 /* '{' */ || ch === 91 /* '[' */) {
            valueDepth++;
            pos++;
          } else if (ch === 125 /* '}' */ || ch === 93 /* ']' */) {
            valueDepth--;
            pos++;
            if (valueDepth === 0) {
              completed = true;
              break;
            }
          } else {
            pos++;
          }
        }
        chunks.push(text.slice(startPos, pos));
        if (completed) {
          const raw = flushChunks();
          assignTopLevelKey(currentKey, raw);
          ctx.state = 'EXPECT_ROOT_KEY_OR_END';
        }
        continue;
      }

      if (ctx.state === 'IN_IMAGES_ARRAY') {
        while (pos < len) {
          const ch = text.charCodeAt(pos);
          if (isWhitespaceCode(ch) || ch === 44 /* ',' */) {
            pos++;
          } else {
            break;
          }
        }
        if (pos >= len) break;
        const ch = text.charCodeAt(pos);
        if (ch === 93 /* ']' */) {
          pos++;
          ctx.state = 'EXPECT_ROOT_KEY_OR_END';
          continue;
        }
        if (ch === 123 /* '{' */) {
          chunks = [];
          inString = false;
          escaped = false;
          valueDepth = 0;
          readingImageNonObject = false;
          ctx.state = 'READ_IMAGE_ITEM';
          continue;
        }
        // Unexpected non-object entry inside images array (skip cleanly)
        chunks = [];
        inString = false;
        escaped = false;
        valueDepth = ch === 91 ? 0 : 1;
        readingImageNonObject = true;
        ctx.state = 'READ_IMAGE_ITEM';
        continue;
      }

      if (ctx.state === 'READ_IMAGE_ITEM') {
        if (readingImageNonObject) {
          while (pos < len) {
            if (inString) {
              pos = scanStringEnd(text, pos);
              continue;
            }
            const ch = text.charCodeAt(pos);
            if (ch === 34) {
              inString = true;
              escaped = false;
              pos++;
            } else if (ch === 44 /* ',' */ || ch === 93 /* ']' */) {
              ctx.state = 'IN_IMAGES_ARRAY';
              break;
            } else {
              pos++;
            }
          }
          continue;
        }

        const startPos = pos;
        let completed = false;
        while (pos < len) {
          if (inString) {
            pos = scanStringEnd(text, pos);
            continue;
          }
          const ch = text.charCodeAt(pos);
          if (ch === 34 /* '"' */) {
            inString = true;
            escaped = false;
            pos++;
          } else if (ch === 123 /* '{' */ || ch === 91 /* '[' */) {
            valueDepth++;
            pos++;
          } else if (ch === 125 /* '}' */ || ch === 93 /* ']' */) {
            valueDepth--;
            pos++;
            if (valueDepth === 0) {
              completed = true;
              break;
            }
          } else {
            pos++;
          }
        }
        chunks.push(text.slice(startPos, pos));
        if (completed) {
          const rawItem = flushChunks();
          let item: BackupImageInput;
          try {
            item = JSON.parse(rawItem) as BackupImageInput;
          } catch {
            throw new Error(`Dữ liệu ảnh thứ ${imageCount + 1} trong tệp sao lưu bị hỏng.`);
          }
          imageCount++;
          await callbacks.onImage(item, imageCount);
          ctx.state = 'IN_IMAGES_ARRAY';
        }
      }
    }
  };

  const decoder = new TextDecoder('utf-8');
  let readBytes = 0;

  if (typeof file.stream === 'function') {
    const reader = file.stream().getReader();
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value && value.byteLength > 0) {
          readBytes += value.byteLength;
          const text = decoder.decode(value, { stream: true });
          if (text) {
            await processTextChunk(text);
          }
          callbacks.onProgressBytes?.(readBytes, file.size);
        }
      }
      const tail = decoder.decode();
      if (tail) {
        await processTextChunk(tail);
      }
    } finally {
      reader.releaseLock();
    }
  } else {
    const CHUNK_BYTES = 1024 * 1024;
    for (let offset = 0; offset < file.size; offset += CHUNK_BYTES) {
      const slice = file.slice(offset, offset + CHUNK_BYTES);
      const buf = new Uint8Array(await slice.arrayBuffer());
      readBytes += buf.byteLength;
      const text = decoder.decode(buf, { stream: true });
      if (text) {
        await processTextChunk(text);
      }
      callbacks.onProgressBytes?.(readBytes, file.size);
    }
    const tail = decoder.decode();
    if (tail) {
      await processTextChunk(tail);
    }
  }

  const finalState: ParserState = ctx.state;
  if (!foundImagesArray || finalState !== 'DONE') {
    throw new Error(
      !foundImagesArray
        ? 'Tệp JSON không có danh sách ảnh ("images") hợp lệ.'
        : 'Tệp sao lưu bị cắt cụt hoặc chưa kết thúc đúng cấu trúc JSON.'
    );
  }

  return metadata;
}
