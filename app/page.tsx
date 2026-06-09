'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { callAIAgent, extractText } from '@/lib/aiAgent'

import WriteSection from './sections/WriteSection'
import ReviewSection from './sections/ReviewSection'
import ExplainSection from './sections/ExplainSection'
import CommandPalette from '@/components/CommandPalette'
import { BrandOnboardingModal } from '@/components/BrandOnboardingModal'
import { useBrandProfile } from '@/components/BrandProfileProvider'
import { AvatarDropdown } from '@/components/AvatarDropdown'
import { AboutModal } from '@/components/AboutModal'
import { BookOpen, PenSquare, Wand2, Sparkles, HelpCircle } from 'lucide-react'

// Brand-agnostic clones of the three mode-specific agents. The Vusion-locked
// originals had a KNOWLEDGE_BASE feature pointing at Vusion's RAG; these
// clones strip that and rely entirely on the per-call Brand Context block
// (see lib/brandContextPrompt.ts) — which includes both the structured
// BrandProfile and, when available, the raw parsed brand bible text.
//
// Vusion-locked originals (kept on MAIA for reference, no longer called):
//   Compose: 6a1c6cbb8886862ba01d9792
//   Refine:  6a1c6cc07baa3366ce92da89
//   Chat:    6a1c6cc2df4381b939d7a454
const COMPOSE_AGENT_ID = '6a21b4aaf5e31cf63ebbd79f'
const REFINE_AGENT_ID  = '6a21b4ab8378e43bad9369d4'
const CHAT_AGENT_ID    = '6a21b4ab5ba5d27b5b2f7bf8'

const TABS = [
  { key: 'learn',   label: 'Learn',   Icon: BookOpen },
  { key: 'compose', label: 'Compose', Icon: PenSquare },
  { key: 'refine',  label: 'Refine',  Icon: Wand2 },
] as const

