'use client'

import React, { useState, useMemo, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Slider } from '@/components/ui/slider'
import { Skeleton } from '@/components/ui/skeleton'
import { Loader2, ArrowRight, AlertCircle, Check, Lightbulb, BadgeCheck } from 'lucide-react'
import { diffWords, diffChangeRatio, type DiffSegment } from '@/lib/diff'
import { lensScore, overallScore, scoreColorClass } from '@/lib/brandScore'
import LoadingWords from '@/components/LoadingWords'
import { useBrandProfile } from '@/components/BrandProfileProvider'
import { emptyBrandProfile } from '@/lib/brandProfile'
import { buildBrandContextBlock } from '@/lib/brandContextPrompt'
import { StepEyebrow } from '@/components/StepEyebrow'
import { CHANNELS } from '@/lib/channels'

const REFINE_LOADING_WORDS = [
  'Reading',
  'Weighing',
  'Anchoring',
  'Refining',
  'Polishing',
  'Sharpening',
  'Aligning',
  'Distilling',
  'Reframing',
]

// ---- Parsing helpers (preserved from prior implementation; battle-tested against messy agent output) ----

type LensEntry = { score?: number; rating?: string; rationale: string }
type Scorecard = { voice: LensEntry; messaging: LensEntry; strategy: LensEntry }

interface ReviewResult {
  improvedCopy: string
  changes: { text: string; lens: string }[]
  scorecard: Scorecard
  improvedScorecard: Scorecard | null
  raw: string
}

function stripInlineLensAnnotations(text: string): { cleanText: string; extractedChanges: { text: string; lens: string }[] } {
  const extractedChanges: { text: string; lens: string }[] = []
  const annotationPattern = /\s*\[(?:(Voice|Messaging|Strategy)):\s*(.*?)\]\s*/gi
  let cleanText = text.replace(annotationPattern, (_match, lens, note) => {
    if (note.trim()) extractedChanges.push({ text: note.trim(), lens: lens.toLowerCase() })
    return ' '
  })
  cleanText = cleanText.replace(/\s*(?:\[(?:Voice|Messaging|Strategy)\]|\((?:Voice|Messaging|Strategy)\)|\*\*(?:Voice|Messaging|Strategy)\*\*)\s*/gi, ' ')
  const metaVerbs = '(?:Opens|Brings|Uses|Lists|Adds|Reinforces|Demonstrates|Creates|Anchors|Ensures|Shifts|Grounds|Connects|Aligns|Maintains|Establishes|Highlights|Emphasizes|Invites|Reflects|Signals|Introduces|Transitions|Mirrors|Echoes|Balances|Frames|Positions|Closes|Delivers|Builds|Suggests|Strengthens|Retains|Supports|Conveys|Integrates|Incorporates|References|Clarifies|Elevates|Simplifies|Humanizes|Personalizes|Tightens|Broadens|Narrows|Softens|Sharpens|Sets|Removes|Replaces|Reframes|Restates|Acknowledges|Addresses)'
  // Brand-agnostic indicators only. Vusion-specific "Connected Commerce" was
  // here originally; removed to keep the helper portable across clients. The
  // structured `changes` array from the agent's response_format is the primary
  // path; this text-parsing fallback only fires when the agent returns markdown.
  const metaIndicators = '(?:voice|messaging|strategy|lens|framework|principle|thematic|tone|POV|audience|rhetorical|declarative|first-person|imperative|hierarchy|brand|positioning|narrative|copy|tagline|headline|subhead|CTA|persuasion|paragraph|sentence|section|structure|platform)'
  const metaPattern = new RegExp(`(?<=[\\.!?]\\s+|^)${metaVerbs}\\s[^.!?]*(?:${metaIndicators})[^.!?]*[.!?]`, 'gim')
  const metaMatches = cleanText.match(metaPattern)
  if (metaMatches) {
    for (const m of metaMatches) {
      let lens = 'voice'
      if (/messaging|message|benefit|hierarchy/i.test(m)) lens = 'messaging'
      else if (/strategy|principle|positioning|platform|framework|structure/i.test(m)) lens = 'strategy'
      extractedChanges.push({ text: m.trim(), lens })
      cleanText = cleanText.replace(m, '')
    }
  }
  cleanText = cleanText.replace(/ {2,}/g, ' ').replace(/ ([.,;:!?])/g, '$1').replace(/\n{3,}/g, '\n\n').trim()
  return { cleanText, extractedChanges }
}

