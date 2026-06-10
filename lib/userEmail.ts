// Client-side identity resolver. Used when Keycloak SSO is off (local dev).
// Resolution priority:
//   1. ?as=<value> query param (shortcuts: 'admin' → ddowling, 'member' → test member)
//   2. localStorage 'brand-studio-user-email' (set by previous ?as= use)
//   3. NEXT_PUBLIC_DEV_USER_EMAIL env-var fallback
//
// Returns null when running on the server or when localStorage is unavailable.

const STORAGE_KEY = 'brand-studio-user-email'

const SHORTCUTS: Record<string, string> = {
  admin: 'ddowling@prophet.com',
  member: 'member@test.local',
}

function readFromQueryString(): string | null {
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(window.location.search)
  const as = params.get('as')
  if (!as) return null
  return SHORTCUTS[as.toLowerCase()] ?? as
}

function readFromStorage(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function writeToStorage(email: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, email)
  } catch {
    // localStorage unavailable; silently ignore
  }
}

/**
 * Resolves the local-dev user email, applying the query-param override if present
 * and persisting it for future page loads. Idempotent — safe to call from useEffect.
 */
export function resolveLocalUserEmail(): string | null {
  const fromQuery = readFromQueryString()
  if (fromQuery) {
    writeToStorage(fromQuery)
    return fromQuery
  }
  const fromStorage = readFromStorage()
  if (fromStorage) return fromStorage
  const fromEnv = process.env.NEXT_PUBLIC_DEV_USER_EMAIL
  if (fromEnv) return fromEnv
  return null
}

// Header name for cross-route identity. Mirrors USER_ID_HEADER's role.
export const USER_EMAIL_HEADER = 'x-brand-user-email'
