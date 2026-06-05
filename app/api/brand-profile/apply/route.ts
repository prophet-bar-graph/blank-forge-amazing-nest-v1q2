// POST /api/brand-profile/apply — upserts the singleton BrandProfile doc.
// Used by every path that persists a profile: blank-start + manual edit,
// load-sample + edit, or upload PDF + extract + edit. The route accepts any
// BrandProfile-shaped body and writes it as the singleton.

import { NextRequest, NextResponse } from 'next/server'
import { runWithContext } from 'lyzr-architect'
import getBrandProfileModel from '@/models/brandProfile'
import { BrandProfile } from '@/lib/brandProfile'
import { USER_ID_HEADER } from '@/lib/userId'

export const dynamic = 'force-dynamic'

function readUserId(req: NextRequest): string | null {
  const id = req.headers.get(USER_ID_HEADER)
  return id && id.trim() ? id.trim() : null
}

// Hard cap on persisted brandBibleText. Matches the extractor's MAX_DOC_CHARS
// so a brand bible that fits in the extraction prompt also fits in storage.
const MAX_BIBLE_CHARS = 150_000

function sanitizeProfile(raw: any): Partial<BrandProfile> {
  const bibleRaw = typeof raw?.brandBibleText === 'string' ? raw.brandBibleText : ''
  return {
    companyName: String(raw?.companyName ?? '').trim(),
    tagline: String(raw?.tagline ?? '').trim(),
    categoryFrame: String(raw?.categoryFrame ?? '').trim(),
    customerQuest: String(raw?.customerQuest ?? '').trim(),
    promiseOfValue: String(raw?.promiseOfValue ?? '').trim(),
    callToAction: String(raw?.callToAction ?? '').trim(),
    portfolioPillars: Array.isArray(raw?.portfolioPillars)
      ? raw.portfolioPillars.map((s: any) => String(s).trim()).filter(Boolean)
      : [],
    partnerPillars: Array.isArray(raw?.partnerPillars)
      ? raw.partnerPillars.map((s: any) => String(s).trim()).filter(Boolean)
      : [],
    keyPhrase: String(raw?.keyPhrase ?? '').trim(),
    voicePersonaBody: String(raw?.voicePersonaBody ?? '').trim(),
    shortFormSummary: String(raw?.shortFormSummary ?? '').trim(),
    brandBibleText: bibleRaw.slice(0, MAX_BIBLE_CHARS),
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = readUserId(req)
    if (!userId) {
      return NextResponse.json(
        { success: false, error: `missing ${USER_ID_HEADER} header` },
        { status: 400 }
      )
    }

    const body = await req.json()
    const profile = sanitizeProfile(body)

    if (!profile.companyName) {
      return NextResponse.json(
        { success: false, error: 'companyName is required' },
        { status: 400 }
      )
    }

    const saved = await runWithContext(
      { userId, isAdmin: false },
      async () => {
        const Model = await getBrandProfileModel()
        // RLS auto-scopes find/update to owner_user_id = userId; the doc
        // is upserted with that owner. Different userIds => different docs.
        const doc = await Model.findOneAndUpdate(
          {},
          { $set: { ...profile, owner_user_id: userId } },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        )
        return doc?.toObject?.() ?? doc
      }
    )

    return NextResponse.json({ success: true, data: saved })
  } catch (err: any) {
    console.error('[API] POST /api/brand-profile/apply error:', err)
    return NextResponse.json(
      { success: false, error: err?.message || 'unknown error' },
      { status: 500 }
    )
  }
}