function deepExtractText(value: any, depth = 0): string {
  if (depth > 5) return typeof value === 'string' ? value : ''
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try { return deepExtractText(JSON.parse(trimmed), depth + 1) } catch {}
    }
    return value.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    if (value.data?.improved_copy || value.data?.scorecard) return ''
    for (const key of ['response', 'text', 'message', 'content', 'result', 'output']) {
      if (key in value && value[key] != null) {
        const extracted = deepExtractText(value[key], depth + 1)
        if (extracted) return extracted
      }
    }
  }
  return ''
}

function extractFromMarkdown(text: string): ReviewResult {
  const result: ReviewResult = {
    improvedCopy: '',
    changes: [],
    scorecard: {
      voice: { rating: 'Unknown', rationale: '' },
      messaging: { rating: 'Unknown', rationale: '' },
      strategy: { rating: 'Unknown', rationale: '' },
    },
    improvedScorecard: null,
    raw: text,
  }
  if (!text.trim()) return result

  // 1) Improved copy section — header like "## Improved Copy", "## Improved Email Copy", "## Refined Copy", "## Revised Copy"
  const improvedRe = /(?:^|\n)#{1,4}\s*(?:Improved|Refined|Revised|Updated)\s+(?:[A-Za-z]+\s+)?Copy\b[^\n]*\n([\s\S]*?)(?=\n#{1,4}\s+\S|\n---+\s*\n|$)/i
  const im = text.match(improvedRe)
  let improved = im ? im[1] : ''

  if (!improved) {
    // No header — slice off any trailing commentary blocks and use the rest
    improved = text
      .replace(/\n#{1,4}\s+(?:Changes?(?:\s+Made)?|Annotations?|Three[- ]Lens[\s\S]*?|Scorecard|Commentary|Notes(?:\s+on\s+choices)?|Why\s+These\s+Changes)\b[\s\S]*$/i, '')
      .replace(/\n---+\s*$/m, '')
  }

  // Final tidy on the improved copy text
  improved = improved
    .replace(/^```[\w]*\n?/, '')
    .replace(/\n?```\s*$/, '')
    .replace(/^---+\s*\n?/, '')
    .replace(/\n---+\s*$/m, '')
    .replace(/\*\*(.*?)\*\*/g, '$1') // unwrap bold
    .replace(/^#{1,6}\s+.*$/gm, '')   // drop any stray markdown headers
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  result.improvedCopy = improved

  // 2) Changes section — split into bullets if present, else split into sentences
  const changesRe = /(?:^|\n)#{1,4}\s*(?:Changes?(?:\s+Made)?|Annotations?|Notes(?:\s+on\s+choices)?|Why\s+These\s+Changes)\b[^\n]*\n([\s\S]*?)(?=\n#{1,4}\s+\S|\n---+\s*\n|$)/i
  const cm = text.match(changesRe)
  if (cm) {
    const body = cm[1].trim()
    const bullets = body.split('\n')
      .filter(l => /^\s*[-*•]/.test(l) || /^\s*\d+[.)]/.test(l))
      .map(l => l.replace(/^\s*[-*•]\s*/, '').replace(/^\s*\d+[.)]\s*/, '').replace(/\*\*/g, '').trim())
      .filter(Boolean)
    const items = bullets.length
      ? bullets
      : body.split(/(?<=[.!?])\s+/).map(s => s.replace(/\*\*/g, '').trim()).filter(s => s.length > 12)
    for (const note of items) {
      let lens = 'voice'
      if (/messaging|hierarchy|theme|key\s+message|benefit/i.test(note)) lens = 'messaging'
      else if (/strategy|principle|positioning|promise|verbal\s+strategy|connected\s+commerce/i.test(note)) lens = 'strategy'
      result.changes.push({ text: note, lens })
    }
  }

  // 3) Scorecard — look for "**Voice:** Strong — rationale" or "Voice: Needs Adjustment - rationale"
  const lensFor = (name: 'voice' | 'messaging' | 'strategy') => {
    const re = new RegExp(`(?:^|\\n)\\s*(?:[-*]\\s*)?\\*{0,2}\\s*${name}\\s*\\*{0,2}\\s*[:\\-—]\\s*\\*{0,2}\\s*(Strong|Needs\\s+Adjustment|On[- ]Brand|Off[- ]Brand|Aligned|Misaligned)\\b\\*{0,2}\\s*[:\\-—]?\\s*([^\\n]*)`, 'i')
    const m = text.match(re)
    if (m) {
      return { rating: m[1].trim(), rationale: (m[2] || '').replace(/\*\*/g, '').trim().replace(/^[\s\-:.,]+/, '') }
    }
    return { rating: 'Unknown', rationale: '' }
  }
  result.scorecard = {
    voice: lensFor('voice'),
    messaging: lensFor('messaging'),
    strategy: lensFor('strategy'),
  }

  return result
}

