// Per-browser stable identifier used as the BrandProfile owner_user_id.
// Each browser session gets its own UUID, persisted to localStorage so it
// survives page reloads. Different browsers (or incognito sessions) get
// different IDs, which means different BrandProfile docs via RLS auto-scoping.
//
// Limitations:
// - This is not a real auth identity. It identifies a browser, not a person.
//   Clearing site data resets the ID (losing the user's saved profile).
// - In production with Keycloak SSO, this is layered ON TOP of the SSO gate:
//   users must still authenticate via Keycloak to reach the app, but the
//   in-app data is scoped by the browser UUID, not the Keycloak userId.
// - For a real per-person identity (where the same person on two laptops
//   would see the same profile), wire the SSOGuard's Keycloak userId through
//   to this helper. v2 enhancement.

const STORAGE_KEY = 'brand-studio-user-id'

export function getOrCreateBrowserUserId(): string {
  if (typeof window === 'undefined') {
    // Server side — should not be called from server context. Returning a
    // stable string here avoids errors but it would short the per-user
    // model if it ever fired; callers must only invoke from the client.
    return 'ssr-fallback'
  }
  try {
    let id = window.localStorage.getItem(STORAGE_KEY)
    if (!id) {
      // crypto.randomUUID is available in all evergreen browsers and Next.js
      // dev contexts. Fall back to a Math.random-based id only if unavailable.
      const uuid = typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`
      id = `browser-${uuid}`
      window.localStorage.setItem(STORAGE_KEY, id)
    }
    return id
  } catch {
    // localStorage unavailable (private mode, sandboxed iframe, etc.).
    // All such sessions collapse to one ID — they share the same profile.
    return 'localstorage-unavailable'
  }
}

// Header name used to convey the browser user id to API routes.
export const USER_ID_HEADER = 'x-brand-user-id'
