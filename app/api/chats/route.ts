// /api/chats — list (GET) and create (POST) ChatHistory docs for the current
// user. Mirrors the auth/RLS pattern in app/api/brand-profile/apply/route.ts:
// read USER_ID_HEADER, run all DB work in runWithContext so the RLS plugin
// auto-scopes queries to owner_user_id. No manual ownership checks needed.

import { NextRequest, NextResponse } from 'next/server'
import { runWithContext } from 'lyzr-architect'
import getChatHistoryModel from '@/models/chatHistory'
import { USER_ID_HEADER } from '@/lib/userId'

export const dynamic = 'force-dynamic'

function readUserId(req: NextRequest): string | null {
  const id = req.headers.get(USER_ID_HEADER)
  return id && id.trim() ? id.trim() : null
}

// GET — list the user's chats, lightest projection for the sidebar.
export async function GET(req: NextRequest) {
  try {
    const userId = readUserId(req)
    if (!userId) {
      return NextResponse.json(
        { success: false, error: `missing ${USER_ID_HEADER} header` },
        { status: 400 }
      )
    }

    const chats = await runWithContext({ userId, isAdmin: false }, async () => {
      const Model = await getChatHistoryModel()
      const docs = await Model.find({}, { title: 1, updatedAt: 1, versions: 1 })
        .sort({ updatedAt: -1 })
        .lean()
      return docs.map((d: any) => ({
        _id: String(d._id),
        title: d.title || 'Untitled',
        updatedAt: d.updatedAt,
        versionCount: Array.isArray(d.versions) ? d.versions.length : 0,
      }))
    })

    return NextResponse.json({ success: true, data: chats })
  } catch (err: any) {
    console.error('[API] GET /api/chats error:', err)
    return NextResponse.json(
      { success: false, error: err?.message || 'unknown error' },
      { status: 500 }
    )
  }
}

// POST — create a new chat from a Compose generation.
export async function POST(req: NextRequest) {
  try {
    const userId = readUserId(req)
    if (!userId) {
      return NextResponse.json(
        { success: false, error: `missing ${USER_ID_HEADER} header` },
        { status: 400 }
      )
    }

    const body = await req.json().catch(() => ({}))
    const brief = body?.brief ?? {}

    const created = await runWithContext({ userId, isAdmin: false }, async () => {
      const Model = await getChatHistoryModel()
      const doc = await Model.create({
        owner_user_id: userId,
        title: String(body?.title ?? '').trim() || 'Untitled',
        channel: String(body?.channel ?? '').trim(),
        audience: String(body?.audience ?? '').trim(),
        brief: {
          contentObjective: String(brief?.contentObjective ?? '').trim(),
          supportingMessages: String(brief?.supportingMessages ?? '').trim(),
          callToAction: String(brief?.callToAction ?? '').trim(),
          mandatories: Array.isArray(brief?.mandatories)
            ? brief.mandatories.map((s: any) => String(s)).filter(Boolean)
            : [],
          tone: Number.isFinite(brief?.tone) ? Number(brief.tone) : 5,
        },
        variations: Array.isArray(body?.variations) ? body.variations : [],
        versions: Array.isArray(body?.versions) ? body.versions : [],
      })
      return doc?.toObject?.() ?? doc
    })

    return NextResponse.json({
      success: true,
      data: { ...created, _id: String((created as any)?._id) },
    })
  } catch (err: any) {
    console.error('[API] POST /api/chats error:', err)
    return NextResponse.json(
      { success: false, error: err?.message || 'unknown error' },
      { status: 500 }
    )
  }
}
