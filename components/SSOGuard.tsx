"use client"

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react"
import { resolveLocalUserEmail } from "@/lib/userEmail"

interface SSOConfig {
  enabled: boolean
  keycloak_url?: string
  realm?: string
  client_id?: string
  idp_hint?: string
  admin_emails?: string[]   // NEW: surfaced from server config so client can compute isAdmin
}

interface SSOContextValue {
  email: string | null
  givenName: string | null
  familyName: string | null
  isAdmin: boolean
  adminEmails: string[]
}

const SSOContext = createContext<SSOContextValue>({ email: null, givenName: null, familyName: null, isAdmin: false, adminEmails: [] })

export function useSSO(): SSOContextValue {
  return useContext(SSOContext)
}

/**
 * Extracts a usable email from Keycloak's parsed token. Defensive fallback chain:
 *   1. `email` claim (standard OIDC)
 *   2. `preferred_username` IF it looks email-shaped (contains '@')
 *   3. null — caller treats as anonymous (admin check fails closed)
 *
 * Logs a console warning if we fall through to (3) so anyone testing on the
 * deployed app notices Keycloak isn't emitting a usable identity claim.
 */
function emailFromKeycloakClaims(claims: any): string | null {
  if (claims && typeof claims.email === 'string' && claims.email.includes('@')) {
    return claims.email
  }
  if (claims && typeof claims.preferred_username === 'string' && claims.preferred_username.includes('@')) {
    return claims.preferred_username
  }
  console.warn('[brand-access] No usable email claim found in Keycloak token. Admin features disabled.', {
    sub: claims?.sub,
    preferred_username: claims?.preferred_username,
  })
  return null
}

function namesFromKeycloakClaims(claims: any): { givenName: string | null; familyName: string | null } {
  return {
    givenName: (typeof claims?.given_name === 'string' ? claims.given_name : null) || null,
    familyName: (typeof claims?.family_name === 'string' ? claims.family_name : null) || null,
  }
}

export function SSOGuard({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [contextValue, setContextValue] = useState<SSOContextValue>({ email: null, givenName: null, familyName: null, isAdmin: false, adminEmails: [] })
  const initialised = useRef(false)

  useEffect(() => {
    if (initialised.current) return
    initialised.current = true

    // Iframe sandbox path — SSO disabled, but we still want local-dev identity.
    if (window.self !== window.top) {
      const localEmail = resolveLocalUserEmail()
      setContextValue({ email: localEmail, givenName: null, familyName: null, isAdmin: false, adminEmails: [] })
      setReady(true)
      return
    }

    fetch("/api/sso-config")
      .then<SSOConfig>((r) => r.json())
      .then(async (config) => {
        const adminEmails = Array.isArray(config.admin_emails) ? config.admin_emails : []

        if (!config.enabled) {
          // Local-dev path — no Keycloak; identity from ?as= query / localStorage / env.
          const localEmail = resolveLocalUserEmail()
          const isAdmin = !!localEmail && adminEmails.map(e => e.toLowerCase()).includes(localEmail.toLowerCase())
          setContextValue({ email: localEmail, givenName: null, familyName: null, isAdmin, adminEmails })
          setReady(true)
          return
        }

        const { default: Keycloak } = await import("keycloak-js")
        const kc = new Keycloak({
          url: config.keycloak_url!,
          realm: config.realm!,
          clientId: config.client_id!,
        })

        try {
          // silentCheckSsoRedirectUri is intentionally omitted — Keycloak's
          // frame-ancestors 'self' CSP blocks the hidden iframe it creates,
          // causing every check-sso to fail and trigger an unwanted kc.login().
          // Without it, Keycloak JS falls back to a redirect round-trip which
          // is transparent when the user already has an active session.
          const authenticated = await kc.init({
            onLoad: "check-sso",
            checkLoginIframe: false,
            pkceMethod: "S256",
          })
          if (!authenticated) {
            kc.login({
              redirectUri: window.location.href,
              idpHint: config.idp_hint || undefined,
            })
            return
          }
        } catch {
          kc.login({
            redirectUri: window.location.href,
            idpHint: config.idp_hint || undefined,
          })
          return
        }

        const email = emailFromKeycloakClaims(kc.tokenParsed)
        const { givenName, familyName } = namesFromKeycloakClaims(kc.tokenParsed)
        const isAdmin = !!email && adminEmails.map(e => e.toLowerCase()).includes(email.toLowerCase())
        setContextValue({ email, givenName, familyName, isAdmin, adminEmails })
        setReady(true)
      })
      .catch((err) => {
        console.error("[SSOGuard] Failed to load SSO config:", err)
        // Fail open: treat as no-SSO. Local-dev identity still works.
        const localEmail = resolveLocalUserEmail()
        setContextValue({ email: localEmail, givenName: null, familyName: null, isAdmin: false, adminEmails: [] })
        setReady(true)
      })
  }, [])

  if (!ready) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 32, height: 32, border: "3px solid #e5e7eb", borderTopColor: "#6b7280", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  return <SSOContext.Provider value={contextValue}>{children}</SSOContext.Provider>
}
