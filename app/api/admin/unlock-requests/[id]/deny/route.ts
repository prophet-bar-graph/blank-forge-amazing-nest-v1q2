// POST /api/admin/unlock-requests/[id]/deny — flips a request to denied.
// Does NOT touch the BrandProfile (lock stays as-is).

import { NextRequest, NextResponse } from 'next/server'
import { runWithContext } from 'lyzr-architect'
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

    const result = await runWithContext(
      { userId: 'admin-action', isAdmin: true },
      async () => {
        const Model = await getBrandUnlockRequestModel()
        const doc = await Model.findById(id)
        if (!doc) return { __notFound: true } as const
        if (doc.status !== 'pending') {
          return { __wrongStatus: doc.status } as const
        }
        doc.status = 'denied'
        doc.denialReason = denialReason || null
        doc.decidedBy = email
        doc.decidedAt = new Date()
        await doc.save()
        return doc.toObject?.() ?? doc
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
    console.error('[API] POST /api/admin/unlock-requests/[id]/deny error:', err)
    return NextResponse.json(
      { success: false, error: err?.message || 'unknown error' },
      { status: 500 }
    )
  }
}
