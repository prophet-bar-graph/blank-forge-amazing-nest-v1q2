// POST /api/brand-profile/extract — invokes the Brand Profile Extractor agent
// on PDF text the client already parsed in the browser. We do NOT parse the
// PDF server-side anymore: the Architect deploy pipeline can't reliably
// install `pdf-parse`/`pdfjs-dist`, so the browser uses CDN-hosted PDF.js
// (see lib/pdfjs-cdn.ts) and sends the extracted text here as JSON.
//
// Body: { filename: string, text: string }
// Returns: { success: true, data: BrandProfile } | { success: false, error }
//
// The server inlines the document text into the agent's `message` field and
// returns the parsed BrandProfile JSON (with the raw text preserved as
// brandBibleText so KB-less agents can read it on every call).

import { NextRequest, NextResponse } from 'next/server'
import type { BrandProfile } from '@/lib/brandProfile'
import { USER_ID_HEADER } from '@/lib/userId'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const EXTRACTOR_AGENT_ID = '6a1f940564d5dd595c8475a1'
const LYZR_INFERENCE_URL = 'https://agent.maia.prophet.com/v3/inference/chat/'
const LYZR_API_KEY = process.env.LYZR_API_KEY
if (!LYZR_API_KEY) {
  throw new Error('LYZR_API_KEY environment variable is required')
}

// Hard cap on document text injected into the prompt. Claude Sonnet 4.5 has a
// ~200k token context and a brand bible is usually well under 30k chars, so
// 150k chars is generous headroom while preventing a runaway upload from
// blowing the budget.
const MAX_DOC_CHARS = 150_000

function readUserId(req: NextRequest): string | null {
  const id = req.headers.get(USER_ID_HEADER)
  return id && id.trim() ? id.trim() : null
}

function parseExtractorResponse(raw: any): BrandProfile | null {
  if (!raw || typeof raw !== 'object') return null
  const inner = typeof raw.response === 'string' ? raw.response : JSON.stringify(raw.response)
  try {
    const parsed = JSON.parse(inner)
    if (parsed && typeof parsed === 'object' && typeof parsed.companyName === 'string') {
      return parsed as BrandProfile
    }
    return null
  } catch {
    return null
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

    // 1. Read JSON body (filename + already-extracted text)
    const body = await req.json().catch(() => null)
    const filename = typeof body?.filename === 'string' ? body.filename : 'upload.pdf'
    const docText = typeof body?.text === 'string' ? body.text.trim() : ''
    if (!docText) {
      return NextResponse.json(
        { success: false, error: 'No extracted text in request body. Browser-side PDF parsing may have failed.' },
        { status: 400 }
      )
    }

    // 2. Truncate to budget; log a peek so we can verify what the agent saw
    const truncated = docText.length > MAX_DOC_CHARS
    const docToSend = truncated
      ? docText.slice(0, MAX_DOC_CHARS) + '\n\n[…document truncated for context window…]'
      : docText
    console.log(
      `[extract] file="${filename}" chars=${docText.length}${truncated ? ' (truncated)' : ''} ` +
      `peek="${docText.slice(0, 200).replace(/\s+/g, ' ')}…"`
    )

    // 3. Inline the text into the agent's message
    const message = [
      'Extract a BrandProfile from the document below.',
      "Apply the field-by-field guidance in your instructions. Map synonyms generously when content clearly matches a field's intent; only leave a field empty when the document truly doesn't discuss that concept.",
      '',
      '--- DOCUMENT TEXT ---',
      docToSend,
      '--- END DOCUMENT ---',
    ].join('\n')

    // 4. Call Lyzr's synchronous inference endpoint (no assets param)
    const ctrl = new AbortController()
    const timeoutId = setTimeout(() => ctrl.abort(), 5 * 60 * 1000)
    let lyzrRes: Response
    try {
      lyzrRes = await fetch(LYZR_INFERENCE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'x-api-key': LYZR_API_KEY!,
        },
        body: JSON.stringify({
          user_id: process.env.LYZR_USER_ID || 'ddowling@prophet.com',
          agent_id: EXTRACTOR_AGENT_ID,
          session_id: `brand-extract-${Date.now()}`,
          message,
        }),
        signal: ctrl.signal,
      })
    } finally {
      clearTimeout(timeoutId)
    }

    if (!lyzrRes.ok) {
      const errText = await lyzrRes.text().catch(() => '')
      return NextResponse.json(
        { success: false, error: `Lyzr inference returned ${lyzrRes.status}: ${errText.slice(0, 300)}` },
        { status: 502 }
      )
    }

    // 5. Parse + return
    const lyzrJson = await lyzrRes.json()
    const profile = parseExtractorResponse(lyzrJson)
    if (!profile) {
      console.error('[extract] unparseable agent response:', JSON.stringify(lyzrJson).slice(0, 500))
      return NextResponse.json(
        { success: false, error: 'Extractor returned an unparseable response. Check the server log.' },
        { status: 502 }
      )
    }

    // Return the parsed PDF text alongside the extracted profile so the modal
    // can persist it. The Compose/Refine/Chat agents are KB-less and read this
    // text from the BrandProfile on every call (see lib/brandContextPrompt.ts).
    return NextResponse.json({ success: true, data: { ...profile, brandBibleText: docToSend } })
  } catch (err: any) {
    const msg = err?.name === 'AbortError'
      ? 'Extraction timed out after 5 minutes'
      : (err?.message || 'unknown error')
    console.error('[API] POST /api/brand-profile/extract error:', err)
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