type TabKey = typeof TABS[number]['key']

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: '' }
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-studio-page text-studio-ink">
          <div className="text-center p-8 max-w-md">
            <h2 className="font-sans font-bold text-2xl mb-2">Something went wrong</h2>
            <p className="text-studio-muted mb-4 text-sm">{this.state.error}</p>
            <button onClick={() => this.setState({ hasError: false, error: '' })} className="px-4 py-2 bg-studio-ink text-studio-page rounded-lg text-sm">
              Try again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export default function Page() {
  const [activeTab, setActiveTab] = useState<TabKey>('compose')
  const [channel, setChannel] = useState('Email')
  const [audience, setAudience] = useState('')
  const [loading, setLoading] = useState(false)
  const [pendingRefineCopy, setPendingRefineCopy] = useState<string | null>(null)
  const [pendingRefineScores, setPendingRefineScores] = useState<{ voice: number; messaging: number; strategy: number } | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [brandModalOpen, setBrandModalOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const sessionIdRef = useRef('')
  const { profile: brandProfile } = useBrandProfile()

  // No auto-open: the modal is only opened on demand via the AvatarDropdown's
  // "Configure brand" entry. Auto-opening locked users behind the Radix overlay
  // and the modal had no Skip path, so every other button on the page felt dead.

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(prev => !prev)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const sendToRefine = useCallback((copy: string, scores?: { voice: number; messaging: number; strategy: number }) => {
    setPendingRefineCopy(copy)
    setPendingRefineScores(scores ?? null)
    setActiveTab('refine')
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const consumePending = useCallback(() => {
    setPendingRefineCopy(null)
    setPendingRefineScores(null)
  }, [])

  // Reset scroll on any tab switch so the user always lands at the top of the new view.
  useEffect(() => {
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 })
  }, [activeTab])

  useEffect(() => {
    sessionIdRef.current = crypto.randomUUID()
    // First-visit detection: new visitors land on Learn so they can orient before composing.
    try {
      if (typeof window !== 'undefined' && !window.localStorage.getItem('vusion-visited')) {
        setActiveTab('learn')
        window.localStorage.setItem('vusion-visited', '1')
      }
    } catch {
      // localStorage may be unavailable (private mode, sandboxed iframe) — fall through to default tab
    }
  }, [])

  const handleCallAgent = useCallback(async (prompt: string, agentId: string): Promise<any> => {
    setLoading(true)
    try {
      const result = await callAIAgent(prompt, agentId, { session_id: sessionIdRef.current })
      if (result.success) {
        const agentResult = result.response?.result
        if (agentResult && typeof agentResult === 'object') return agentResult
        const text = extractText(result.response)
        return text ? { mode: 'chat', response: text, data: {} } : null
      }
      return null
    } catch {
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const onCompose = useCallback((prompt: string) => handleCallAgent(prompt, COMPOSE_AGENT_ID), [handleCallAgent])
  const onRefine  = useCallback((prompt: string) => handleCallAgent(prompt, REFINE_AGENT_ID),  [handleCallAgent])
  const onChat    = useCallback((prompt: string) => handleCallAgent(prompt, CHAT_AGENT_ID),    [handleCallAgent])

  const companyName = brandProfile?.companyName || 'TPG'

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-studio-page text-studio-ink font-sans">
        {/* Header */}
        <header>
          <div className="max-w-[1400px] mx-auto px-2 pt-4 pb-3 flex items-start justify-between gap-8">
            <div className="space-y-2">
              <a
                href="https://maia.prophet.com/agent-library"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-baseline gap-2.5 hover:opacity-70 transition-opacity"
                title="Open MAIA Agent Library in a new tab"
              >
                <span className="font-serif italic font-bold text-[20px] text-studio-ink leading-none">{companyName}</span>
                <span className="text-studio-mutedSoft text-lg font-light leading-none">|</span>
                <span className="font-sans font-bold tracking-tight text-[18px] text-studio-ink leading-none">MAIA</span>
              </a>
              <div className="flex items-center gap-2">
                <h1 className="font-sans font-bold text-[26px] text-studio-ink leading-tight">The Writing Studio</h1>
                <button
                  type="button"
                  onClick={() => setAboutOpen(true)}
                  aria-label="About this app"
                  title="About this app"
                  className="text-studio-mutedSoft hover:text-studio-ink transition-colors"
                >
                  <HelpCircle className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={() => setPaletteOpen(true)}
                title="Ask the brand assistant (⌘K)"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-studio-card text-studio-ink hover:bg-studio-border transition-colors text-sm"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Ask</span>
              </button>
              <AvatarDropdown initials="DD" onConfigureBrand={() => setBrandModalOpen(true)} />
            </div>
          </div>

          {/* Tab nav — small icons + pill active state */}
          <div className="max-w-[1400px] mx-auto px-2 pb-3">
            <div className="flex gap-1">
              {TABS.map(tab => {
                const isActive = activeTab === tab.key
                const Icon = tab.Icon
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors text-sm ${
                      isActive
                        ? 'bg-studio-card text-studio-ink font-medium'
                        : 'text-studio-mutedSoft hover:text-studio-ink hover:bg-studio-cardSubtle'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{tab.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="max-w-[1400px] mx-auto px-2 py-4">
          {activeTab === 'compose' && (
            <WriteSection channel={channel} audience={audience} onCallAgent={onCompose} loading={loading} onSendToRefine={sendToRefine} onChannelChange={setChannel} onAudienceChange={setAudience} />
          )}
          {activeTab === 'refine' && (
            <ReviewSection channel={channel} audience={audience} onCallAgent={onRefine} loading={loading} pendingCopy={pendingRefineCopy} pendingScores={pendingRefineScores} onPendingConsumed={consumePending} onChannelChange={setChannel} onAudienceChange={setAudience} />
          )}
          {activeTab === 'learn' && (
            <ExplainSection
              onSwitchToReview={() => setActiveTab('refine')}
              onSwitchToCompose={() => setActiveTab('compose')}
              onOpenPalette={() => setPaletteOpen(true)}
            />
          )}
        </main>

        {/* Command palette */}
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} onCallAgent={onChat} loading={loading} />

        {/* Brand onboarding modal — only mounted when actually open. Leaving Radix Dialog
            mounted with open={false} can still leak `pointer-events: none` onto <body> if its
            open→close transition races during initial render, which is what made every other
            button on the page feel dead. Conditional mount avoids the leak entirely. */}
        {brandModalOpen && (
          <BrandOnboardingModal open={brandModalOpen} onOpenChange={setBrandModalOpen} />
        )}

        {/* About this app: info modal explaining the architecture and HITL philosophy. */}
        <AboutModal open={aboutOpen} onOpenChange={setAboutOpen} />
      </div>
    </ErrorBoundary>
  )
}