// Normalize a scorecard lens entry from the agent. Captures both `score` (new numeric)
// and `rating` (legacy qualitative) so downstream lensScore can prefer numeric when present.
function pickLensEntry(raw: any): { score?: number; rating?: string; rationale: string } {
  if (!raw || typeof raw !== 'object') return { rating: 'Unknown', rationale: '' }
  return {
    score: typeof raw.score === 'number' ? raw.score : undefined,
    rating: typeof raw.rating === 'string' ? raw.rating : undefined,
    rationale: typeof raw.rationale === 'string' ? raw.rationale : '',
  }
}

function parseReviewResponse(response: any): ReviewResult {
  let structuredData = response?.data
  if (!structuredData?.improved_copy && !structuredData?.scorecard) {
    const inner = typeof response?.response === 'string'
      ? (() => { try { return JSON.parse(response.response) } catch { return null } })()
      : response?.response
    if (inner?.data?.improved_copy || inner?.data?.scorecard) structuredData = inner.data
  }
  if (structuredData?.improved_copy || structuredData?.scorecard) {
    return {
      improvedCopy: structuredData.improved_copy || '',
      changes: Array.isArray(structuredData.changes) ? structuredData.changes.map((c: any) => ({
        text: c.note || c.text || '',
        lens: (c.lens || 'voice').toLowerCase(),
      })) : [],
      scorecard: {
        voice: pickLensEntry(structuredData.scorecard?.voice),
        messaging: pickLensEntry(structuredData.scorecard?.messaging),
        strategy: pickLensEntry(structuredData.scorecard?.strategy),
      },
      improvedScorecard: structuredData.improved_scorecard
        ? {
            voice: pickLensEntry(structuredData.improved_scorecard.voice),
            messaging: pickLensEntry(structuredData.improved_scorecard.messaging),
            strategy: pickLensEntry(structuredData.improved_scorecard.strategy),
          }
        : null,
      raw: deepExtractText(response) || '',
    }
  }
  return extractFromMarkdown(deepExtractText(response))
}

// ---- UI ----

interface ReviewSectionProps {
  channel: string
  audience: string
  onCallAgent: (prompt: string) => Promise<any>
  loading: boolean
  pendingCopy?: string | null
  pendingScores?: { voice: number; messaging: number; strategy: number } | null
  onPendingConsumed?: () => void
  onChannelChange: (channel: string) => void
  onAudienceChange: (audience: string) => void
}

const LENGTH_OPTIONS = ['Shorter', 'Same', 'Longer']

