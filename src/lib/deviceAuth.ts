import { clearAdminSession } from './adminAuth';

const DEVICE_TOKEN_KEY = 'khoanh_device_token';

export interface TrustedDeviceInfo {
  id: string;
  label: string;
  deviceName?: string;
  systemInfo?: string;
  createdAt: number;
  lastSeenAt: number;
  isCurrent: boolean;
}

export interface DeviceStatusResponse {
  trusted: boolean;
  detectedLabel: string;
  detectedModel?: string;
  systemSummary?: string;
  reason?: string;
  device?: TrustedDeviceInfo;
}

export interface DetectedClientDevice {
  deviceModel: string;
  systemSummary: string;
}

interface NavigatorUADataLike {
  platform?: string;
  getHighEntropyValues?: (hints: string[]) => Promise<{
    model?: string;
    platform?: string;
    platformVersion?: string;
  }>;
}

function detectAppleDeviceModel(isIPad: boolean, isIPhone: boolean): string {
  if (typeof window === 'undefined' || typeof screen === 'undefined') return '';
  const w = Math.min(screen.width, screen.height);
  const h = Math.max(screen.width, screen.height);
  const dpr = Math.round(window.devicePixelRatio || 1);

  if (isIPad) {
    if (w === 820 && h === 1180) return 'iPad Air 4 / 5 / Gen 10';
    if (w === 834 && h === 1194) return 'iPad Pro 11"';
    if (w === 834 && h === 1210) return 'iPad Pro 11" (M4)';
    if (w === 1024 && h === 1366) return 'iPad Pro 12.9" / 13"';
    if (w === 744 && h === 1133) return 'iPad mini 6 / 7';
    if (w === 810 && h === 1080) return 'iPad (10.2")';
    if (w === 768 && h === 1024) return 'iPad (9.7")';
    if (w === 834 && h === 1112) return 'iPad Air 3 / Pro 10.5"';
    return 'iPad';
  }

  if (isIPhone) {
    if (w === 440 && h === 956) return 'iPhone 16 Pro Max';
    if (w === 402 && h === 874) return 'iPhone 16 Pro';
    if (w === 430 && h === 932) return 'iPhone 15 Plus / 15 Pro Max / 16 Plus';
    if (w === 393 && h === 852) return 'iPhone 15 / 15 Pro / 16';
    if (w === 428 && h === 926) return 'iPhone 12 Pro Max / 13 Pro Max / 14 Plus';
    if (w === 390 && h === 844) return 'iPhone 12 / 13 / 14';
    if (w === 375 && h === 812 && dpr >= 3) return 'iPhone X / XS / 11 Pro / 12 mini / 13 mini';
    if (w === 414 && h === 896) return 'iPhone XR / XS Max / 11';
    if (w === 375 && h === 667) return 'iPhone SE / 8';
    if (w === 414 && h === 736) return 'iPhone Plus';
    return 'iPhone';
  }

  return '';
}

function parseAndroidModelFromUa(ua: string): string {
  const match = /Android[^;]*;\s*([^;)]+?)(?:\s+Build\/|[;)])/i.exec(ua);
  if (!match) return '';
  const candidate = match[1].trim();
  if (!candidate || /^K$/i.test(candidate) || /wv$/i.test(candidate) || /Mobile/i.test(candidate)) {
    return '';
  }
  return candidate;
}

