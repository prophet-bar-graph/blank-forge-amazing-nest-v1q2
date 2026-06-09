'use client'

import React, { useEffect, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Loader2, ArrowRight, RotateCcw, FileText, AlertCircle, Sparkles } from 'lucide-react'
import { useBrandProfile } from '@/components/BrandProfileProvider'
import { BRAND_SAMPLES, BrandProfile, emptyBrandProfile } from '@/lib/brandProfile'
import { USER_ID_HEADER } from '@/lib/userId'
import { extractPdfTextsInBrowser } from '@/lib/pdfjs-cdn'

type Mode = 'choice' | 'extracting' | 'edit' | 'applying'

interface BrandOnboardingModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Inputs that may render arrays as comma-separated text.
function listToText(arr: string[] | undefined): string { return (arr || []).join(', ') }
function textToList(text: string): string[] {
  return text.split(',').map(s => s.trim()).filter(Boolean)
}

export function BrandOnboardingModal({ open, onOpenChange }: BrandOnboardingModalProps) {
  const { profile, applyProfile, userId } = useBrandProfile()
  const [mode, setMode] = useState<Mode>('choice')
  const [workingProfile, setWorkingProfile] = useState<BrandProfile>(emptyBrandProfile())
  const [error, setError] = useState<string | null>(null)
  // Tracks which keys the most recent PDF extraction left blank. Lets us swap
  // the input's placeholder hint for an "Extractor left this blank" helper line
  // on exactly those fields, so users can tell what the agent did vs. didn't
  // populate. Empty Set ⟹ no extraction in play (blank-start / sample / edit
  // existing profile) ⟹ placeholders behave normally.
  const [extractedEmpty, setExtractedEmpty] = useState<Set<string>>(new Set())
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // When the modal opens, derive the initial mode:
  //  - No profile yet (first load): show the choice screen (Skip vs Upload)
  //  - Profile exists (user clicked "Configure brand"): jump straight to edit with current values pre-filled
  useEffect(() => {
    if (open) {
      setError(null)
      setExtractedEmpty(new Set())
      if (profile) {
        setMode('edit')
        setWorkingProfile({ ...profile })
      } else {
        setMode('choice')
        setWorkingProfile(emptyBrandProfile())
      }
    }
  }, [open, profile])

  const close = () => onOpenChange(false)

  // "Start with blank fields" — drop the user into the edit screen with an
  // empty BrandProfile so they can type each field manually (or click a Load
  // sample button to pre-populate). Nothing is persisted until they hit Apply.
  const handleStartBlank = () => {
    setError(null)
    setExtractedEmpty(new Set())
    setWorkingProfile(emptyBrandProfile())
    setMode('edit')
  }

  // Populate the edit form with one of the prepackaged sample profiles.
  // User can still edit fields before clicking Apply.
  const handleLoadSample = (sample: BrandProfile) => {
    setError(null)
    setExtractedEmpty(new Set())
    setWorkingProfile({ ...sample })
  }

  const handleFilePick = () => {
    fileInputRef.current?.click()
  }

  const handleFiles = async (files: File[]) => {
    if (!files.length) return
    setError(null)
    setMode('extracting')
    try {
      // Parse the PDFs in the browser via CDN-hosted PDF.js. Avoids needing
      // pdf-parse or pdfjs-dist in the server build, which the Architect
      // deploy pipeline couldn't install reliably. With multiple files, the
      // helper wraps each doc with `--- FILE: name ---` markers so the
      // extractor agent can tell sources apart.
      const text = await extractPdfTextsInBrowser(files)
      if (!text) {
        throw new Error('No text could be extracted from the uploaded PDF(s) (they may be scanned / image-only).')
      }
      const filename = files.length === 1 ? files[0].name : files.map(f => f.name).join(', ')
      const res = await fetch('/api/brand-profile/extract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [USER_ID_HEADER]: userId,
        },
        body: JSON.stringify({ filename, text }),
      })
      const json = await res.json()
      if (!json?.success || !json?.data) {
        throw new Error(json?.error || 'Extraction failed')
      }
      const data = json.data as BrandProfile
      const empties = new Set<string>()
      for (const [k, v] of Object.entries(data)) {
        const isEmpty = Array.isArray(v) ? v.length === 0 : !v || (typeof v === 'string' && !v.trim())
        if (isEmpty) empties.add(k)
      }
      setExtractedEmpty(empties)
      setWorkingProfile(data)
      setMode('edit')
    } catch (err: any) {
      setError(err?.message || 'Upload or extraction failed')
      setMode('choice')
    }
  }

  const handleApply = async () => {
    setError(null)
    if (!workingProfile.companyName?.trim()) {
      setError('Company name is required')
      return
    }
    setMode('applying')
    const result = await applyProfile(workingProfile)
    if (result) {
      close()
    } else {
      setError('Could not save the profile. Try again.')
      setMode('edit')
    }
  }

  const handleStartOver = () => {
    setError(null)
    setExtractedEmpty(new Set())
    setMode('choice')
    setWorkingProfile(emptyBrandProfile())
  }

  const busy = mode === 'extracting' || mode === 'applying'
  const dialogTitle =
    mode === 'choice' ? 'Configure your brand' :
    mode === 'extracting' ? 'Reading your brand guidelines…' :
    mode === 'edit' ? 'Review your brand profile' :
    'Saving…'

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o) }}>
      <DialogContent className={`${mode === 'edit' ? 'max-w-2xl' : 'max-w-lg'} border-studio-muted/30 bg-studio-page max-h-[90vh] overflow-y-auto`}>
        <DialogHeader>
          <DialogTitle className="text-2xl text-studio-ink">{dialogTitle}</DialogTitle>
          {mode === 'choice' && (
            <DialogDescription className="text-sm text-studio-muted/85 pt-2">
              Upload the client&rsquo;s brand-guidelines PDF and we&rsquo;ll auto-populate the studio with their company name, pillars, and voice persona. Or skip to use Vusion as the demo brand.
            </DialogDescription>
          )}
          {mode === 'extracting' && (
            <DialogDescription className="text-sm text-studio-muted/85 pt-2">
              The Brand Profile Extractor agent is parsing your PDF. This usually takes 20&ndash;60 seconds.
            </DialogDescription>
          )}
          {mode === 'edit' && (
            <DialogDescription className="text-sm text-studio-muted/85 pt-2">
              Review and edit. Blank fields will fall back to sensible generic defaults.
            </DialogDescription>
          )}
        </DialogHeader>

        {/* Hidden file input — opened by the Upload button. `multiple` lets the
            user pick more than one brand doc in a single browse. */}
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,application/x-pdf,application/octet-stream,.pdf"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = e.target.files
            if (files && files.length > 0) handleFiles(Array.from(files))
            e.target.value = ''  // allow re-uploading the same file(s)
          }}
        />

        {/* CHOICE — Drop zone for PDF upload, plus Start blank fallback */}
        {mode === 'choice' && (
          <div className="space-y-3 pt-4">
            <PdfDropZone onPick={handleFilePick} onFiles={handleFiles} />

            <Button
              onClick={handleStartBlank}
              variant="outline"
              className="w-full h-12 border-studio-muted/30 text-studio-muted/90 hover:bg-studio-border/30 justify-start gap-3"
            >
              <FileText className="h-4 w-4" />
              Start with blank fields
              <ArrowRight className="ml-auto h-4 w-4" />
            </Button>

            {error && (
              <div className="flex items-start gap-2 text-xs text-studio-scoreRed pt-2">
                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
          </div>
        )}

        {/* BUSY STATES — extracting / applying */}
        {(mode === 'extracting' || mode === 'applying') && (
          <div className="flex flex-col items-center gap-4 py-8">
            <Loader2 className="h-8 w-8 animate-spin text-studio-ink" />
            <p className="text-sm text-studio-muted/85">
              {mode === 'extracting' && 'Parsing the PDF and extracting your brand profile…'}
              {mode === 'applying' && 'Saving to your workspace…'}
            </p>
          </div>
        )}

        {/* EDIT — review + edit BrandProfile fields */}
        {mode === 'edit' && (
          <div className="space-y-4 pt-2">
            {/* Large PDF drop zone — same affordance as the choice screen.
                Click or drop a PDF to re-run the extractor and repopulate the
                form below with fresh values. */}
            <PdfDropZone onPick={handleFilePick} onFiles={handleFiles} />

            {/* Sample loaders — quick way to populate the form for demos /
                testing. Clicking a sample button replaces the form values. */}
            <div className="flex items-center gap-2 flex-wrap pb-3 border-b border-studio-muted/20">
              <Sparkles className="h-3.5 w-3.5 text-studio-muted/85 flex-shrink-0" />
              <span className="text-[11px] uppercase tracking-[0.14em] text-studio-muted/85">Load sample</span>
              {BRAND_SAMPLES.map((s) => (
                <Button
                  key={s.id}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleLoadSample(s.profile)}
                  className="h-7 px-3 text-[12px] border-studio-muted/30 text-studio-muted/90 hover:bg-studio-border/30 hover:text-studio-ink"
                >
                  {s.label}
                </Button>
              ))}
              <span className="ml-auto text-[11px] italic text-studio-muted/75">
                Overwrites current form values. Doesn&rsquo;t save until you click Apply.
              </span>
            </div>

            <Field label="Company name" required extractorEmpty={extractedEmpty.has('companyName')}>
              <Input
                value={workingProfile.companyName}
                onChange={(e) => setWorkingProfile({ ...workingProfile, companyName: e.target.value })}
                className="bg-white border-studio-muted/30"
                placeholder={extractedEmpty.has('companyName') ? undefined : 'e.g. Vusion'}
              />
            </Field>

            <Field label="Tagline" extractorEmpty={extractedEmpty.has('tagline')}>
              <Input
                value={workingProfile.tagline}
                onChange={(e) => setWorkingProfile({ ...workingProfile, tagline: e.target.value })}
                className="bg-white border-studio-muted/30"
                placeholder={extractedEmpty.has('tagline') ? undefined : 'One-line positioning'}
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Category frame" extractorEmpty={extractedEmpty.has('categoryFrame')}>
                <Input
                  value={workingProfile.categoryFrame}
                  onChange={(e) => setWorkingProfile({ ...workingProfile, categoryFrame: e.target.value })}
                  className="bg-white border-studio-muted/30"
                  placeholder={extractedEmpty.has('categoryFrame') ? undefined : 'e.g. Connected Commerce'}
                />
              </Field>

              <Field label="Key phrase (voice persona name)" extractorEmpty={extractedEmpty.has('keyPhrase')}>
                <Input
                  value={workingProfile.keyPhrase}
                  onChange={(e) => setWorkingProfile({ ...workingProfile, keyPhrase: e.target.value })}
                  className="bg-white border-studio-muted/30"
                  placeholder={extractedEmpty.has('keyPhrase') ? undefined : 'e.g. The Proactive Partner'}
                />
              </Field>
            </div>

            <Field
              label="Voice persona body"
              hint="2-4 sentences describing how the brand sounds (tone, posture, style). Renders as the right-column body on Brand at a Glance."
              extractorEmpty={extractedEmpty.has('voicePersonaBody')}
            >
              <Textarea
                value={workingProfile.voicePersonaBody || ''}
                onChange={(e) => setWorkingProfile({ ...workingProfile, voicePersonaBody: e.target.value })}
                className="bg-white border-studio-muted/30 min-h-[80px]"
                placeholder={extractedEmpty.has('voicePersonaBody') ? undefined : 'e.g. Our voice is credible, supportive, and evocative — grounding insights in data and bringing customers along with clarity.'}
              />
            </Field>

            <Field label="Customer quest" extractorEmpty={extractedEmpty.has('customerQuest')}>
              <Textarea
                value={workingProfile.customerQuest}
                onChange={(e) => setWorkingProfile({ ...workingProfile, customerQuest: e.target.value })}
                className="bg-white border-studio-muted/30 min-h-[60px]"
                placeholder={extractedEmpty.has('customerQuest') ? undefined : 'What your customer is trying to do'}
              />
            </Field>

            <Field label="Promise of value" extractorEmpty={extractedEmpty.has('promiseOfValue')}>
              <Textarea
                value={workingProfile.promiseOfValue}
                onChange={(e) => setWorkingProfile({ ...workingProfile, promiseOfValue: e.target.value })}
                className="bg-white border-studio-muted/30 min-h-[80px]"
                placeholder={extractedEmpty.has('promiseOfValue') ? undefined : 'Core value-promise paragraph'}
              />
            </Field>

            <Field label="Default call to action" extractorEmpty={extractedEmpty.has('callToAction')}>
              <Input
                value={workingProfile.callToAction}
                onChange={(e) => setWorkingProfile({ ...workingProfile, callToAction: e.target.value })}
                className="bg-white border-studio-muted/30"
                placeholder={extractedEmpty.has('callToAction') ? undefined : 'e.g. Discover more'}
              />
            </Field>

            <Field
              label="Portfolio pillars"
              hint="Products / solution categories (comma-separated)"
              extractorEmpty={extractedEmpty.has('portfolioPillars')}
            >
              <Input
                value={listToText(workingProfile.portfolioPillars)}
                onChange={(e) => setWorkingProfile({ ...workingProfile, portfolioPillars: textToList(e.target.value) })}
                className="bg-white border-studio-muted/30"
                placeholder={extractedEmpty.has('portfolioPillars') ? undefined : 'e.g. Store Ops, Data Commerce, Local eCommerce'}
              />
            </Field>

            <Field
              label="Partner / value pillars"
              hint="Supporting messages or brand values (comma-separated)"
              extractorEmpty={extractedEmpty.has('partnerPillars')}
            >
              <Input
                value={listToText(workingProfile.partnerPillars)}
                onChange={(e) => setWorkingProfile({ ...workingProfile, partnerPillars: textToList(e.target.value) })}
                className="bg-white border-studio-muted/30"
                placeholder={extractedEmpty.has('partnerPillars') ? undefined : 'e.g. Designed for People, A Unified Ecosystem'}
              />
            </Field>

            <Field label="Short brand summary" extractorEmpty={extractedEmpty.has('shortFormSummary')}>
              <Textarea
                value={workingProfile.shortFormSummary}
                onChange={(e) => setWorkingProfile({ ...workingProfile, shortFormSummary: e.target.value })}
                className="bg-white border-studio-muted/30 min-h-[60px]"
                placeholder={extractedEmpty.has('shortFormSummary') ? undefined : '1-2 sentence summary'}
              />
            </Field>

            {error && (
              <div className="flex items-start gap-2 text-xs text-studio-scoreRed">
                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex items-center justify-between gap-3 pt-2">
              <Button
                onClick={handleStartOver}
                variant="ghost"
                className="text-studio-muted/85 hover:text-studio-ink gap-2 h-10"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Start over
              </Button>
              <Button
                onClick={handleApply}
                disabled={!workingProfile.companyName?.trim()}
                className="bg-studio-ink hover:bg-studio-ink text-studio-page h-10 gap-2"
              >
                Apply &amp; close
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, required, hint, extractorEmpty, children }: {
  label: string
  required?: boolean
  hint?: string
  extractorEmpty?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <Label className="text-[11px] uppercase tracking-[0.18em] text-studio-muted/90 mb-1 block">
        {label}{required && <span className="text-studio-scoreRed ml-1">*</span>}
      </Label>
      {hint && <p className="text-[11px] italic text-studio-muted/85 mb-1.5">{hint}</p>}
      {extractorEmpty && (
        <p className="text-[11px] italic text-studio-muted/85 mb-1.5">
          Extractor left this blank — fill in if useful.
        </p>
      )}
      {children}
    </div>
  )
}

// Reusable PDF drop zone. Used in both choice mode (first-load) and edit mode
// (re-extract). Each instance owns its own isDragging state so highlighting one
// doesn't bleed into the other.
function PdfDropZone({ onPick, onFiles }: { onPick: () => void; onFiles: (files: File[]) => void }) {
  const [isDragging, setIsDragging] = useState(false)
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onPick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick() } }}
      onDragOver={(e) => { e.preventDefault(); if (!isDragging) setIsDragging(true) }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setIsDragging(false)
        const files = e.dataTransfer.files
        if (files && files.length > 0) onFiles(Array.from(files))
      }}
      className={`w-full rounded-xl border-2 border-dashed px-6 py-12 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors ${
        isDragging
          ? 'border-studio-ink bg-studio-cardSubtle'
          : 'border-studio-muted/50 bg-studio-page hover:border-studio-ink hover:bg-studio-cardSubtle'
      }`}
    >
      <FileText className="h-8 w-8 text-studio-muted" strokeWidth={1.5} />
      <p className="font-bold text-base text-studio-ink mt-2">Upload PDFs here</p>
      <p className="text-sm text-studio-muted text-center">
        Voice Persona, Brand Voice Guidelines, Brand Positioning, etc.
      </p>
    </div>
  )
}
