'use client'

import React from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { BookOpen, PenSquare, Wand2, ChevronRight, User, FileText, Sparkles } from 'lucide-react'

interface AboutModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AboutModal({ open, onOpenChange }: AboutModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl border-studio-muted/30 bg-studio-page max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <p className="text-xs uppercase tracking-wide text-studio-mutedSoft">About this app</p>
          <DialogTitle className="text-2xl text-studio-ink">The Writing Studio</DialogTitle>
          <DialogDescription className="text-sm text-studio-muted pt-2">
            A brand-aware writing workspace built on MAIA.
          </DialogDescription>
        </DialogHeader>

        <ArchitectureDiagram />

        <div className="space-y-5 pt-4">
          <Section title="Purpose">
            The Studio helps marketers and brand teams compose new copy, refine existing copy, and answer questions about brand guidelines. Every response is grounded in the brand&rsquo;s own voice and messaging.
          </Section>

          <Section title="Primary users">
            Brand and marketing teams responsible for on-brand copy. Campaign managers, content strategists, brand stewards, and anyone drafting customer facing communications.
          </Section>

          <Section title="Where it fits">
            Anywhere a draft lives. Compose kicks off a new piece. Refine scores an existing draft against the Brand info. Ask looks up a guideline mid-write. The Studio sits alongside an existing brief and review workflow rather than replacing it.
          </Section>

          <Section title="Key capabilities">
            Compose generates three on-brand variants from a structured brief. Refine returns Voice, Messaging, and Strategy scores with annotated suggestions for any pasted copy. Ask is a command palette (&#8984;K) for quick questions against the Brand info. Learn shows the brand at a glance.
          </Section>

          <Section title="Inputs">
            Brand info uploaded once as a PDF and parsed into a structured profile. Per session: a brief in Compose, copy to review in Refine, or a question in Ask.
          </Section>

          <Section title="Outputs">
            Compose returns three labeled variants with Voice, Messaging, Strategy, and Word count scores. Refine returns annotated copy with overall brand fit plus lens by lens deltas. Ask returns a grounded answer drawn from the Brand info.
          </Section>

          <Section title="Value">
            Faster on-brand copy. Teams stop re-explaining the brand to writers and reviewers because the Brand info travels with every request. Every output reflects the same voice.
          </Section>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="font-bold text-base text-studio-ink mb-1.5">{title}</h3>
      <p className="text-sm text-studio-muted leading-relaxed">{children}</p>
    </div>
  )
}

/**
 * Architecture diagram. Two-tier story:
 *   1. Brand info loads once and travels with every call below.
 *   2. The user (human in the loop) directs a single journey across the tabs:
 *      Learn -> Compose -> Refine. Each step has an agent that runs when the
 *      user acts. Ask is a palette callout, always available.
 *
 * Layout is a flex stack so the diagram is responsive and self-aligning at
 * any modal width. No absolute coordinates.
 */
function ArchitectureDiagram() {
  return (
    <div className="mt-6">
      <div className="rounded-2xl border border-studio-border bg-studio-cardSubtle p-5 sm:p-6 space-y-5">

        {/* Tier 1 — Brand info, the foundation that flows into every step. */}
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-studio-border bg-studio-page shadow-sm">
          <div className="h-9 w-9 rounded-lg bg-studio-card flex items-center justify-center flex-shrink-0">
            <FileText className="h-4 w-4 text-studio-ink" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm text-studio-ink">Brand info</p>
            <p className="text-xs text-studio-muted">Uploaded once and serves as the knowledge base for the Writing Studio.</p>
          </div>
        </div>

        {/* Tier 2 — the human journey. A single horizontal rail with three
            step cards. The "You" badge sits at the start of the rail and the
            chevrons signal a continuous flow, not three separate entities. */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-studio-ink bg-studio-ink text-studio-page">
              <User className="h-3 w-3" />
              <span className="text-[11px] font-bold uppercase tracking-wider">You</span>
            </div>
            <p className="text-xs text-studio-mutedSoft italic">direct each step, with AI augmenting your workflow.</p>
          </div>

          <div className="flex items-stretch gap-2 sm:gap-3">
            <JourneyStep
              icon={<BookOpen className="h-4 w-4" />}
              title="Learn"
              desc="Orient on the brand at a glance."
              agent="No agent. Just brand context."
            />
            <ChevronRight className="h-5 w-5 text-studio-mutedSoft self-center flex-shrink-0" aria-hidden />
            <JourneyStep
              icon={<PenSquare className="h-4 w-4" />}
              title="Compose"
              desc="Brief in. Three on-brand variants out."
              agent="Compose agent"
            />
            <ChevronRight className="h-5 w-5 text-studio-mutedSoft self-center flex-shrink-0" aria-hidden />
            <JourneyStep
              icon={<Wand2 className="h-4 w-4" />}
              title="Refine"
              desc="Paste copy. Get scores and suggestions."
              agent="Refine agent"
            />
          </div>
        </div>

        {/* Tier 3 — Ask is a palette, always available. Rendered as a thin
            callout to signal it sits alongside the journey, not on it. */}
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-dashed border-studio-border bg-studio-page">
          <Sparkles className="h-4 w-4 text-studio-ink flex-shrink-0" />
          <p className="text-xs text-studio-muted">
            <span className="font-bold text-studio-ink">Ask palette (&#8984;K)</span> is always available. Grounded answers from the Brand info, anywhere in the journey.
          </p>
        </div>
      </div>

    </div>
  )
}

function JourneyStep({
  icon,
  title,
  desc,
  agent,
}: {
  icon: React.ReactNode
  title: string
  desc: string
  agent: string
}) {
  return (
    <div className="flex-1 rounded-xl border border-studio-border bg-studio-page p-4 flex flex-col shadow-sm">
      <div className="flex items-center gap-2 text-studio-ink mb-1.5">
        {icon}
        <p className="font-bold text-sm">{title}</p>
      </div>
      <p className="text-xs text-studio-muted leading-relaxed flex-1">{desc}</p>
      <p className="text-[10px] uppercase tracking-wider text-studio-mutedSoft mt-3 pt-2 border-t border-studio-border">{agent}</p>
    </div>
  )
}
