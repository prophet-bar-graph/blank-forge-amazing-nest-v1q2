// GET /api/brand-profile — returns the singleton BrandProfile if it exists.
// Returns { success: false, error: 'not_found' } with status 404 when the
// onboarding flow hasn't yet populated the doc; the client uses that as the
// signal to open the onboarding modal.

import { NextRequest, NextResponse } from 'next/server'
import { runWithContext } from 'lyzr-architect'
import getBrandProfileModel from '@/models/brandProfile'
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
    const result = await runWithContext(
      { userId, isAdmin: false },
      async () => {
        const Model = await getBrandProfileModel()
        const doc = await Model.findOne({}).lean()
        return doc
      }
    )

    if (!result) {
      return NextResponse.json({ success: false, error: 'not_found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, data: result })
  } catch (err: any) {
    console.error('[API] GET /api/brand-profile error:', err)
    return NextResponse.json(
      { success: false, error: err?.message || 'unknown error' },
      { status: 500 }
    )
  }
}
