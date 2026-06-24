// Client-side types + fetch wrappers for chat history. Each call attaches the
// per-browser USER_ID_HEADER (same scheme as BrandProfileProvider) so the
// server's RLS plugin scopes reads/writes to this browser's chats.

import { getOrCreateBrowserUserId, USER_ID_HEADER } from '@/lib/userId'

export type LensScores = { voice: number; messaging: number; strategy: number }

// 'draft' = the user's own pasted copy that started a refine-first chat.
export type VersionSource = 'compose' | 'refine' | 'override' | 'draft'

export interface ChatVersion {
  copy: string
  scores: LensScores | null
  source: VersionSource
  note?: string
  // Per-lens rationale bullets, so the score detail can be re-rendered on reopen.
  changes?: { text: string; lens: string }[]
  // The "Overall Brand Fit" rationale shown at save time (not derivable from
  // scores alone), persisted so it re-renders verbatim on reopen.
  overallNote?: string
  createdAt?: string
}

// Copy + scores + detail to seed Refine with when (re)opening a chat.
export interface WorkingCopy {
  copy: string
  scores: LensScores | null
  changes: { text: string; lens: string }[]
  overallNote: string
}

export interface ChatVariation {
  label?: string
  differentiator?: string
  copy: string
  scores?: LensScores
  word_count?: number
}

export interface ChatBrief {
  contentObjective: string
  supportingMessages: string
  callToAction: string
  mandatories: string[]
  tone: number
}

export interface ChatHistory {
  _id: string
  title: string
  channel: string
  audience: string
  brief: ChatBrief
  variations: ChatVariation[]
  versions: ChatVersion[]
  createdAt?: string
  updatedAt?: string
}

export interface ChatListItem {
  _id: string
  title: string
  updatedAt?: string
  versionCount: number
}

function headers(extra?: Record<string, string>): Record<string, string> {
  return { [USER_ID_HEADER]: getOrCreateBrowserUserId(), ...(extra ?? {}) }
}

async function readJson(res: Response): Promise<any> {
  const raw = await res.text()
  try {
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export async function listChats(): Promise<ChatListItem[]> {
  const res = await fetch('/api/chats', { cache: 'no-store', headers: headers() })
  const json = await readJson(res)
  return json?.success && Array.isArray(json.data) ? json.data : []
}

export async function createChat(input: {
  title: string
  channel: string
  audience: string
  brief: ChatBrief
  variations: ChatVariation[]
  versions?: ChatVersion[]
}): Promise<ChatHistory | null> {
  const res = await fetch('/api/chats', {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(input),
  })
  const json = await readJson(res)
  return json?.success && json.data ? (json.data as ChatHistory) : null
}

export async function getChat(id: string): Promise<ChatHistory | null> {
  const res = await fetch(`/api/chats/${id}`, { cache: 'no-store', headers: headers() })
  const json = await readJson(res)
  return json?.success && json.data ? (json.data as ChatHistory) : null
}

export async function saveVersion(
  id: string,
  version: ChatVersion,
  truncateAfter?: number
): Promise<ChatHistory | null> {
  const res = await fetch(`/api/chats/${id}`, {
    method: 'PATCH',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(
      truncateAfter == null ? { version } : { version, truncateAfter }
    ),
  })
  const json = await readJson(res)
  return json?.success && json.data ? (json.data as ChatHistory) : null
}

export async function renameChat(id: string, title: string): Promise<ChatHistory | null> {
  const res = await fetch(`/api/chats/${id}`, {
    method: 'PATCH',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ title }),
  })
  const json = await readJson(res)
  return json?.success && json.data ? (json.data as ChatHistory) : null
}

export async function deleteVersion(id: string, index: number): Promise<ChatHistory | null> {
  const res = await fetch(`/api/chats/${id}`, {
    method: 'PATCH',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ deleteAt: index }),
  })
  const json = await readJson(res)
  return json?.success && json.data ? (json.data as ChatHistory) : null
}

export async function deleteChat(id: string): Promise<boolean> {
  const res = await fetch(`/api/chats/${id}`, { method: 'DELETE', headers: headers() })
  const json = await readJson(res)
  return !!json?.success
}

// Pick the copy + scores + detail to load into Refine when (re)opening a chat:
// latest saved version, else the highest-fit variation (sum of lens scores).
export function latestWorkingCopy(chat: ChatHistory): WorkingCopy | null {
  if (chat.versions?.length) {
    const v = chat.versions[chat.versions.length - 1]
    return {
      copy: v.copy,
      scores: v.scores ?? null,
      changes: Array.isArray(v.changes) ? v.changes : [],
      overallNote: typeof v.overallNote === 'string' ? v.overallNote : '',
    }
  }
  if (chat.variations?.length) {
    const best = [...chat.variations].sort((a, b) => {
      const fa = a.scores ? a.scores.voice + a.scores.messaging + a.scores.strategy : 0
      const fb = b.scores ? b.scores.voice + b.scores.messaging + b.scores.strategy : 0
      return fb - fa
    })[0]
    return { copy: best.copy, scores: best.scores ?? null, changes: [], overallNote: '' }
  }
  return null
}

// Working copy at a specific version index (for loading a version into Refine).
export function workingCopyAt(chat: ChatHistory, index: number): WorkingCopy | null {
  const v = chat.versions?.[index]
  if (!v) return null
  return {
    copy: v.copy,
    scores: v.scores ?? null,
    changes: Array.isArray(v.changes) ? v.changes : [],
    overallNote: typeof v.overallNote === 'string' ? v.overallNote : '',
  }
}

// Derive a human-readable title from the brief, falling back to the first
// variation's opening line.
export function deriveTitle(contentObjective: string, variations: ChatVariation[]): string {
  const obj = contentObjective.trim()
  if (obj) return obj.length > 60 ? `${obj.slice(0, 57)}…` : obj
  const first = variations?.[0]?.copy?.trim().split('\n')[0] ?? ''
  if (first) return first.length > 60 ? `${first.slice(0, 57)}…` : first
  return 'Untitled'
}