export default function ReviewSection({ channel, audience, onCallAgent, loading, pendingCopy, pendingScores, onPendingConsumed, onChannelChange, onAudienceChange }: ReviewSectionProps) {
  const { profile } = useBrandProfile()
  const brand = profile || emptyBrandProfile()
  const [pastedCopy, setPastedCopy] = useState('')
  const [toneIntensity, setToneIntensity] = useState([5])
  const [lengthPref, setLengthPref] = useState('Same')
  const [result, setResult] = useState<ReviewResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [allAccepted, setAllAccepted] = useState(false)
  const [viewMode, setViewMode] = useState<'diff' | 'refined' | 'original'>('diff')
  // Carryover from Compose: variant's lens scores shown as the "original" before the user clicks Refine.
  // Once Refine returns, the agent's authoritative scorecard supersedes this for display.
  const [presetOriginalScores, setPresetOriginalScores] = useState<{ voice: number; messaging: number; strategy: number } | null>(null)
  const [notes, setNotes] = useState<string[]>([])
  const [noteDraft, setNoteDraft] = useState('')

  useEffect(() => {
    if (pendingCopy && pendingCopy.trim()) {
      setPastedCopy(pendingCopy)
      setResult(null)
      setError(null)
      setAllAccepted(false)
      setViewMode('diff')
      setPresetOriginalScores(pendingScores ?? null)
      setNotes([])
      setNoteDraft('')
      onPendingConsumed?.()
    }
  }, [pendingCopy, pendingScores, onPendingConsumed])

  // Refine the given copy. Iteration is cumulative: "Refine Again" passes the
  // latest improved copy as `baseline`, which becomes the new "original" the
  // agent works from (and the new diff/scorecard anchor) so improvements stack
  // pass over pass. The first pass omits `baseline`, so it refines pastedCopy.
  // baseline/notes are passed explicitly (not read from state) because setState
  // is async and wouldn't be flushed by the time we build the prompt.
  const handleRefine = async (opts?: { baseline?: string; notesOverride?: string[] }) => {
    const sourceCopy = (opts?.baseline ?? pastedCopy).trim()
    if (!sourceCopy) return
    setError(null)
    setAllAccepted(false)
    setViewMode('diff')
    const activeNotes = opts?.notesOverride ?? notes
    const notesBlock = activeNotes.length
      ? `\n\nUser Notes (apply as additional guidance for this refinement):\n${activeNotes.map((n, i) => `${i + 1}. ${n}`).join('\n')}`
      : ''
    const prompt = `${buildBrandContextBlock(brand)}\nChannel: ${channel || 'Non-Specific'}\nAudience: ${audience || 'general'}\nTone Intensity: ${toneIntensity[0]}/10\nLength Preference: ${lengthPref}\n\nOriginal Copy:\n${sourceCopy}${notesBlock}\n\nReview and improve this copy. Return JSON with mode="review" and data containing: improved_copy (clean revised text only), changes (array of {lens, note} for each change), scorecard (for ORIGINAL), improved_scorecard (for the new refinement). Apply the scoring rules from your instructions: full 0-100 range, 85+ is a high bar, and the always-update + strict-greater rules when any original lens is below 85.`
    const response = await onCallAgent(prompt)
    if (response) {
      // Promote the refined-from copy to be the displayed original + diff anchor.
      // No-op on the first pass (sourceCopy === pastedCopy).
      setPastedCopy(sourceCopy)
      setResult(parseReviewResponse(response))
      setNotes([])
      setNoteDraft('')
    } else {
      setError('Failed to refine copy. Please try again.')
    }
  }

  const cleanedImproved = useMemo(() => {
    if (!result) return ''
    return stripInlineLensAnnotations(result.improvedCopy).cleanText
  }, [result])

  const segments: DiffSegment[] = useMemo(() => {
    if (!result || !cleanedImproved) return []
    return diffWords(pastedCopy, cleanedImproved)
  }, [pastedCopy, cleanedImproved, result])

  // Original scores: prefer the agent's authoritative scorecard from a completed Refine.
  // If no Refine has run yet but we have carryover scores from Compose, use those.
  const originalScores = useMemo(() => {
    if (result) {
      return {
        voice: lensScore(result.scorecard.voice, 'voice'),
        messaging: lensScore(result.scorecard.messaging, 'messaging'),
        strategy: lensScore(result.scorecard.strategy, 'strategy'),
      }
    }
    if (presetOriginalScores) {
      return {
        voice: lensScore({ score: presetOriginalScores.voice }, 'voice'),
        messaging: lensScore({ score: presetOriginalScores.messaging }, 'messaging'),
        strategy: lensScore({ score: presetOriginalScores.strategy }, 'strategy'),
      }
    }
    return null
  }, [result, presetOriginalScores])

  // Improved scores: only available after the agent returns improved_scorecard.
  const improvedScores = useMemo(() => {
    if (!result?.improvedScorecard) return null
    return {
      voice: lensScore(result.improvedScorecard.voice, 'voice'),
      messaging: lensScore(result.improvedScorecard.messaging, 'messaging'),
      strategy: lensScore(result.improvedScorecard.strategy, 'strategy'),
    }
  }, [result])

  const originalOverall = useMemo(() => {
    if (result) {
      if (allAccepted) return null  // allAccepted shows the improved side only
      return overallScore(result.scorecard)
    }
    if (presetOriginalScores) {
      return overallScore({
        voice: { score: presetOriginalScores.voice },
        messaging: { score: presetOriginalScores.messaging },
        strategy: { score: presetOriginalScores.strategy },
      })
    }
    return null
  }, [result, presetOriginalScores, allAccepted])

  const improvedOverall = useMemo(() => {
    if (allAccepted) return { score: 92, status: 'on-brand' as const }
    if (!result?.improvedScorecard) return null
    return overallScore(result.improvedScorecard)
  }, [result, allAccepted])

  // Group the agent's per-change rationales by lens, so the new right-margin
  // renders ONE card per lens (with a bulleted summary when there are
  // multiple changes) instead of one row per change.
  const changesByLens = useMemo(() => {
    const groups: Record<'voice' | 'messaging' | 'strategy', string[]> = { voice: [], messaging: [], strategy: [] }
    for (const c of result?.changes ?? []) {
      const lens = (c.lens || 'voice').toLowerCase()
      if (lens === 'voice' || lens === 'messaging' || lens === 'strategy') {
        if (c.text?.trim()) groups[lens].push(c.text.trim())
      }
    }
    return groups
  }, [result])


  // Empty state — paste & configure. 2-col layout: Brief (left) | Submit Your
  // Copy (right). "Keep Copy on Brand" explanation lives under the brief card
  // on the left so the right column stays focused on copy entry + Refine.
  if (!result) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-6 lg:gap-8">

        {/* ---- LEFT: Step 01 — Build the Brief ---- */}
        <div className="flex flex-col">
          <StepEyebrow step={1} label="Build the Brief" />

          <section className="rounded-2xl border border-black/75 p-4 lg:p-5 flex flex-col">
            <div className="space-y-3">
              {/* Channel */}
              <div>
                <h4 className="font-bold text-sm text-studio-ink mb-2">Select a channel:</h4>
                <div className="flex flex-wrap gap-1.5">
                  {CHANNELS.map(ch => (
                    <button
                      key={ch}
                      type="button"
                      onClick={() => onChannelChange(ch)}
                      className={`px-3 py-1 rounded-full text-xs transition ${
                        channel === ch
                          ? 'bg-studio-ink text-studio-page'
                          : 'bg-studio-page border border-studio-border text-studio-muted hover:text-studio-ink'
                      }`}
                    >
                      {ch.toLowerCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Audience */}
              <div>
                <h4 className="font-bold text-sm text-studio-ink">Define the audience:</h4>
                <p className="text-xs italic text-studio-mutedSoft mb-1">Who do you want to talk to?</p>
                <Input
                  value={audience}
                  onChange={(e) => onAudienceChange(e.target.value)}
                  placeholder="Internal leaders"
                  className="bg-studio-page border-studio-border text-sm text-studio-ink placeholder:text-studio-mutedSoft"
                />
              </div>

              {/* Length */}
              <div>
                <h4 className="font-bold text-sm text-studio-ink mb-2">Select length:</h4>
                <div className="flex flex-wrap gap-1.5">
                  {LENGTH_OPTIONS.map(opt => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setLengthPref(opt)}
                      className={`px-3 py-1 rounded-full text-xs transition ${
                        lengthPref === opt
                          ? 'bg-studio-ink text-studio-page'
                          : 'bg-studio-page border border-studio-border text-studio-muted hover:text-studio-ink'
                      }`}
                    >
                      {opt.toLowerCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tone */}
              <div>
                <h4 className="font-bold text-sm text-studio-ink">Tone:</h4>
                <p className="text-xs italic text-studio-mutedSoft mb-1">How do we want to sound?</p>
                <Slider value={toneIntensity} onValueChange={setToneIntensity} min={1} max={10} step={1} />
                <div className="flex justify-between text-xs text-studio-mutedSoft mt-1">
                  <span>subtle</span>
                  <span>bold</span>
                </div>
                <p className="text-sm font-bold text-studio-ink mt-1">{toneIntensity[0]}/10</p>
              </div>
            </div>
          </section>

          {/* Keep Copy on Brand — below the brief card */}
          <aside className="px-1 pt-5">
            <div className="flex items-center gap-2 mb-3">
              <Lightbulb className="h-5 w-5 text-studio-ink" />
              <h3 className="font-bold text-base text-studio-ink">Keep Copy on Brand</h3>
            </div>
            <p className="text-sm text-studio-muted leading-relaxed mb-3">
              Your copy will be assessed based on brand <span className="font-bold text-studio-ink">fit across Voice, Messaging, and Strategy</span>.
            </p>
            <p className="text-sm text-studio-muted leading-relaxed">
              You&rsquo;ll also get a <span className="font-bold text-studio-ink">rationale for every recommended revision</span> so you can understand why we made it.
            </p>
          </aside>
        </div>

        {/* ---- RIGHT: Step 02 — Submit Your Copy ---- */}
        <div className="flex flex-col">
          <StepEyebrow step={2} label="Submit Your Copy" />

          <div className="space-y-3">
            <Textarea
              placeholder="Copy"
              value={pastedCopy}
              onChange={(e) => setPastedCopy(e.target.value)}
              rows={10}
              className="bg-studio-page border-studio-border text-studio-ink placeholder:text-studio-mutedSoft resize-none rounded-md text-sm leading-relaxed"
            />
            <Textarea
              placeholder="Notes (optional)"
              value={notes.join('\n')}
              onChange={(e) => setNotes(e.target.value.split('\n').map(s => s.trim()).filter(Boolean))}
              rows={6}
              className="bg-studio-page border-studio-border text-studio-ink placeholder:text-studio-mutedSoft resize-none rounded-md text-sm leading-relaxed"
            />
          </div>

          <button
            type="button"
            onClick={() => handleRefine()}
            disabled={loading || !pastedCopy.trim()}
            className="self-start mt-4 h-10 inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 disabled:text-studio-mutedSoft disabled:cursor-not-allowed group"
          >
            {loading ? (
              <span className="inline-flex items-center gap-3">
                <Loader2 className="h-4 w-4 animate-spin" />
                <LoadingWords words={REFINE_LOADING_WORDS} className="italic" />
              </span>
            ) : (
              <>
                <span className="underline underline-offset-2 group-disabled:no-underline">Refine Copy</span>
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>

          {error && (
            <div className="flex items-center gap-2 p-2.5 rounded-md bg-studio-card border border-studio-border text-xs mt-3">
              <AlertCircle className="h-3.5 w-3.5 text-studio-scoreRed flex-shrink-0" />
              <p className="text-studio-ink flex-1">{error}</p>
            </div>
          )}
        </div>

      </div>
    )
  }

  // Result state
  const ratio = diffChangeRatio(segments)
  const useBlockDiff = ratio > 0.6

  // Effective view mode (used by both the top tab row and the document column)
  const effectiveMode: 'diff' | 'refined' | 'original' = allAccepted ? 'refined' : viewMode

  return (
    <div className="space-y-4">
      {/* Body — scores rail (left, narrow) + document column (right, wide).
          Same 1fr/2fr ratio as the empty-state input layout above. */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-6">
        {/* Document column wrapper — flex-col so the bordered document
            stretches and Accept All sits at the bottom (top-aligning with the
            Refine Again button at the bottom of the scores rail). */}
        <div className="lg:order-2 flex flex-col">
        <div className="min-h-[400px] flex-1 rounded-2xl border border-studio-border p-6 lg:p-8">
          {/* Right column header — "Refine Copy:" label + tabs (Annotated /
              Refined / Original). Accept All moved out, below the box. */}
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <h3 className="font-bold text-sm text-studio-ink">Refine Copy:</h3>
            <div className="flex items-center gap-1 text-sm">
              {!loading && (['diff', 'refined', 'original'] as const).map(mode => {
                const label = mode === 'diff' ? 'Annotated' : mode === 'refined' ? 'Refined' : 'Original'
                const isActive = effectiveMode === mode
                const disabled = allAccepted && mode !== 'refined'
                return (
                  <button
                    key={mode}
                    onClick={() => !disabled && setViewMode(mode)}
                    disabled={disabled}
                    className={`px-3 py-1.5 rounded-md transition-colors text-sm ${
                      isActive
                        ? 'bg-studio-card text-studio-ink font-medium'
                        : 'text-studio-mutedSoft hover:text-studio-ink hover:bg-studio-cardSubtle'
                    } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          {(() => {
            const changeCount = segments.filter(s => s.type !== 'unchanged').length
            const hasChanges = changeCount > 0
            const showCelebration = !hasChanges && !allAccepted && effectiveMode === 'diff'

            return (
              <>
                {showCelebration && (
                  <div className="mb-5 flex items-start gap-3 rounded-xl border border-studio-scoreGreen/30 bg-studio-scoreGreen/10 px-4 py-3">
                    <BadgeCheck className="h-5 w-5 text-studio-scoreGreen flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-base text-studio-ink leading-tight">Already on-brand</p>
                      <p className="text-[12px] text-studio-muted/80 mt-0.5">No edits recommended. The margin notes explain why this copy holds up across all three lenses.</p>
                    </div>
                  </div>
                )}

                {loading && (
                  <div className="space-y-3">
                    <p className="text-lg leading-snug mb-1">
                      <LoadingWords words={REFINE_LOADING_WORDS} className="italic text-studio-muted/90" />
                    </p>
                    <Skeleton className="h-5 w-full bg-studio-border/40" />
                    <Skeleton className="h-5 w-5/6 bg-studio-border/40" />
                    <Skeleton className="h-5 w-4/6 bg-studio-border/40" />
                  </div>
                )}

                {!loading && (
                  <>
                    {effectiveMode === 'refined' && (
                      <p className="text-studio-ink text-xl leading-relaxed whitespace-pre-wrap">
                        {cleanedImproved || pastedCopy}
                      </p>
                    )}

                    {effectiveMode === 'original' && (
                      <p className="text-studio-ink text-xl leading-relaxed whitespace-pre-wrap">
                        {pastedCopy}
                      </p>
                    )}

                    {effectiveMode === 'diff' && (
                      hasChanges ? (
                        useBlockDiff ? (
                          <div className="space-y-4">
                            <div className="rounded-lg bg-studio-scoreRed/5 border border-studio-scoreRed/20 p-4">
                              <p className="text-[10px] uppercase tracking-wider text-studio-scoreRed/80 mb-2">Original</p>
                              <p className="text-studio-ink/80 text-base leading-relaxed whitespace-pre-wrap line-through decoration-studio-scoreRed/40">
                                {pastedCopy}
                              </p>
                            </div>
                            <div className="rounded-lg bg-studio-scoreGreen/5 border border-studio-scoreGreen/20 p-4">
                              <p className="text-[10px] uppercase tracking-wider text-studio-scoreGreen/80 mb-2">Refined</p>
                              <p className="text-studio-ink text-base leading-relaxed whitespace-pre-wrap">
                                {cleanedImproved}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <p className="text-studio-ink text-xl leading-relaxed whitespace-pre-wrap">
                            {segments.map((seg, i) => {
                              if (seg.type === 'unchanged') return <span key={i}>{seg.text}</span>
                              if (seg.type === 'removed') return <span key={i} className="line-through decoration-studio-scoreRed/70 decoration-2 text-studio-scoreRed/80 bg-studio-scoreRed/5 px-0.5">{seg.text}</span>
                              return <span key={i} className="underline decoration-studio-scoreGreen decoration-2 underline-offset-4 text-studio-scoreGreen bg-studio-scoreGreen/5 px-0.5">{seg.text}</span>
                            })}
                          </p>
                        )
                      ) : (
                        // 0 changes: show the copy plainly under the celebration banner above
                        <p className="text-studio-ink text-xl leading-relaxed whitespace-pre-wrap">
                          {pastedCopy}
                        </p>
                      )
                    )}

                    {effectiveMode === 'diff' && hasChanges && (
                      <div className="mt-6 flex items-center gap-3 text-[11px] text-studio-muted/85 tracking-wide">
                        <span>{changeCount} changes</span>
                        <span className="text-studio-border">·</span>
                        <span><kbd className="font-sans text-[10px] px-1.5 py-0.5 rounded bg-studio-border/40 text-studio-muted">⌘K</kbd> to refine</span>
                      </div>
                    )}
                  </>
                )}
              </>
            )
          })()}
        </div>

        {/* Accept All Suggestions — below the bordered document. With the
            wrapper as flex-col and the document area flex-1, this button sits
            at the bottom of the column and top-aligns with the Refine Again
            button at the bottom of the scores rail. */}
        <Button
          onClick={() => setAllAccepted(true)}
          disabled={allAccepted}
          className="self-start mt-4 bg-studio-ink hover:bg-studio-muted text-studio-page rounded-md h-10 px-5 text-sm font-medium"
        >
          {allAccepted ? <><Check className="mr-2 h-4 w-4" />All accepted</> : <>Accept All Suggestions <ArrowRight className="ml-2 h-4 w-4" /></>}
        </Button>
        </div>

        {/* Scores rail — 4 lens cards (Overall + Voice/Messaging/Strategy)
            then a single notes textarea + Refine Again. Visually on the LEFT
            (matching the input layout) via lg:order-1. */}
        <aside className="space-y-5 lg:order-1">
          <LensCard
            label="Overall Brand Fit"
            current={improvedOverall?.score ?? originalOverall?.score}
            previous={improvedOverall && originalOverall ? originalOverall.score : undefined}
            body={pickWhyThisMatters(result, channel, audience)}
          />
          <LensCard
            label="Voice"
            current={improvedScores?.voice.score ?? originalScores?.voice.score}
            previous={improvedScores && originalScores ? originalScores.voice.score : undefined}
            body={changesByLens.voice.length ? joinChanges(changesByLens.voice) : null}
          />
          <LensCard
            label="Messaging"
            current={improvedScores?.messaging.score ?? originalScores?.messaging.score}
            previous={improvedScores && originalScores ? originalScores.messaging.score : undefined}
            body={changesByLens.messaging.length ? joinChanges(changesByLens.messaging) : null}
          />
          <LensCard
            label="Strategy"
            current={improvedScores?.strategy.score ?? originalScores?.strategy.score}
            previous={improvedScores && originalScores ? originalScores.strategy.score : undefined}
            body={changesByLens.strategy.length ? joinChanges(changesByLens.strategy) : null}
          />

          {/* Any notes for the next pass? — single textarea + Refine Again */}
          <div className="pt-2">
            <p className="font-bold text-sm text-studio-ink mb-2">Any notes for the next pass?</p>
            <Textarea
              placeholder="Notes (optional)"
              value={noteDraft}
              onChange={e => setNoteDraft(e.target.value)}
              rows={3}
              className="bg-white border-studio-muted/30 text-studio-ink placeholder:text-studio-muted/65 text-sm rounded-md resize-none mb-3"
            />
            <button
              type="button"
              onClick={() => {
                const trimmed = noteDraft.trim()
                // Cumulative: refine the latest improved copy, not the original.
                handleRefine({ baseline: cleanedImproved, notesOverride: trimmed ? [trimmed] : [] })
              }}
              disabled={loading}
              className="h-10 inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 disabled:text-studio-mutedSoft disabled:cursor-not-allowed group"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Refining…</span>
                </span>
              ) : (
                <>
                  <span className="underline underline-offset-2 group-disabled:no-underline">Refine Again</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </>
              )}
            </button>
          </div>
        </aside>
      </div>
    </div>
  )
}

function LensCard({ label, current, previous, body }: {
  label: string
  current?: number
  previous?: number
  body?: string | null
}) {
  return (
    <div className="space-y-1.5">
      <h4 className="font-bold text-sm text-studio-ink">
        {label}
      </h4>
      <p className={`text-2xl font-bold leading-none ${current != null ? scoreColorClass(current) : 'text-studio-mutedSoft'}`}>
        {current != null ? `${current}/100` : 'X/100'}
      </p>
      {previous != null && previous !== current && (
        <p className="text-xs italic text-studio-mutedSoft">from {previous}/100</p>
      )}
      {body && <p className="text-sm text-studio-ink/85 leading-relaxed pt-1">{body}</p>}
    </div>
  )
}

// Join an array of per-change rationale strings into a single paragraph. Keeps
// the narrow right-rail column from feeling list-heavy; preserves agent's prose.
function joinChanges(items: string[]): string {
  return items.join(' ')
}

function pickWhyThisMatters(result: ReviewResult, channel: string, audience: string): string {
  const lenses: Array<['voice' | 'messaging' | 'strategy', LensEntry]> = [
    ['voice', result.scorecard.voice],
    ['messaging', result.scorecard.messaging],
    ['strategy', result.scorecard.strategy],
  ]
  const weakest = lenses
    .filter(([, s]) => s.rationale)
    .sort((a, b) => lensScore(a[1], a[0]).score - lensScore(b[1], b[0]).score)[0]
  if (weakest && weakest[1].rationale) return weakest[1].rationale
  if (channel || audience) return `Original would land flat with ${audience || 'this audience'}${channel ? ` on ${channel}` : ''}. The refined version restores brand fit across all three lenses.`
  return 'The refined version restores brand fit across Voice, Messaging, and Strategy.'
}
