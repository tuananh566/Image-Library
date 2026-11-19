const ADMIN_AUTH_EXPIRES_KEY = 'khoanh_admin_expires_at';
const LEGACY_ADMIN_AUTH_KEY = 'khoanh_admin_auth';
const UNLIMITED_SESSION_VALUE = 'unlimited';

export const ADMIN_SESSION_DURATION_MS = 60 * 60 * 1000; // 1 hour

export function getAdminExpiresAt(): number | null {
  if (typeof window === 'undefined') return null;

  localStorage.removeItem(LEGACY_ADMIN_AUTH_KEY);

  const raw = localStorage.getItem(ADMIN_AUTH_EXPIRES_KEY);
  if (!raw) return null;

  if (raw === UNLIMITED_SESSION_VALUE) {
    return Infinity;
  }

  const expiresAt = Number(raw);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    localStorage.removeItem(ADMIN_AUTH_EXPIRES_KEY);
    return null;
  }

  return expiresAt;
}

export function grantAdminSession(options?: { unlimited?: boolean }): number {
  if (options?.unlimited) {
    if (typeof window !== 'undefined') {
      localStorage.setItem(ADMIN_AUTH_EXPIRES_KEY, UNLIMITED_SESSION_VALUE);
      localStorage.removeItem(LEGACY_ADMIN_AUTH_KEY);
    }
    return Infinity;
  }

  const expiresAt = Date.now() + ADMIN_SESSION_DURATION_MS;
  if (typeof window !== 'undefined') {
    localStorage.setItem(ADMIN_AUTH_EXPIRES_KEY, String(expiresAt));
    localStorage.removeItem(LEGACY_ADMIN_AUTH_KEY);
  }
  return expiresAt;
}

export function clearAdminSession(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(ADMIN_AUTH_EXPIRES_KEY);
  localStorage.removeItem(LEGACY_ADMIN_AUTH_KEY);
}
