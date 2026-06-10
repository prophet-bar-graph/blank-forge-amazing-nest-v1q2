// GET /api/admin/unlock-requests — admin-only listing of unlock requests.
// Uses the raw MongoDB collection to bypass lyzr-architect's RLS plugin
// (which scopes every Mongoose query to ctx.userId — no admin bypass exists
// in the plugin API).

import { NextRequest, NextResponse } from 'next/server'
import { adminBrandUnlockRequestsCollection } from '@/lib/adminDb'
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

    const coll = await adminBrandUnlockRequestsCollection()
    const docs = await coll.find({ status }).sort({ createdAt: 1 }).toArray()

    return NextResponse.json({ success: true, data: docs })
  } catch (err: any) {
    console.error('[API] GET /api/admin/unlock-requests error:', err)
    return NextResponse.json(
      { success: false, error: err?.message || 'unknown error' },
      { status: 500 }
    )
  }
}
