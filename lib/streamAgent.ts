// Client-side streaming helper. Calls /api/agent/stream and surfaces SSE chunks via callbacks.
// Tolerates several common SSE payload shapes — different model providers wrap deltas differently.

export type StreamCallbacks = {
  onChunk?: (textSoFar: string, delta: string) => void
  onDone?: (finalText: string) => void
  onError?: (err: Error) => void
}

type StreamOpts = {
  session_id?: string
  user_id?: string
  signal?: AbortSignal
}

function pickDelta(parsed: any): string {
  if (!parsed || typeof parsed !== 'object') return typeof parsed === 'string' ? parsed : ''
  // OpenAI-style streaming
  const oai = parsed.choices?.[0]?.delta?.content
  if (typeof oai === 'string') return oai
  // Common Lyzr-ish shapes
  if (typeof parsed.delta === 'string') return parsed.delta
  if (typeof parsed.delta?.content === 'string') return parsed.delta.content
  if (typeof parsed.token === 'string') return parsed.token
  if (typeof parsed.chunk === 'string') return parsed.chunk
  if (typeof parsed.text === 'string') return parsed.text
  if (typeof parsed.content === 'string') return parsed.content
  if (typeof parsed.response === 'string') return parsed.response
  return ''
}

export async function streamAIAgent(
  message: string,
  agent_id: string,
  opts: StreamOpts = {},
  cb: StreamCallbacks = {},
): Promise<string> {
  let res: Response
  try {
    res = await fetch('/api/agent/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, agent_id, session_id: opts.session_id, user_id: opts.user_id }),
      signal: opts.signal,
    })
  } catch (e: any) {
    const err = new Error(e?.message || 'Network error')
    cb.onError?.(err)
    throw err
  }

  if (!res.ok || !res.body) {
    const err = new Error(`Stream request failed: HTTP ${res.status}`)
    cb.onError?.(err)
    throw err
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let acc = ''

  const handleDataLine = (data: string) => {
    if (data === '[DONE]' || data === 'DONE') return
    let delta = ''
    try {
      const parsed = JSON.parse(data)
      delta = pickDelta(parsed)
      // If the parsed payload is the *full* response so far (not a delta), replace acc.
      if (!delta && typeof parsed?.response === 'string' && parsed.response.length > acc.length) {
        delta = parsed.response.slice(acc.length)
      }
    } catch {
      delta = data
    }
    if (delta) {
      acc += delta
      cb.onChunk?.(acc, delta)
    }
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      // SSE events end with a blank line (\n\n). Some servers use \r\n\r\n.
      const events = buffer.split(/\n\n|\r\n\r\n/)
      buffer = events.pop() ?? ''
      for (const evt of events) {
        if (!evt.trim()) continue
        for (const rawLine of evt.split(/\r?\n/)) {
          const line = rawLine.trimStart()
          if (!line || line.startsWith(':')) continue // SSE comment / heartbeat
          if (line.startsWith('data:')) {
            handleDataLine(line.slice(5).trimStart())
          }
        }
      }
    }
    // Flush any remaining buffered event after stream ends
    if (buffer.trim()) {
      for (const rawLine of buffer.split(/\r?\n/)) {
        const line = rawLine.trimStart()
        if (line.startsWith('data:')) handleDataLine(line.slice(5).trimStart())
      }
    }
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      cb.onDone?.(acc)
      return acc
    }
    const err = new Error(e?.message || 'Stream read failed')
    cb.onError?.(err)
    throw err
  }

  cb.onDone?.(acc)
  return acc
}
