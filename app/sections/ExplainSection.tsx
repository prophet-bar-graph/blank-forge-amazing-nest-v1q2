'use client'

import React from 'react'
import { Sparkles, PenSquare, Wand2, Lightbulb } from 'lucide-react'
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
  // Cap displayed pills at 4 per column so the wrapped row stays single-line on
  // typical desktop widths. The full arrays still reach the agent via buildBrandContextBlock.
  const PILL_CAP = 4
  const messagePillars = (brand.partnerPillars || []).slice(0, PILL_CAP)
  const portfolioPillars = (brand.portfolioPillars || []).slice(0, PILL_CAP)
  const voicePrinciples = (brand.voicePrinciples || []).slice(0, PILL_CAP)

  return (
    <div className="space-y-12">
      {/* ---- 1. HOW TO USE OUR GUIDELINES ---- */}
      <section className="space-y-5">
        <h2 className="font-bold text-lg text-studio-ink">How to Use Our Guidelines</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <HowToCard
            icon={<PenSquare className="h-5 w-5" />}
            title="Compose"
            blurb="Start from a brief"
            hint="If you know what you need to communicate, but don't have the copy yet."
            ctaLabel="Build the brief"
            onClick={onSwitchToCompose}
          />
          <HowToCard
            icon={<Wand2 className="h-5 w-5" />}
            title="Refine"
            blurb="Evaluate and revise existing copy"
            hint="If you have the copy drafted but want to know how it delivers on voice, messaging, and/or strategy."
            ctaLabel="Submit copy"
            onClick={onSwitchToReview}
          />
          <HowToCard
            icon={<Sparkles className="h-5 w-5" />}
            title="Ask"
            blurb="Find what you need"
            hint="If you have questions about any of the guidelines."
            ctaLabel="Get my questions answered"
            onClick={onOpenPalette}
          />
          <HowToCard
            icon={<Lightbulb className="h-5 w-5" />}
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

        {portfolioPillars.length > 0 && (
          <div>
            <p className="font-bold text-sm text-studio-ink">Portfolio Pillars</p>
            <p className="italic text-[13px] text-studio-mutedSoft mt-1 mb-3">What do we offer?</p>
            <div className="flex flex-wrap gap-2">
              {portfolioPillars.map(p => (
                <span key={p} className="px-3 py-1.5 rounded-md bg-studio-card text-[13px] text-studio-ink">{p}</span>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16">

          {/* Overarching Message column. flex flex-col + gap so the chips
              section can be bottom-anchored with mt-auto, keeping it aligned
              with the right column's chips regardless of body length. */}
          <div className="flex flex-col gap-5">
            <div className="inline-flex items-center px-4 py-1.5 rounded-full border border-studio-ink bg-studio-page text-sm text-studio-ink w-fit">
              Our Lead Message
            </div>
            <h3 className="font-bold text-4xl text-studio-ink leading-tight">{leadHeading}</h3>
            {brand.promiseOfValue && (
              <p className="text-[15px] text-studio-muted leading-relaxed">
                {brand.promiseOfValue}
              </p>
            )}
            {messagePillars.length > 0 && (
              <div className="mt-auto pt-3">
                <p className="font-bold text-sm text-studio-ink">Messaging Themes</p>
                <p className="italic text-[13px] text-studio-mutedSoft mt-1 mb-3">What should our writing communicate?</p>
                <div className="flex flex-wrap gap-2">
                  {messagePillars.map(p => (
                    <span key={p} className="px-3 py-1.5 rounded-md bg-studio-card text-[13px] text-studio-ink">{p}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Voice Persona column */}
          <div className="flex flex-col gap-5">
            <div className="inline-flex items-center px-4 py-1.5 rounded-full border border-studio-ink bg-studio-page text-sm text-studio-ink w-fit">
              Our Voice Persona
            </div>
            <h3 className="font-bold text-4xl text-studio-ink leading-tight">{voiceHeading}</h3>
            {voiceBody && (
              <p className="text-[15px] text-studio-muted leading-relaxed">
                {voiceBody}
              </p>
            )}
            {voicePrinciples.length > 0 && (
              <div className="mt-auto pt-3">
                <p className="font-bold text-sm text-studio-ink">Voice Principles</p>
                <p className="italic text-[13px] text-studio-mutedSoft mt-1 mb-3">How should we write to sound consistent and distinct?</p>
                <div className="flex flex-wrap gap-2">
                  {voicePrinciples.map(p => (
                    <span key={p} className="px-3 py-1.5 rounded-md bg-studio-card text-[13px] text-studio-ink">{p}</span>
                  ))}
                </div>
              </div>
            )}
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
  const inner = (
    <>
      <div className="mb-3 text-studio-ink">{icon}</div>
      <h3 className="font-bold text-[26px] text-studio-ink leading-tight">{title}</h3>
      {blurb && <p className="italic text-sm text-studio-muted mt-1">{blurb}</p>}
      <p className="text-sm text-studio-muted leading-relaxed mt-3 flex-1">{hint}</p>
      {ctaLabel && (
        <span className="mt-4 text-sm text-blue-600 underline underline-offset-2 group-hover:text-blue-700">
          {ctaLabel}
        </span>
      )}
    </>
  )

  if (bare) {
    return <div className="p-5 flex flex-col">{inner}</div>
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="group text-left p-6 flex flex-col rounded-2xl border border-black/75 bg-studio-page hover:border-studio-ink hover:bg-studio-cardSubtle transition-colors cursor-pointer"
    >
      {inner}
    </button>
  )
}