export async function detectClientDeviceInfo(): Promise<DetectedClientDevice> {
  if (typeof navigator === 'undefined') {
    return { deviceModel: '', systemSummary: 'Thiết bị · Trình duyệt' };
  }

  const ua = navigator.userAgent || '';
  const isIPhone = /iPhone/i.test(ua);
  const isIPad =
    /iPad/i.test(ua) ||
    (/Macintosh|Mac OS X/i.test(ua) && (navigator.maxTouchPoints || 0) > 1);
  const isAndroid = /Android/i.test(ua);

  let osName = 'Thiết bị';
  if (isIPhone) osName = 'iOS';
  else if (isIPad) osName = 'iPadOS';
  else if (isAndroid) osName = 'Android';
  else if (/Mac OS X|Macintosh/i.test(ua)) osName = 'macOS';
  else if (/Windows/i.test(ua)) osName = 'Windows';
  else if (/Linux/i.test(ua)) osName = 'Linux';

  let browserName = 'Trình duyệt';
  if (/Edg\//i.test(ua) || /EdgiOS/i.test(ua)) browserName = 'Edge';
  else if (/OPR\/|Opera/i.test(ua)) browserName = 'Opera';
  else if (/CriOS|Chrome/i.test(ua)) browserName = 'Chrome';
  else if (/FxiOS|Firefox/i.test(ua)) browserName = 'Firefox';
  else if (/Safari/i.test(ua)) browserName = 'Safari';

  const systemSummary = `${osName} · ${browserName}`;
  let deviceModel = '';

  const uaData = (navigator as Navigator & { userAgentData?: NavigatorUADataLike }).userAgentData;
  if (uaData?.getHighEntropyValues) {
    try {
      const hints = await uaData.getHighEntropyValues(['model', 'platform']);
      if (hints.model && hints.model.trim()) {
        deviceModel = hints.model.trim();
      }
    } catch {
      // Ignore client hints errors
    }
  }

  if (!deviceModel && (isIPad || isIPhone)) {
    deviceModel = detectAppleDeviceModel(isIPad, isIPhone);
  } else if (!deviceModel && isAndroid) {
    deviceModel = parseAndroidModelFromUa(ua) || 'Android';
  } else if (!deviceModel) {
    if (osName === 'macOS') deviceModel = 'Mac';
    else if (osName === 'Windows') deviceModel = 'Windows PC';
    else if (osName === 'Linux') deviceModel = 'Linux PC';
  }

  return {
    deviceModel,
    systemSummary,
  };
}

const unauthorizedListeners = new Set<() => void>();

export function subscribeDeviceUnauthorized(cb: () => void): () => void {
  unauthorizedListeners.add(cb);
  return () => {
    unauthorizedListeners.delete(cb);
  };
}

export function notifyDeviceUnauthorized(): void {
  clearStoredDeviceToken();
  clearAdminSession();
  for (const cb of unauthorizedListeners) {
    cb();
  }
}

export function getStoredDeviceToken(): string {
  if (typeof window === 'undefined') return '';
  try {
    return localStorage.getItem(DEVICE_TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function saveDeviceToken(token: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(DEVICE_TOKEN_KEY, token);
  } catch {
    // Ignore storage errors
  }
}

export function clearStoredDeviceToken(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(DEVICE_TOKEN_KEY);
  } catch {
    // Ignore storage errors
  }
}

export function getDeviceAuthHeaders(): Record<string, string> {
  const token = getStoredDeviceToken();
  return token ? { 'X-Device-Token': token } : {};
}

export function attachDeviceTokenToUrl(url: string): string {
  if (!url || !url.startsWith('/api/')) return url;
  const token = getStoredDeviceToken();
  if (!token) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}dt=${encodeURIComponent(token)}`;
}

export function getClientDeviceFingerprint(): string {
  if (typeof window === 'undefined') return '';
  const platform = navigator.platform || '';
  const lang = navigator.language || '';
  const screenRes =
    typeof screen !== 'undefined' ? `${screen.width}x${screen.height}` : '';
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  return [platform, lang, screenRes, tz].filter(Boolean).join('|');
}

export async function checkDeviceStatus(): Promise<DeviceStatusResponse> {
  const info = await detectClientDeviceInfo();
  const res = await fetch('/api/device/status', {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      ...getDeviceAuthHeaders(),
    },
    body: JSON.stringify({
      deviceModel: info.deviceModel,
      systemSummary: info.systemSummary,
      fingerprint: getClientDeviceFingerprint(),
    }),
  });
  if (!res.ok) {
    throw new Error('Không thể kiểm tra trạng thái thiết bị');
  }
  const data = (await res.json()) as DeviceStatusResponse;
  if (!data.trusted) {
    clearStoredDeviceToken();
    clearAdminSession();
  }
  return {
    ...data,
    detectedModel: data.detectedModel || info.deviceModel,
    systemSummary: data.systemSummary || info.systemSummary,
  };
}

export async function verifyNewDevice(
  code: string,
  deviceLabel?: string
): Promise<{
  trusted: boolean;
  deviceToken: string;
  device: TrustedDeviceInfo;
}> {
  const info = await detectClientDeviceInfo();
  const res = await fetch('/api/device/verify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      code: code.trim(),
      deviceLabel: deviceLabel?.trim() || undefined,
      deviceModel: info.deviceModel,
      systemSummary: info.systemSummary,
      fingerprint: getClientDeviceFingerprint(),
    }),
  });
  const payload = (await res.json().catch(() => ({}))) as {
    trusted?: boolean;
    deviceToken?: string;
    device?: TrustedDeviceInfo;
    error?: string;
  };
  if (!res.ok || !payload.trusted || !payload.deviceToken || !payload.device) {
    throw new Error(payload.error || 'Mã xác nhận không đúng.');
  }
  saveDeviceToken(payload.deviceToken);
  return {
    trusted: true,
    deviceToken: payload.deviceToken,
    device: payload.device,
  };
}

export async function fetchTrustedDevices(): Promise<{
  currentDeviceId: string | null;
  devices: TrustedDeviceInfo[];
}> {
  const res = await fetch('/api/devices', {
    cache: 'no-store',
    headers: getDeviceAuthHeaders(),
  });
  if (res.status === 401) {
    notifyDeviceUnauthorized();
    throw new Error('DEVICE_NOT_TRUSTED');
  }
  if (!res.ok) {
    throw new Error('Không thể tải danh sách thiết bị');
  }
  return res.json();
}

export async function renameTrustedDevice(
  deviceId: string,
  deviceName: string
): Promise<TrustedDeviceInfo> {
  const res = await fetch(`/api/devices/${encodeURIComponent(deviceId)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...getDeviceAuthHeaders(),
    },
    body: JSON.stringify({ deviceName: deviceName.trim() }),
  });
  if (res.status === 401) {
    notifyDeviceUnauthorized();
    throw new Error('DEVICE_NOT_TRUSTED');
  }
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || 'Không thể đổi tên thiết bị');
  }
  const data = (await res.json()) as { device: TrustedDeviceInfo };
  return data.device;
}

export async function revokeTrustedDevice(
  deviceId: string
): Promise<{ ok: boolean; revokedCurrent: boolean }> {
  const res = await fetch(`/api/devices/${encodeURIComponent(deviceId)}`, {
    method: 'DELETE',
    headers: getDeviceAuthHeaders(),
  });
  if (res.status === 401) {
    notifyDeviceUnauthorized();
    throw new Error('DEVICE_NOT_TRUSTED');
  }
  if (!res.ok) {
    throw new Error('Không thể thu hồi quyền thiết bị');
  }
  const data = (await res.json()) as { ok: boolean; revokedCurrent: boolean };
  if (data.revokedCurrent) {
    notifyDeviceUnauthorized();
  }
  return data;
}

export async function logoutCurrentDevice(): Promise<void> {
  try {
    await fetch('/api/device/logout', {
      method: 'POST',
      headers: getDeviceAuthHeaders(),
    });
  } finally {
    notifyDeviceUnauthorized();
  }
}
