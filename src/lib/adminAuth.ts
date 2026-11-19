const ADMIN_AUTH_EXPIRES_KEY = 'khoanh_admin_expires_at';
const ADMIN_LOCKOUT_KEY = 'khoanh_admin_failures';
const LEGACY_ADMIN_AUTH_KEY = 'khoanh_admin_auth';

const ADMIN_PASSWORD = '0358093866';
export const ADMIN_SESSION_DURATION_MS = 60 * 60 * 1000; // 1 hour
const MAX_ADMIN_ATTEMPTS = 5;
const ADMIN_LOCKOUT_MS = 5 * 60 * 1000; // 5 minutes

interface AdminFailureState {
  count: number;
  resetAt: number;
  lockedUntil: number;
}

function readAdminFailureState(): AdminFailureState {
  if (typeof window === 'undefined') {
    return { count: 0, resetAt: 0, lockedUntil: 0 };
  }
  try {
    const raw = localStorage.getItem(ADMIN_LOCKOUT_KEY);
    if (!raw) return { count: 0, resetAt: 0, lockedUntil: 0 };
    const parsed = JSON.parse(raw) as Partial<AdminFailureState>;
    return {
      count: Number(parsed.count) || 0,
      resetAt: Number(parsed.resetAt) || 0,
      lockedUntil: Number(parsed.lockedUntil) || 0,
    };
  } catch {
    return { count: 0, resetAt: 0, lockedUntil: 0 };
  }
}

function writeAdminFailureState(state: AdminFailureState | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (!state) {
      localStorage.removeItem(ADMIN_LOCKOUT_KEY);
    } else {
      localStorage.setItem(ADMIN_LOCKOUT_KEY, JSON.stringify(state));
    }
  } catch {
    // Ignore storage errors
  }
}

export function getAdminExpiresAt(): number | null {
  if (typeof window === 'undefined') return null;

  localStorage.removeItem(LEGACY_ADMIN_AUTH_KEY);

  const raw = localStorage.getItem(ADMIN_AUTH_EXPIRES_KEY);
  if (!raw) return null;

  const expiresAt = Number(raw);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    localStorage.removeItem(ADMIN_AUTH_EXPIRES_KEY);
    return null;
  }

  return expiresAt;
}

export function grantAdminSession(): number {
  const expiresAt = Date.now() + ADMIN_SESSION_DURATION_MS;
  if (typeof window !== 'undefined') {
    localStorage.setItem(ADMIN_AUTH_EXPIRES_KEY, String(expiresAt));
    localStorage.removeItem(LEGACY_ADMIN_AUTH_KEY);
  }
  writeAdminFailureState(null);
  return expiresAt;
}

export function authenticateAdminPassword(
  password: string
): { ok: true; expiresAt: number } | { ok: false; error: string } {
  const now = Date.now();
  const state = readAdminFailureState();

  if (state.lockedUntil > now) {
    const minsLeft = Math.max(1, Math.ceil((state.lockedUntil - now) / 60_000));
    return {
      ok: false,
      error: `Tạm khóa do nhập sai ${MAX_ADMIN_ATTEMPTS} lần liên tiếp. Vui lòng thử lại sau ${minsLeft} phút.`,
    };
  }

  if (password.trim() === ADMIN_PASSWORD) {
    return { ok: true, expiresAt: grantAdminSession() };
  }

  const nextCount = state.resetAt > now ? state.count + 1 : 1;
  const isLockedNow = nextCount >= MAX_ADMIN_ATTEMPTS;
  writeAdminFailureState({
    count: nextCount,
    resetAt: state.resetAt > now ? state.resetAt : now + ADMIN_LOCKOUT_MS,
    lockedUntil: isLockedNow ? now + ADMIN_LOCKOUT_MS : 0,
  });

  if (isLockedNow) {
    return {
      ok: false,
      error: `Bạn đã nhập sai ${MAX_ADMIN_ATTEMPTS} lần liên tiếp. Tạm khóa trong 5 phút.`,
    };
  }

  return {
    ok: false,
    error: `Mật khẩu Admin không đúng. Còn ${MAX_ADMIN_ATTEMPTS - nextCount} lần thử.`,
  };
}

export function clearAdminSession(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(ADMIN_AUTH_EXPIRES_KEY);
  localStorage.removeItem(LEGACY_ADMIN_AUTH_KEY);
}
