'use client'

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { TPG_SAMPLE_PROFILE, type BrandProfile } from '@/lib/brandProfile'
import { getOrCreateBrowserUserId, USER_ID_HEADER } from '@/lib/userId'

interface BrandProfileContextValue {
  profile: BrandProfile | null      // null = no profile yet → modal should open
  loading: boolean                  // true during the initial fetch
  error: string | null              // non-null = network/server error (not "not_found")
  userId: string                    // the per-browser user id used for RLS scoping
  refresh: () => Promise<void>
  applyProfile: (next: BrandProfile) => Promise<BrandProfile | null>
}

const BrandProfileContext = createContext<BrandProfileContextValue | null>(null)

export function BrandProfileProvider({ children }: { children: React.ReactNode }) {
  // Start with TPG so SSR + the first client render both have a populated
  // brand even before fetchProfile runs (which it won't if React fails to
  // hydrate). fetchProfile overrides with the real saved profile when one
  // exists in the DB.
  const [profile, setProfile] = useState<BrandProfile | null>(TPG_SAMPLE_PROFILE)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Stable per-browser identifier. Computed once on mount; persists in localStorage.
  // Sent as a header on every API call to scope reads/writes to this browser only.
  const [userId, setUserId] = useState<string>('')

  useEffect(() => {
    setUserId(getOrCreateBrowserUserId())
  }, [])

  const fetchProfile = useCallback(async () => {
    if (!userId) return  // wait until userId is computed (one tick after mount)
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/brand-profile', {
        cache: 'no-store',
        headers: { [USER_ID_HEADER]: userId },
      })
      if (res.status === 404) {
        // No saved profile yet — fall back to TPG default in-memory.
        setProfile(TPG_SAMPLE_PROFILE)
        return
      }
      const json = await res.json().catch(() => null)
      if (json?.success && json.data) {
        setProfile(json.data as BrandProfile)
      } else {
        // Any non-success response (500 from DB-init failure in preview env,
        // 400 from missing user header, empty body, etc.) — treat as "no
        // profile" and fall back to TPG. Capture the error for diagnostics
        // but don't leave the user staring at a "Brand" shell.
        setError(json?.error || `unexpected status ${res.status}`)
        setProfile(TPG_SAMPLE_PROFILE)
      }
    } catch (err: any) {
      // Network error, JSON parse failure, etc. — fall back to TPG.
      setError(err?.message || 'network error')
      setProfile(TPG_SAMPLE_PROFILE)
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => { fetchProfile() }, [fetchProfile])

  const applyProfile = useCallback(async (next: BrandProfile): Promise<BrandProfile | null> => {
    if (!userId) {
      setError('user id not ready')
      return null
    }
    try {
      const res = await fetch('/api/brand-profile/apply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [USER_ID_HEADER]: userId,
        },
        body: JSON.stringify(next),
      })
      // The deployed platform sometimes returns plain-text "Internal Server
      // Error" (or an HTML error page) instead of our route's JSON 500. Read
      // the body as text first, then try JSON.parse — otherwise res.json()
      // throws "Unexpected token 'I', "Internal S"... is not valid JSON" and
      // the save appears to crash with no useful message.
      const raw = await res.text()
      let json: any = null
      try { json = raw ? JSON.parse(raw) : null } catch { /* non-JSON body */ }
      if (json?.success && json.data) {
        setProfile(json.data as BrandProfile)
        setError(null)
        return json.data as BrandProfile
      }
      const reason =
        json?.error ||
        (raw && !raw.trim().startsWith('{') ? raw.trim().slice(0, 200) : '') ||
        `failed to apply profile (status ${res.status})`
      setError(reason)
      return null
    } catch (err: any) {
      setError(err?.message || 'network error')
      return null
    }
  }, [userId])

  const value = useMemo(
    () => ({ profile, loading, error, userId, refresh: fetchProfile, applyProfile }),
    [profile, loading, error, userId, fetchProfile, applyProfile]
  )

  return (
    <BrandProfileContext.Provider value={value}>
      {children}
    </BrandProfileContext.Provider>
  )
}

// Returns a permissive default when called outside the provider. ClientProviders
// renders children without the provider for one tick during SSR/pre-mount —
// throwing here would crash the whole tree during that tick. The default makes
// sections fall back to emptyBrandProfile() via their `profile || empty`
// pattern until the provider hydrates.
// TPG as the no-provider default so sections that fall through this code
// path (rendered before the provider mounts, or if the provider fails to
// mount at all in a broken-hydration preview) still see a populated brand
// instead of an empty `Brand` shell.
const NO_PROVIDER_DEFAULT: BrandProfileContextValue = {
  profile: TPG_SAMPLE_PROFILE,
  loading: false,
  error: null,
  userId: '',
  refresh: async () => {},
  applyProfile: async () => null,
}

export function useBrandProfile(): BrandProfileContextValue {
  const ctx = useContext(BrandProfileContext)
  return ctx ?? NO_PROVIDER_DEFAULT
}
