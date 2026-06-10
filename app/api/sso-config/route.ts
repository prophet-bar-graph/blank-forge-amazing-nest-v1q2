import { NextResponse } from 'next/server'
import { getAdminEmails } from '@/lib/admin'

// Server-side only — ARCHITECT_BACKEND_URL and ARCHITECT_TENANT_ID are never
// exposed in the client JS bundle. Returns { enabled: false } when not set
// (sandbox preview, SaaS tenants) so SSOGuard is a no-op.
//
// ADDITIVE: always include admin_emails so the client can compute isAdmin
// regardless of whether Keycloak is enabled (local dev paths need this too).

export async function GET() {
  const admin_emails = getAdminEmails()

  if (process.env.SANDBOX_MODE === 'true') {
    return NextResponse.json({ enabled: false, admin_emails })
  }

  const backendUrl = process.env.ARCHITECT_BACKEND_URL
  const tenantId = process.env.ARCHITECT_TENANT_ID || process.env.TENANT_ID

  if (!backendUrl) {
    return NextResponse.json({ enabled: false, admin_emails })
  }

  try {
    const res = await fetch(`${backendUrl}/api/v1/tenant/sso-config`, {
      headers: tenantId ? { 'X-Tenant': tenantId } : {},
      next: { revalidate: 300 },
    })
    if (!res.ok) {
      return NextResponse.json({ enabled: false, admin_emails })
    }
    const config = await res.json()
    return NextResponse.json({ ...config, admin_emails })
  } catch {
    return NextResponse.json({ enabled: false, admin_emails })
  }
}
