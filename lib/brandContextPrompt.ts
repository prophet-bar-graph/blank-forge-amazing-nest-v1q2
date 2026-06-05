// Brand-context prompt prefix. Prepended to every Compose / Refine / Chat call
// so the Vusion-baked agents produce client-branded copy without per-client
// agent forks.
//
// Empty fields are dropped from the block (no "Tagline: undefined" lines).
// The block ends with a directive that tells the agent to use this brand's
// vocabulary and not import language from other brands the agent may know.

import type { BrandProfile } from '@/lib/brandProfile'

export function buildBrandContextBlock(p: BrandProfile): string {
  const summary = [
    `# Brand context — ${p.companyName || 'this brand'}`,
    p.tagline ? `Tagline: ${p.tagline}` : null,
    p.categoryFrame ? `Category: ${p.categoryFrame}` : null,
    p.customerQuest ? `Customer quest: ${p.customerQuest}` : null,
    p.promiseOfValue ? `Promise: ${p.promiseOfValue}` : null,
    p.partnerPillars?.length ? `Value pillars: ${p.partnerPillars.join('; ')}` : null,
    p.portfolioPillars?.length ? `Solutions / products: ${p.portfolioPillars.join('; ')}` : null,
    p.keyPhrase ? `Voice persona: ${p.keyPhrase}` : null,
    p.voicePersonaBody ? `Voice persona description: ${p.voicePersonaBody}` : null,
    p.shortFormSummary ? `Summary: ${p.shortFormSummary}` : null,
    '',
    "Write in this brand's voice. Reference its products and pillars by name. Do not import vocabulary or examples from other brands you may know about.",
  ].filter((line): line is string => line !== null).join('\n')

  // When the user uploaded a brand bible PDF, append the raw parsed text so the
  // KB-less Compose/Refine/Chat agents can ground in the actual source document
  // instead of relying only on the distilled 11-field summary above.
  const bible = p.brandBibleText?.trim()
  if (!bible) return summary + '\n'

  return [
    summary,
    '',
    '--- BRAND BIBLE (raw source document) ---',
    bible,
    '--- END BRAND BIBLE ---',
    '',
  ].join('\n')
}
