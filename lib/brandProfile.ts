// Brand profile — the centralized client-brand data that every brand-variable
// surface in the webapp reads from. One singleton doc per deployed template.
// Populated either by the PDF extractor agent, by the strategist filling the
// blank form, or by loading one of the prepackaged sample profiles below.

export interface BrandProfile {
  companyName: string                      // header wordmark + sidebar
  tagline: string                          // agent context only, no UI surface in v1
  categoryFrame: string                    // overarching category (e.g. "Connected Commerce")
  customerQuest: string                    // agent context only, no UI surface in v1
  promiseOfValue: string                   // LEFT column body in Brand at a Glance
  callToAction: string                     // default CTA verb (seeds chips)
  portfolioPillars: string[]               // solution / product categories
  partnerPillars: string[]                 // value pillars (supporting messages)
  keyPhrase: string                        // voice persona name / linguistic signature
  voicePersonaBody?: string                // RIGHT column body in Brand at a Glance — describes HOW the brand sounds (tone, posture, style). Optional for backward compatibility with docs created before this field existed; UI falls back to shortFormSummary when empty.
  shortFormSummary: string                 // 1-2 sentence brand summary; fallback for voicePersonaBody on older docs
  brandBibleText?: string                  // Raw parsed text of the most-recently-uploaded brand bible PDF. Injected into the Compose/Refine/Chat prompt prefix so the agent has the full source document, not just the 11 distilled fields. Empty when the profile was created via "Start blank" or "Load sample."
  updatedAt?: string                       // metadata
}

// Empty / blank profile shape — used as the starting point for the
// "Start with blank fields" path and as the fallback when no doc exists yet.
// Sections handle empty fields gracefully via conditional rendering, so a
// blank profile renders as a minimal-but-not-broken app shell.
export function emptyBrandProfile(): BrandProfile {
  return {
    companyName: '',
    tagline: '',
    categoryFrame: '',
    customerQuest: '',
    promiseOfValue: '',
    callToAction: '',
    portfolioPillars: [],
    partnerPillars: [],
    keyPhrase: '',
    voicePersonaBody: '',
    shortFormSummary: '',
    brandBibleText: '',
  }
}

// ─── Prepackaged sample profiles ─────────────────────────────────────────────
// Loadable from the modal's edit screen via "Load sample". Useful for demos,
// validating the agent prompt prefix, and seeing how the UI looks with a fully
// populated profile. Strategists can pick a sample as a starting point and
// edit from there before clicking Apply.

export const VUSION_SAMPLE_PROFILE: BrandProfile = {
  companyName: 'Vusion',
  tagline: 'The platform for Connected Commerce.',
  categoryFrame: 'Connected Commerce',
  customerQuest: 'Run a retail operation where every shelf, store, and signal talks to every other one.',
  promiseOfValue: "Better store performance, measurable growth, and new revenue streams are all made possible by Vusion's suite of Connected Commerce solutions. Our platform enhances the shopper and associate experience by unifying in-store signals with existing systems and turning them into action.",
  callToAction: 'Discover more',
  portfolioPillars: ['Store Operational Excellence', 'Data-Driven Commerce', 'Local eCommerce', 'Retail Media & Shopper Experiences'],
  partnerPillars: ['Designed for People', 'A Unified Ecosystem', 'Inspired Partnerships', 'Positive Commerce'],
  keyPhrase: 'The Proactive Partner',
  voicePersonaBody: 'Our voice is credible, supportive, and evocative — grounding insights in data, guiding with accessible language, and asking bold questions about what is next. We anchor stories in evidence, bring customers along with clarity, and lead with declarative confidence toward a stronger future.',
  shortFormSummary: "Vusion's Connected Commerce platform unifies in-store operations and intelligence in one place.",
}

export const TPG_SAMPLE_PROFILE: BrandProfile = {
  companyName: 'TPG',
  tagline: 'Investing in growth that lasts.',
  categoryFrame: 'Alternative Asset Management',
  customerQuest: 'Build durable value in portfolio companies that compound over decades, not quarters.',
  promiseOfValue: 'TPG partners with founders, operators, and management teams to scale businesses with conviction. We deploy patient capital backed by operating expertise across private equity, growth, impact, real estate, and credit — pairing financial strength with hands-on partnership to build companies that endure.',
  callToAction: 'Partner with us',
  portfolioPillars: ['Capital', 'Growth', 'Impact', 'Real Estate', 'Credit'],
  partnerPillars: ['Hands-on partnership', 'Operational excellence', 'Responsible growth', 'Founder alignment'],
  keyPhrase: 'The Conviction Capital',
  voicePersonaBody: 'Our voice carries the conviction of a long-term partner — direct, evidence-led, and grounded in the realities of running a business. We speak with patient confidence, anchor every claim in operating reality, and earn trust by showing our work rather than asserting expertise. When we make a bold call, it is because the data and our experience point the same way.',
  shortFormSummary: 'TPG is a leading global alternative asset management firm investing in companies positioned to lead their categories.',
}

// All available sample profiles, surfaced as toggles in the modal's edit screen.
export const BRAND_SAMPLES: ReadonlyArray<{ id: string; label: string; profile: BrandProfile }> = [
  { id: 'tpg', label: 'TPG', profile: TPG_SAMPLE_PROFILE },
  { id: 'vusion', label: 'Vusion', profile: VUSION_SAMPLE_PROFILE },
]
