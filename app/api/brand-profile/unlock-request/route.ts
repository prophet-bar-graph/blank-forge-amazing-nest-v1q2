// POST /api/brand-profile/unlock-request — user submits a request to unlock
// their BrandProfile for re-configuration. Returns 409 if a pending request
// already exists for this owner.

import { NextRequest, NextResponse } from 'next/server'
import { runWithContext } from 'lyzr-architect'
import getBrandUnlockRequestModel from '@/models/brandUnlockRequest'
import { USER_ID_HEADER } from '@/lib/userId'
import { USER_EMAIL_HEADER } from '@/lib/userEmail'

export const dynamic = 'force-dynamic'

const MAX_REASON_CHARS = 500

function readUserId(req: NextRequest): string | null {
  const id = req.headers.get(USER_ID_HEADER)
  return id && id.trim() ? id.trim() : null
}

function readUserEmail(req: NextRequest): string | null {
  const e = req.headers.get(USER_EMAIL_HEADER)
  return e && e.trim() ? e.trim() : null
}

export async function POST(req: NextRequest) {
  try {
    const userId = readUserId(req)
    const email = readUserEmail(req)

    if (!userId) {
      return NextResponse.json(
        { success: false, error: `missing ${USER_ID_HEADER} header` },
        { status: 400 }
      )
    }
    if (!email) {
      return NextResponse.json(
        { success: false, error: `missing ${USER_EMAIL_HEADER} header` },
        { status: 400 }
      )
    }

    const body = await req.json().catch(() => ({}))
    const reason = typeof body?.reason === 'string'
      ? body.reason.trim().slice(0, MAX_REASON_CHARS)
      : ''

    const result = await runWithContext(
      { userId, isAdmin: false },
      async () => {
        const Model = await getBrandUnlockRequestModel()
        const existing = await Model.findOne({ status: 'pending' })
        if (existing) {
          return { __duplicate: true } as const
        }
        const doc = await Model.create({
          requesterEmail: email,
          reason,
          status: 'pending',
        })
        return doc?.toObject?.() ?? doc
      }
    )

    if (result && (result as any).__duplicate) {
      return NextResponse.json(
        { success: false, error: 'A pending request already exists.' },
        { status: 409 }
      )
    }

    return NextResponse.json({ success: true, data: result }, { status: 201 })
  } catch (err: any) {
    console.error('[API] POST /api/brand-profile/unlock-request error:', err)
    return NextResponse.json(
      { success: false, error: err?.message || 'unknown error' },
      { status: 500 }
    )
  }
}
