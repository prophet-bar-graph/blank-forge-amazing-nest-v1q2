// POST /api/admin/unlock-requests/[id]/approve — flips a request to approved
// AND sets the matching BrandProfile.unlockGranted = true. Two-step (Mongo has
// no free cross-collection transaction): profile first, then request, so the
// failure mode favors the user.
//
// Uses skipRLS admin variants because the admin is updating data owned by a
// different user (the requester).

import { NextRequest, NextResponse } from 'next/server'
import getBrandProfileModel from '@/models/brandProfile'
import getBrandUnlockRequestModel from '@/models/brandUnlockRequest'
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

    const RequestModel = await getBrandUnlockRequestModel({ admin: true })
    const ProfileModel = await getBrandProfileModel({ admin: true })

    const request = await RequestModel.findById(id)
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
    const ownerUserId = request.owner_user_id
    await ProfileModel.findOneAndUpdate(
      { owner_user_id: ownerUserId },
      { $set: { unlockGranted: true } },
      { upsert: false }
    )

    // Step 2: mark request approved.
    request.status = 'approved'
    request.decidedBy = email
    request.decidedAt = new Date()
    await request.save()

    const data = request.toObject?.() ?? request
    return NextResponse.json({ success: true, data })
  } catch (err: any) {
    console.error('[API] POST /api/admin/unlock-requests/[id]/approve error:', err)
    return NextResponse.json(
      { success: false, error: err?.message || 'unknown error' },
      { status: 500 }
    )
  }
}
