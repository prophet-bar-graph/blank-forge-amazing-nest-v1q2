// POST /api/admin/unlock-requests/[id]/deny — flips a request to denied.
// Does NOT touch the BrandProfile (lock stays as-is).
// Uses raw MongoDB collection (lib/adminDb) because lyzr-architect's RLS
// plugin has no admin-bypass mechanism.

import { NextRequest, NextResponse } from 'next/server'
import { adminBrandUnlockRequestsCollection, ObjectId } from '@/lib/adminDb'
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

    let objectId: ObjectId
    try {
      objectId = new ObjectId(id)
    } catch {
      return NextResponse.json({ success: false, error: 'invalid request id' }, { status: 400 })
    }

    const body = await req.json().catch(() => ({}))
    const denialReason = typeof body?.denialReason === 'string'
      ? body.denialReason.trim().slice(0, MAX_REASON_CHARS)
      : ''

    const coll = await adminBrandUnlockRequestsCollection()
    const doc = await coll.findOne({ _id: objectId })
    if (!doc) {
      return NextResponse.json({ success: false, error: 'request not found' }, { status: 404 })
    }
    if (doc.status !== 'pending') {
      return NextResponse.json(
        { success: false, error: `request status is ${doc.status}, expected pending` },
        { status: 409 }
      )
    }

    const now = new Date()
    await coll.updateOne(
      { _id: objectId },
      { $set: { status: 'denied', denialReason, decidedBy: email, decidedAt: now } }
    )

    const updated = await coll.findOne({ _id: objectId })
    return NextResponse.json({ success: true, data: updated })
  } catch (err: any) {
    console.error('[API] POST /api/admin/unlock-requests/[id]/deny error:', err)
    return NextResponse.json(
      { success: false, error: err?.message || 'unknown error' },
      { status: 500 }
    )
  }
}
