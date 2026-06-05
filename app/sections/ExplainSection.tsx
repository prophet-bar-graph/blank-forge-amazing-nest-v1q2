'use client'

import React from 'react'
import { ArrowRight, Sparkles, PenSquare, Wand2, Lightbulb } from 'lucide-react'
import { useBrandProfile } from '@/components/BrandProfileProvider'
import { emptyBrandProfile } from '@/lib/brandProfile'

// ---- Types ----

interface ExplainSectionProps {
  onSwitchToReview: () => void
  onSwitchToCompose: () => void
  onOpenPalette: () => void
}

// ---- UI ----

export default function ExplainSection({ onSwitchToReview, onSwitchToCompose, onOpenPalette }: ExplainSectionProps) {
  const { profile } = useBrandProfile()
  const brand = profile || emptyBrandProfile()

  const leadHeading = brand.categoryFrame || (brand.companyName ? `${brand.companyName} Story` : 'Lead Message')
  const voiceHeading = brand.keyPhrase || 'Voice Persona'
  const voiceBody = brand.voicePersonaBody?.trim() || brand.shortFormSummary?.trim() || ''
  // Cap displayed pills at 4 per column so the grid-cols-2 layout renders clean.
  // The full arrays still reach the agent via buildBrandContextBlock.
  const PILL_CAP = 4
  const messagePillars = (brand.partnerPillars || []).slice(0, PILL_CAP)
  const portfolioPillars = (brand.portfolioPillars || []).slice(0, PILL_CAP)

  return (
    <div className="space-y-12">
      {/* ---- 1. HOW TO USE OUR GUIDELINES ---- */}
      <section className="space-y-5">
        <h2 className="font-bold text-lg text-studio-ink">How to Use Our Guidelines</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <HowToCard
            icon={<PenSquare className="h-4 w-4" />}
            title="Compose"
            blurb="Start from a brief."
            hint="If you know what you need to communicate, but need to write the copy."
            ctaLabel="Try Compose"
            onClick={onSwitchToCompose}
          />
          <HowToCard
            icon={<Wand2 className="h-4 w-4" />}
            title="Refine"
            blurb="Evaluate and revise existing copy."
            hint="If you have the copy drafted but want to know how it delivers on voice, messaging, and/or strategy."
            ctaLabel="Try Refine"
            onClick={onSwitchToReview}
          />
          <HowToCard
            icon={<Sparkles className="h-4 w-4" />}
            title="Ask"
            blurb="Find what you need."
            hint="If you have questions about any of the three guidelines."
            ctaLabel="Open Ask"
            onClick={onOpenPalette}
          />
          <HowToCard
            icon={<Lightbulb className="h-4 w-4" />}
            title="Tip"
            blurb={null}
            hint="You can use any of these tools independently depending on what you have (pre-set copy vs. no copy)."
            ctaLabel={null}
            onClick={() => {}}
            bare
          />
        </div>
      </section>

      <div className="border-t border-studio-border" />

      {/* ---- 2. OUR BRAND AT A GLANCE ---- */}
      <section className="space-y-5">
        <h2 className="font-bold text-lg text-studio-ink">Our Brand at a Glance</h2>

        <div className="rounded-2xl bg-studio-card border border-studio-border p-8 lg:p-10 pt-5 lg:pt-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">

            {/* Overarching Message column */}
            <div className="space-y-5">
              <div className="inline-flex items-center px-4 py-1.5 rounded-full border border-studio-border bg-studio-page text-sm text-studio-ink">
                Our Lead Message
              </div>
              <h3 className="font-bold text-3xl text-studio-ink leading-tight">{leadHeading}</h3>
              {brand.promiseOfValue && (
                <p className="text-[15px] text-studio-muted leading-relaxed">
                  {brand.promiseOfValue}
                </p>
              )}
              {messagePillars.length > 0 && (
                <div className="pt-3">
                  <p className="font-bold text-sm text-studio-ink">Messaging Themes</p>
                  <p className="italic text-[13px] text-studio-mutedSoft mt-1 mb-3">What our writing should communicate</p>
                  <div className="grid grid-cols-2 gap-2">
                    {messagePillars.map(p => (
                      <span key={p} className="px-3 py-1.5 rounded-full bg-studio-page border border-studio-border text-[12px] text-studio-muted text-center">{p}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Voice Persona column */}
            <div className="space-y-5">
              <div className="inline-flex items-center px-4 py-1.5 rounded-full border border-studio-border bg-studio-page text-sm text-studio-ink">
                Our Voice Persona
              </div>
              <h3 className="font-bold text-3xl text-studio-ink leading-tight">{voiceHeading}</h3>
              {voiceBody && (
                <p className="text-[15px] text-studio-muted leading-relaxed">
                  {voiceBody}
                </p>
              )}
              {portfolioPillars.length > 0 && (
                <div className="pt-3">
                  <p className="font-bold text-sm text-studio-ink">Portfolio</p>
                  <p className="italic text-[13px] text-studio-mutedSoft mt-1 mb-3">What we offer</p>
                  <div className="grid grid-cols-2 gap-2">
                    {portfolioPillars.map(p => (
                      <span key={p} className="px-3 py-1.5 rounded-full bg-studio-page border border-studio-border text-[12px] text-studio-muted text-center">{p}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>
      </section>
    </div>
  )
}

function HowToCard({ icon, title, blurb, hint, ctaLabel, onClick, bare }: {
  icon: React.ReactNode
  title: string
  blurb: string | null
  hint: string
  ctaLabel: string | null
  onClick: () => void
  bare?: boolean
}) {
  return (
    <article className={`p-5 flex flex-col ${bare ? '' : 'rounded-xl border border-studio-border bg-studio-page'}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-studio-ink">{icon}</span>
        <h3 className="font-bold text-base text-studio-ink leading-tight">{title}</h3>
      </div>
      {blurb && <p className="italic text-[13px] text-studio-muted mb-3">{blurb}</p>}
      <p className="text-[13px] text-studio-muted leading-relaxed flex-1">{hint}</p>
      {ctaLabel && (
        <button
          onClick={onClick}
          className="mt-4 self-start inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-studio-ink text-studio-page text-xs hover:bg-studio-muted transition-colors"
        >
          <span>{ctaLabel}</span>
          <ArrowRight className="h-3 w-3" />
        </button>
      )}
    </article>
  )
}
