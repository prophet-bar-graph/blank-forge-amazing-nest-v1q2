// GET /api/admin/unlock-requests — admin-only listing of unlock requests.
// Uses an unscoped (skipRLS) model variant since this view spans users.

import { NextRequest, NextResponse } from 'next/server'
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

    const Model = await getBrandUnlockRequestModel({ admin: true })
    const docs = await Model.find({ status }).sort({ createdAt: 1 })
    const items = docs.map((d: any) => d.toObject?.() ?? d)

    return NextResponse.json({ success: true, data: items })
  } catch (err: any) {
    console.error('[API] GET /api/admin/unlock-requests error:', err)
    return NextResponse.json(
      { success: false, error: err?.message || 'unknown error' },
      { status: 500 }
    )
  }
}
