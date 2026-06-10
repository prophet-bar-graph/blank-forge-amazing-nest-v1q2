// POST /api/admin/unlock-requests/[id]/deny — flips a request to denied.
// Does NOT touch the BrandProfile (lock stays as-is).
// Uses the skipRLS admin variant because the request is owned by a different user.

import { NextRequest, NextResponse } from 'next/server'
import getBrandUnlockRequestModel from '@/models/brandUnlockRequest'
import { isAdminEmail } from '@/lib/admin'
import { USER_EMAIL_HEADER } from '@/lib/userEmail'

export const dynamic = 'force-dynamic'

const MAX_REASON_CHARS = 500

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const email = req.headers.get(USER_EMAIL_HEADER)
    if (!isAdminEmail(email)) {
      return NextResponse.json({ success: false, error: 'admin only' }, { status: 403 })
    }

    const { id } = await ctx.params
    const body = await req.json().catch(() => ({}))
    const denialReason = typeof body?.denialReason === 'string'
      ? body.denialReason.trim().slice(0, MAX_REASON_CHARS)
      : ''

    const Model = await getBrandUnlockRequestModel({ admin: true })
    const doc = await Model.findById(id)
    if (!doc) {
      return NextResponse.json({ success: false, error: 'request not found' }, { status: 404 })
    }
    if (doc.status !== 'pending') {
      return NextResponse.json(
        { success: false, error: `request status is ${doc.status}, expected pending` },
        { status: 409 }
      )
    }

    doc.status = 'denied'
    doc.denialReason = denialReason
    doc.decidedBy = email
    doc.decidedAt = new Date()
    await doc.save()

    const data = doc.toObject?.() ?? doc
    return NextResponse.json({ success: true, data })
  } catch (err: any) {
    console.error('[API] POST /api/admin/unlock-requests/[id]/deny error:', err)
    return NextResponse.json(
      { success: false, error: err?.message || 'unknown error' },
      { status: 500 }
    )
  }
}
