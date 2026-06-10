// POST /api/admin/unlock-requests/[id]/approve — flips a request to approved
// AND sets the matching BrandProfile.unlockGranted = true. Two-step (Mongo has
// no free cross-collection transaction): profile first, then request, so the
// failure mode favors the user (they can save once even if the request flag
// update fails).

import { NextRequest, NextResponse } from 'next/server'
import { runWithContext } from 'lyzr-architect'
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

    const result = await runWithContext(
      { userId: 'admin-action', isAdmin: true },
      async () => {
        const RequestModel = await getBrandUnlockRequestModel()
        const ProfileModel = await getBrandProfileModel()

        const request = await RequestModel.findById(id)
        if (!request) return { __notFound: true } as const
        if (request.status !== 'pending') {
          return { __wrongStatus: request.status } as const
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

        return request.toObject?.() ?? request
      }
    )

    if (result && (result as any).__notFound) {
      return NextResponse.json({ success: false, error: 'request not found' }, { status: 404 })
    }
    if (result && (result as any).__wrongStatus) {
      return NextResponse.json(
        { success: false, error: `request status is ${(result as any).__wrongStatus}, expected pending` },
        { status: 409 }
      )
    }

    return NextResponse.json({ success: true, data: result })
  } catch (err: any) {
    console.error('[API] POST /api/admin/unlock-requests/[id]/approve error:', err)
    return NextResponse.json(
      { success: false, error: err?.message || 'unknown error' },
      { status: 500 }
    )
  }
}
