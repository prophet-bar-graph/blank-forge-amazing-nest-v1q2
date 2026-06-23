// /api/chats/[id] — read (GET), append-version-or-rename (PATCH), delete
// (DELETE) a single ChatHistory doc. RLS scopes every query to owner_user_id,
// so findOne/{...}({ _id }) only ever touches the current user's own chat —
// no manual ownership check needed. Mirrors app/api/chats/route.ts.

import { NextRequest, NextResponse } from 'next/server'
import { runWithContext } from 'lyzr-architect'
import getChatHistoryModel from '@/models/chatHistory'
import { USER_ID_HEADER } from '@/lib/userId'

export const dynamic = 'force-dynamic'

function readUserId(req: NextRequest): string | null {
  const id = req.headers.get(USER_ID_HEADER)
  return id && id.trim() ? id.trim() : null
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const userId = readUserId(req)
    if (!userId) {
      return NextResponse.json({ success: false, error: `missing ${USER_ID_HEADER} header` }, { status: 400 })
    }
    const { id } = await ctx.params

    const chat = await runWithContext({ userId, isAdmin: false }, async () => {
      const Model = await getChatHistoryModel()
      return Model.findOne({ _id: id }).lean()
    })

    if (!chat) {
      return NextResponse.json({ success: false, error: 'not found' }, { status: 404 })
    }
    return NextResponse.json({ success: true, data: { ...chat, _id: String((chat as any)._id) } })
  } catch (err: any) {
    console.error('[API] GET /api/chats/[id] error:', err)
    return NextResponse.json({ success: false, error: err?.message || 'unknown error' }, { status: 500 })
  }
}

// PATCH — append a version (body.version) and/or rename (body.title). When
// body.truncateAfter (a version index) is present, the newer versions are
// dropped before the new one is appended — saving from an earlier version
// overwrites the "future" ones (linear history).
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const userId = readUserId(req)
    if (!userId) {
      return NextResponse.json({ success: false, error: `missing ${USER_ID_HEADER} header` }, { status: 400 })
    }
    const { id } = await ctx.params
    const body = await req.json().catch(() => ({}))

    const newVersion =
      body?.version && typeof body.version === 'object'
        ? {
            copy: String(body.version.copy ?? ''),
            scores: body.version.scores && typeof body.version.scores === 'object'
              ? {
                  voice: Number(body.version.scores.voice) || 0,
                  messaging: Number(body.version.scores.messaging) || 0,
                  strategy: Number(body.version.scores.strategy) || 0,
                }
              : null,
            source: ['compose', 'refine', 'override', 'draft'].includes(body.version.source) ? body.version.source : 'refine',
            note: String(body.version.note ?? ''),
            changes: Array.isArray(body.version.changes)
              ? body.version.changes.map((c: any) => ({ text: String(c?.text ?? ''), lens: String(c?.lens ?? 'voice') }))
              : [],
            overallNote: String(body.version.overallNote ?? ''),
            createdAt: new Date(),
          }
        : null
    const titleUpdate =
      typeof body?.title === 'string' && body.title.trim() ? body.title.trim() : null
    const truncateAfter = Number.isInteger(body?.truncateAfter) ? body.truncateAfter : null

    const deleteAt = Number.isInteger(body?.deleteAt) ? body.deleteAt : null

    if (!newVersion && titleUpdate == null && deleteAt == null) {
      return NextResponse.json({ success: false, error: 'nothing to update' }, { status: 400 })
    }

    const chat = await runWithContext({ userId, isAdmin: false }, async () => {
      const Model = await getChatHistoryModel()

      // Delete a single version by index (read-splice-set).
      if (deleteAt != null) {
        const existing = await Model.findOne({ _id: id }).lean()
        if (!existing) return null
        const current = Array.isArray((existing as any).versions) ? (existing as any).versions : []
        const versions = current.filter((_: any, i: number) => i !== deleteAt)
        return Model.findOneAndUpdate({ _id: id }, { $set: { versions } }, { new: true }).lean()
      }

      // Truncating future versions needs a read-slice-set (can't $push onto a
      // sliced array atomically). Otherwise append with $push.
      if (newVersion && truncateAfter != null) {
        const existing = await Model.findOne({ _id: id }).lean()
        if (!existing) return null
        const kept = Array.isArray((existing as any).versions)
          ? (existing as any).versions.slice(0, truncateAfter + 1)
          : []
        const set: Record<string, any> = { versions: [...kept, newVersion] }
        if (titleUpdate != null) set.title = titleUpdate
        return Model.findOneAndUpdate({ _id: id }, { $set: set }, { new: true }).lean()
      }

      const update: Record<string, any> = {}
      if (newVersion) update.$push = { versions: newVersion }
      if (titleUpdate != null) update.$set = { title: titleUpdate }
      return Model.findOneAndUpdate({ _id: id }, update, { new: true }).lean()
    })

    if (!chat) {
      return NextResponse.json({ success: false, error: 'not found' }, { status: 404 })
    }
    return NextResponse.json({ success: true, data: { ...chat, _id: String((chat as any)._id) } })
  } catch (err: any) {
    console.error('[API] PATCH /api/chats/[id] error:', err)
    return NextResponse.json({ success: false, error: err?.message || 'unknown error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const userId = readUserId(req)
    if (!userId) {
      return NextResponse.json({ success: false, error: `missing ${USER_ID_HEADER} header` }, { status: 400 })
    }
    const { id } = await ctx.params

    const deleted = await runWithContext({ userId, isAdmin: false }, async () => {
      const Model = await getChatHistoryModel()
      return Model.findOneAndDelete({ _id: id }).lean()
    })

    if (!deleted) {
      return NextResponse.json({ success: false, error: 'not found' }, { status: 404 })
    }
    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[API] DELETE /api/chats/[id] error:', err)
    return NextResponse.json({ success: false, error: err?.message || 'unknown error' }, { status: 500 })
  }
}
