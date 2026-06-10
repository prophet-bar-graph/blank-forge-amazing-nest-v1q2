// GET /api/brand-profile/unlock-request/latest — returns the calling user's
// most recent unlock request (any status) or null. RLS scopes by owner_user_id.

import { NextRequest, NextResponse } from 'next/server'
import { runWithContext } from 'lyzr-architect'
import getBrandUnlockRequestModel from '@/models/brandUnlockRequest'
import { USER_ID_HEADER } from '@/lib/userId'

export const dynamic = 'force-dynamic'

function readUserId(req: NextRequest): string | null {
  const id = req.headers.get(USER_ID_HEADER)
  return id && id.trim() ? id.trim() : null
}

export async function GET(req: NextRequest) {
  try {
    const userId = readUserId(req)
    if (!userId) {
      return NextResponse.json(
        { success: false, error: `missing ${USER_ID_HEADER} header` },
        { status: 400 }
      )
    }

    const latest = await runWithContext(
      { userId, isAdmin: false },
      async () => {
        const Model = await getBrandUnlockRequestModel()
        const doc = await Model.findOne({}).sort({ createdAt: -1 })
        return doc ? (doc.toObject?.() ?? doc) : null
      }
    )

    return NextResponse.json({ success: true, data: latest })
  } catch (err: any) {
    console.error('[API] GET /api/brand-profile/unlock-request/latest error:', err)
    return NextResponse.json(
      { success: false, error: err?.message || 'unknown error' },
      { status: 500 }
    )
  }
}
