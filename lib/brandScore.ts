// Brand Fit scoring. Prefers the agent-provided integer `score` when present;
// falls back to mapping a qualitative `rating` ("Strong" / "Needs Adjustment") when not.

export type LensName = 'voice' | 'messaging' | 'strategy'
export type LensScore = { score: number; tone: 'good' | 'warn' | 'bad' }
export type LensEntry = { score?: number; rating?: string; rationale?: string }

function toneFor(score: number): 'good' | 'warn' | 'bad' {
  if (score >= 85) return 'good'
  if (score >= 75) return 'warn'
  return 'bad'
}

// Shared Tailwind text-color class for any displayed numeric score. Buckets:
// <75 red, 75-84 yellow (gold), >=85 green. Used by Compose variant cards and
// Refine Brand Fit cards so colors stay consistent across the app.
export function scoreColorClass(n: number): string {
  if (n >= 85) return 'text-studio-scoreGreen'
  if (n >= 75) return 'text-studio-scoreGold'
  return 'text-studio-scoreRed'
}

export function lensScore(entry: LensEntry | string | undefined, lens: LensName): LensScore {
  // Backward-compat: allow passing a bare rating string (older call sites).
  const e: LensEntry = typeof entry === 'string' ? { rating: entry } : (entry ?? {})

  // Prefer the agent-provided numeric score when present and non-zero.
  // (Score 0 is the "field not applicable to this mode" sentinel from the new agent schema.)
  if (typeof e.score === 'number' && e.score > 0) {
    const clamped = Math.max(0, Math.min(100, Math.round(e.score)))
    return { score: clamped, tone: toneFor(clamped) }
  }

  // Fall back to qualitative rating mapping for legacy / heuristic paths.
  const r = (e.rating || '').toLowerCase()
  if (/strong/.test(r)) {
    const seed = lens === 'voice' ? 82 : lens === 'messaging' ? 86 : 84
    return { score: seed, tone: 'good' }
  }
  if (/needs/.test(r) || /adjust/.test(r)) {
    const seed = lens === 'voice' ? 28 : lens === 'messaging' ? 42 : 31
    return { score: seed, tone: 'bad' }
  }
  return { score: 50, tone: 'warn' }
}

export function overallScore(scorecard: { voice: LensEntry; messaging: LensEntry; strategy: LensEntry }): { score: number; status: 'on-brand' | 'drift detected' | 'needs review' } {
  const v = lensScore(scorecard.voice, 'voice').score
  const m = lensScore(scorecard.messaging, 'messaging').score
  const s = lensScore(scorecard.strategy, 'strategy').score
  const avg = Math.round((v + m + s) / 3)
  const status = avg >= 85 ? 'on-brand' : avg >= 75 ? 'needs review' : 'drift detected'
  return { score: avg, status }
}
