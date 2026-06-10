'use client'

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { type BrandProfile } from '@/lib/brandProfile'
import { getOrCreateBrowserUserId, USER_ID_HEADER } from '@/lib/userId'
import { USER_EMAIL_HEADER } from '@/lib/userEmail'
import { useSSO } from '@/components/SSOGuard'

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
  // Start null — UI renders a "[Brand]" placeholder and the onboarding modal
  // auto-opens until the user saves a real profile. fetchProfile overrides
  // with the real saved profile when one exists in the DB.
  const [profile, setProfile] = useState<BrandProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Stable per-browser identifier. Computed once on mount; persists in localStorage.
  // Sent as a header on every API call to scope reads/writes to this browser only.
  const [userId, setUserId] = useState<string>('')
  const { email } = useSSO()

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
        headers: {
          [USER_ID_HEADER]: userId,
          ...(email ? { [USER_EMAIL_HEADER]: email } : {}),
        },
      })
      if (res.status === 404) {
        // No saved profile yet — leave profile null so the placeholder shows
        // and the onboarding modal can auto-open.
        setProfile(null)
        return
      }
      const json = await res.json().catch(() => null)
      if (json?.success && json.data) {
        setProfile(json.data as BrandProfile)
      } else {
        // Any non-success response — treat as "no profile" and leave null
        // so the user sees the placeholder + onboarding modal.
        setError(json?.error || `unexpected status ${res.status}`)
        setProfile(null)
      }
    } catch (err: any) {
      // Network error, JSON parse failure, etc. — leave profile null.
      setError(err?.message || 'network error')
      setProfile(null)
    } finally {
      setLoading(false)
    }
  }, [userId, email])

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
          ...(email ? { [USER_EMAIL_HEADER]: email } : {}),
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
  }, [userId, email])

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
// throwing here would crash the whole tree during that tick. Sections fall
// back to emptyBrandProfile() via their `profile || empty` pattern until the
// provider hydrates; the header shows a "[Brand]" placeholder.
const NO_PROVIDER_DEFAULT: BrandProfileContextValue = {
  profile: null,
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
