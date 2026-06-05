import { NextRequest } from 'next/server'

const LYZR_AGENT_BASE_URL = process.env.LYZR_AGENT_BASE_URL || 'https://agent.maia.prophet.com'
const LYZR_API_KEY = process.env.LYZR_API_KEY
if (!LYZR_API_KEY) {
  throw new Error('LYZR_API_KEY environment variable is required')
}
const LYZR_USER_ID = process.env.LYZR_USER_ID || 'ddowling@prophet.com'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export async function POST(req: NextRequest) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 })
  }

  const { message, agent_id, session_id, user_id } = body || {}
  if (!message || !agent_id) {
    return new Response(JSON.stringify({ error: 'message and agent_id required' }), { status: 400 })
  }

  const upstream = await fetch(`${LYZR_AGENT_BASE_URL}/v3/inference/stream/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
      'x-api-key': LYZR_API_KEY,
    },
    body: JSON.stringify({
      user_id: user_id || LYZR_USER_ID,
      agent_id,
      session_id: session_id || uuid(),
      message,
    }),
  })

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => '')
    return new Response(JSON.stringify({ error: 'Upstream stream failed', status: upstream.status, body: text.slice(0, 500) }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Pass-through SSE so the client can read it incrementally.
  return new Response(upstream.body, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
