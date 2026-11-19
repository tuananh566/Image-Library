const DEVICE_TOKEN_KEY = 'khoanh_device_token';

export interface TrustedDeviceInfo {
  id: string;
  label: string;
  createdAt: number;
  lastSeenAt: number;
  isCurrent: boolean;
}

export interface DeviceStatusResponse {
  trusted: boolean;
  detectedLabel: string;
  reason?: string;
  device?: TrustedDeviceInfo;
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
  const res = await fetch('/api/device/status', {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      ...getDeviceAuthHeaders(),
    },
    body: JSON.stringify({
      fingerprint: getClientDeviceFingerprint(),
    }),
  });
  if (!res.ok) {
    throw new Error('Không thể kiểm tra trạng thái thiết bị');
  }
  const data = (await res.json()) as DeviceStatusResponse;
  if (!data.trusted) {
    clearStoredDeviceToken();
  }
  return data;
}

export async function verifyNewDevice(
  code: string,
  deviceLabel?: string
): Promise<{
  trusted: boolean;
  deviceToken: string;
  device: TrustedDeviceInfo;
}> {
  const res = await fetch('/api/device/verify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      code: code.trim(),
      deviceLabel: deviceLabel?.trim() || undefined,
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
