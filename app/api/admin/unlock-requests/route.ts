// GET /api/admin/unlock-requests — admin-only listing of unlock requests.
// Uses runWithContext({ isAdmin: true }) to bypass per-owner RLS and see
// requests from all users. Gated by isAdminEmail() — returns 403 otherwise.

import { NextRequest, NextResponse } from 'next/server'
import { runWithContext } from 'lyzr-architect'
import getBrandUnlockRequestModel from '@/models/brandUnlockRequest'
import { isAdminEmail } from '@/lib/admin'
import { USER_EMAIL_HEADER } from '@/lib/userEmail'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const email = req.headers.get(USER_EMAIL_HEADER)
    if (!isAdminEmail(email)) {
      return NextResponse.json(
        { success: false, error: 'admin only' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status') || 'pending'

    const items = await runWithContext(
      { userId: 'admin-query', isAdmin: true },
      async () => {
        const Model = await getBrandUnlockRequestModel()
        const docs = await Model.find({ status }).sort({ createdAt: 1 })
        return docs.map((d: any) => d.toObject?.() ?? d)
      }
    )

    return NextResponse.json({ success: true, data: items })
  } catch (err: any) {
    console.error('[API] GET /api/admin/unlock-requests error:', err)
    return NextResponse.json(
      { success: false, error: err?.message || 'unknown error' },
      { status: 500 }
    )
  }
}
