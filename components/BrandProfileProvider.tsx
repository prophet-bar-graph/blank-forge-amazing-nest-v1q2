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
  const [profile, setProfile] = useState<BrandProfile | null>(null)
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
      const json = await res.json()
      if (json?.success && json.data) {
        setProfile(json.data as BrandProfile)
        setError(null)
        return json.data as BrandProfile
      }
      setError(json?.error || 'failed to apply profile')
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
const NO_PROVIDER_DEFAULT: BrandProfileContextValue = {
  profile: null,
  loading: true,
  error: null,
  userId: '',
  refresh: async () => {},
  applyProfile: async () => null,
}

export function useBrandProfile(): BrandProfileContextValue {
  const ctx = useContext(BrandProfileContext)
  return ctx ?? NO_PROVIDER_DEFAULT
}
