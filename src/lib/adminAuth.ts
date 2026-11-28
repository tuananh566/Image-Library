const ADMIN_AUTH_EXPIRES_KEY = 'khoanh_admin_expires_at';
const SUPER_TOKEN_KEY = 'khoanh_super_token';
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
    localStorage.removeItem(SUPER_TOKEN_KEY);
    return null;
  }

  return expiresAt;
}

export function getSuperAdminToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(SUPER_TOKEN_KEY);
}

export function grantAdminSession(options?: {
  unlimited?: boolean;
  superToken?: string;
}): number {
  if (options?.unlimited) {
    if (typeof window !== 'undefined') {
      localStorage.setItem(ADMIN_AUTH_EXPIRES_KEY, UNLIMITED_SESSION_VALUE);
      if (options.superToken) {
        localStorage.setItem(SUPER_TOKEN_KEY, options.superToken);
      }
      localStorage.removeItem(LEGACY_ADMIN_AUTH_KEY);
    }
    return Infinity;
  }

  const expiresAt = Date.now() + ADMIN_SESSION_DURATION_MS;
  if (typeof window !== 'undefined') {
    localStorage.setItem(ADMIN_AUTH_EXPIRES_KEY, String(expiresAt));
    localStorage.removeItem(SUPER_TOKEN_KEY);
    localStorage.removeItem(LEGACY_ADMIN_AUTH_KEY);
  }
  return expiresAt;
}

export function clearAdminSession(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(ADMIN_AUTH_EXPIRES_KEY);
  localStorage.removeItem(SUPER_TOKEN_KEY);
  localStorage.removeItem(LEGACY_ADMIN_AUTH_KEY);
}
