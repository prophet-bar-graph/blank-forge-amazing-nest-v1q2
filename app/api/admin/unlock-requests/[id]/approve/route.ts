// POST /api/admin/unlock-requests/[id]/approve — flips a request to approved
// AND sets the matching BrandProfile.unlockGranted = true. Two-step: profile
// first, then request, so the failure mode favors the user (they can save
// once even if the request flag update fails).
//
// Uses raw MongoDB collections (lib/adminDb) because lyzr-architect's RLS
// plugin has no admin-bypass mechanism.

import { NextRequest, NextResponse } from 'next/server'
import { adminBrandUnlockRequestsCollection, adminBrandProfilesCollection, ObjectId } from '@/lib/adminDb'
import { isAdminEmail } from '@/lib/admin'
import { USER_EMAIL_HEADER } from '@/lib/userEmail'

export const dynamic = 'force-dynamic'

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

    const requests = await adminBrandUnlockRequestsCollection()
    const profiles = await adminBrandProfilesCollection()

    const request = await requests.findOne({ _id: objectId })
    if (!request) {
      return NextResponse.json({ success: false, error: 'request not found' }, { status: 404 })
    }
    if (request.status !== 'pending') {
      return NextResponse.json(
        { success: false, error: `request status is ${request.status}, expected pending` },
        { status: 409 }
      )
    }

    // Step 1: unlock the profile (favorable failure mode if step 2 fails).
    await profiles.updateOne(
      { owner_user_id: request.owner_user_id },
      { $set: { unlockGranted: true } }
    )

    // Step 2: mark request approved.
    const now = new Date()
    await requests.updateOne(
      { _id: objectId },
      { $set: { status: 'approved', decidedBy: email, decidedAt: now } }
    )

    const updated = await requests.findOne({ _id: objectId })
    return NextResponse.json({ success: true, data: updated })
  } catch (err: any) {
    console.error('[API] POST /api/admin/unlock-requests/[id]/approve error:', err)
    return NextResponse.json(
      { success: false, error: err?.message || 'unknown error' },
      { status: 500 }
    )
  }
}
