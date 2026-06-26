'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { callAIAgent, extractText } from '@/lib/aiAgent'

import WriteSection from './sections/WriteSection'
import ReviewSection from './sections/ReviewSection'
import ExplainSection from './sections/ExplainSection'
import CommandPalette from '@/components/CommandPalette'
import { BrandOnboardingModal } from '@/components/BrandOnboardingModal'
import { useBrandProfile } from '@/components/BrandProfileProvider'
import { useChatHistory } from '@/components/ChatHistoryProvider'
import { ChatHistorySidebar } from '@/components/ChatHistorySidebar'
import { VersionHistory } from '@/components/VersionHistory'
import { AvatarDropdown } from '@/components/AvatarDropdown'
import { AboutModal } from '@/components/AboutModal'
import { AdminRequestsModal } from '@/components/AdminRequestsModal'
import { useSSO } from '@/components/SSOGuard'
import { USER_EMAIL_HEADER } from '@/lib/userEmail'
import { BookOpen, PenSquare, Wand2, Sparkles, HelpCircle, Menu, Plus } from 'lucide-react'
import { getInitials } from '@/lib/userInitials'

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
  const [pendingReopen, setPendingReopen] = useState<{ copy: string; scores: { voice: number; messaging: number; strategy: number } | null; changes: { text: string; lens: string }[]; overallNote: string } | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [brandModalOpen, setBrandModalOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [adminModalOpen, setAdminModalOpen] = useState(false)
  const [pendingRequestCount, setPendingRequestCount] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  // Bumped on "New chat" to remount (reset) the Compose/Refine sections. Keyed
  // separately from activeChatId because (a) createChat sets activeChatId
  // mid-generation — keying Compose on that would wipe freshly generated copy,
  // and (b) "New refine chat" must remount even when no chat is active.
  const [composeNonce, setComposeNonce] = useState(0)
  const [refineNonce, setRefineNonce] = useState(0)
  const sessionIdRef = useRef('')
  const { profile: brandProfile, loading: brandLoading } = useBrandProfile()
  const { loadChat, loadVersion, deleteVersion, startNewChat } = useChatHistory()
  const { email, isAdmin, givenName, familyName } = useSSO()

  // Poll the pending-request count every 30s while admin is signed in.
  useEffect(() => {
    if (!isAdmin || !email) {
      setPendingRequestCount(0)
      return
    }
    let cancelled = false
    const fetchCount = async () => {
      try {
        const res = await fetch('/api/admin/unlock-requests?status=pending', {
          headers: { [USER_EMAIL_HEADER]: email },
        })
        if (cancelled) return
        const json = await res.json()
        if (json?.success) setPendingRequestCount(json.data?.length ?? 0)
      } catch {
        // network blip — leave count as-is
      }
    }
    fetchCount()
    const t = setInterval(fetchCount, 30_000)
    return () => { cancelled = true; clearInterval(t) }
  }, [isAdmin, email])

  // Auto-open the onboarding modal on first visit (no saved profile). The
  // modal has a close button and a Skip path, so the user can dismiss it and
  // come back via the AvatarDropdown's "Configure brand" entry. Fires once.
  const autoOpenedRef = useRef(false)
  useEffect(() => {
    if (autoOpenedRef.current) return
    if (brandLoading) return
    if (!brandProfile) {
      autoOpenedRef.current = true
      setBrandModalOpen(true)
    }
  }, [brandLoading, brandProfile])

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

  const consumeReopen = useCallback(() => setPendingReopen(null), [])

  // Open a saved chat: load it and hydrate Refine's result view with the latest
  // saved copy + scores + detail, then switch to the Refine tab.
  const handleSelectChat = useCallback(async (id: string) => {
    const loaded = await loadChat(id)
    if (loaded) {
      setPendingRefineCopy(null)
      setPendingRefineScores(null)
      setPendingReopen(loaded)
    }
    setActiveTab('refine')
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [loadChat])

  // Jump to a specific saved version from the edit-history timeline: load it
  // into Refine and switch to the Refine tab.
  const handleSelectVersion = useCallback((index: number) => {
    const loaded = loadVersion(index)
    if (loaded) {
      setPendingRefineCopy(null)
      setPendingRefineScores(null)
      setPendingReopen(loaded)
    }
    setActiveTab('refine')
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [loadVersion])

  // New chat from Compose: clear the active chat + pending copy, reset Compose.
  const handleNewCompose = useCallback(() => {
    startNewChat()
    setPendingRefineCopy(null)
    setPendingRefineScores(null)
    setPendingReopen(null)
    setComposeNonce(n => n + 1)
    setActiveTab('compose')
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [startNewChat])

  // New chat from Refine: clear the active chat + pending copy and stay on
  // Refine with a fresh empty paste state (bump refineNonce to force a remount
  // even when no chat was active).
  const handleNewRefine = useCallback(() => {
    startNewChat()
    setPendingRefineCopy(null)
    setPendingRefineScores(null)
    setPendingReopen(null)
    setRefineNonce(n => n + 1)
    setActiveTab('refine')
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [startNewChat])

  // Delete a version from the edit-history timeline. Loads the new current
  // version into Refine, or resets to a fresh Refine if the chat was emptied.
  const handleDeleteVersion = useCallback(async (index: number) => {
    const next = await deleteVersion(index)
    if (next) {
      setPendingRefineCopy(null)
      setPendingRefineScores(null)
      setPendingReopen(next)
    } else {
      handleNewRefine()
    }
  }, [deleteVersion, handleNewRefine])

  // Tab switch. Going Refine → Compose means the user wants to start a new copy,
  // so it resets to a fresh chat (same as "New chat"). Other switches just navigate.
  const handleTabClick = useCallback((key: TabKey) => {
    if (key === 'compose' && activeTab === 'refine') {
      handleNewCompose()
      return
    }
    // Clear Compose form state (audience & channel) when leaving Compose tab
    if (activeTab === 'compose' && key !== 'compose') {
      setAudience('')
      setChannel('Email')
    }
    setActiveTab(key)
  }, [activeTab, handleNewCompose])

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

  // `quiet` skips the global loading toggle — used for background re-scoring so
  // the document view isn't replaced by the loading skeleton.
  const handleCallAgent = useCallback(async (prompt: string, agentId: string, quiet = false): Promise<any> => {
    if (!quiet) setLoading(true)
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
      if (!quiet) setLoading(false)
    }
  }, [])

  const onCompose = useCallback((prompt: string) => handleCallAgent(prompt, COMPOSE_AGENT_ID), [handleCallAgent])
  const onRefine  = useCallback((prompt: string) => handleCallAgent(prompt, REFINE_AGENT_ID),  [handleCallAgent])
  const onChat    = useCallback((prompt: string) => handleCallAgent(prompt, CHAT_AGENT_ID),    [handleCallAgent])
  // Quiet refine-agent call for re-scoring an edited copy (reads the returned
  // `scorecard`, i.e. the score of the supplied copy, without a visible reload).
  const onScore   = useCallback((prompt: string) => handleCallAgent(prompt, REFINE_AGENT_ID, true), [handleCallAgent])

  const companyName = brandProfile?.companyName || '[Brand]'

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-studio-page text-studio-ink font-sans">
        {/* Header */}
        <header>
          <div className="max-w-[1400px] mx-auto px-2 pt-4 pb-3 flex items-start justify-between gap-8">
            <div className="space-y-2">
              {/* Brand line — hamburger inline with the company name / MAIA. */}
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setSidebarOpen(true)}
                  aria-label="Open chat history"
                  title="Chat history"
                  className="-ml-1 p-1 rounded-md text-studio-mutedSoft hover:text-studio-ink hover:bg-studio-cardSubtle transition-colors"
                >
                  <Menu className="h-5 w-5" />
                </button>
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
              </div>
              {/* Title row — aligned to the container left edge (with the tabs below). */}
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
              <AvatarDropdown
                initials={getInitials(givenName, familyName, isAdmin)}
                onConfigureBrand={() => setBrandModalOpen(true)}
                isAdmin={isAdmin}
                pendingRequestCount={pendingRequestCount}
                onOpenAdminRequests={() => setAdminModalOpen(true)}
              />
            </div>
          </div>

          {/* Tab nav — small icons + pill active state. A contextual "New chat"
              button sits on the right for the Compose/Refine tabs. */}
          <div className="max-w-[1400px] mx-auto px-2 pb-3">
            <div className="flex items-center gap-1">
              {TABS.map(tab => {
                const isActive = activeTab === tab.key
                const Icon = tab.Icon
                return (
                  <button
                    key={tab.key}
                    onClick={() => handleTabClick(tab.key)}
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
              {(activeTab === 'compose' || activeTab === 'refine') && (
                <button
                  onClick={activeTab === 'compose' ? handleNewCompose : handleNewRefine}
                  title={activeTab === 'compose' ? 'Start a new compose chat' : 'Start a new refine chat'}
                  className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-studio-mutedSoft hover:text-studio-ink hover:bg-studio-cardSubtle transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  <span>New chat</span>
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="max-w-[1400px] mx-auto px-2 py-4">
          {activeTab === 'compose' && (
            <WriteSection key={`compose-${composeNonce}`} channel={channel} audience={audience} onCallAgent={onCompose} loading={loading} onSendToRefine={sendToRefine} onChannelChange={setChannel} onAudienceChange={setAudience} />
          )}
          {activeTab === 'refine' && (
            <ReviewSection key={`refine-${refineNonce}`} channel={channel} audience={audience} onCallAgent={onRefine} onScore={onScore} loading={loading} pendingCopy={pendingRefineCopy} pendingScores={pendingRefineScores} onPendingConsumed={consumePending} reopenedVersion={pendingReopen} onReopenConsumed={consumeReopen} onChannelChange={setChannel} onAudienceChange={setAudience} />
          )}
          {activeTab === 'learn' && (
            <ExplainSection
              onSwitchToReview={() => setActiveTab('refine')}
              onSwitchToCompose={() => setActiveTab('compose')}
              onOpenPalette={() => setPaletteOpen(true)}
            />
          )}
        </main>

        {/* Edit history timeline — saved versions of the active chat */}
        {activeTab === 'refine' && <VersionHistory onSelectVersion={handleSelectVersion} onDeleteVersion={handleDeleteVersion} />}

        {/* Chat history sidebar */}
        <ChatHistorySidebar
          open={sidebarOpen}
          onOpenChange={setSidebarOpen}
          onSelectChat={handleSelectChat}
          onNewCompose={handleNewCompose}
          onNewRefine={handleNewRefine}
        />

        {/* Command palette */}
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} onCallAgent={onChat} loading={loading} />

        {/* Brand onboarding modal — only mounted when actually open. Leaving Radix Dialog
            mounted with open={false} can still leak `pointer-events: none` onto <body> if its
            open→close transition races during initial render, which is what made every other
            button on the page feel dead. Conditional mount avoids the leak entirely. */}
        {brandModalOpen && (
          <BrandOnboardingModal open={brandModalOpen} onOpenChange={setBrandModalOpen} dismissable={!!brandProfile} />
        )}

        {/* About this app: info modal explaining the architecture and HITL philosophy. */}
        <AboutModal open={aboutOpen} onOpenChange={setAboutOpen} />

        {/* Admin: unlock-request review modal. Only admins ever open this; non-admins never
            have a path to set adminModalOpen=true, but the conditional mount makes it explicit. */}
        {adminModalOpen && (
          <AdminRequestsModal
            open={adminModalOpen}
            onOpenChange={setAdminModalOpen}
            onChange={async () => {
              if (!email) return
              const res = await fetch('/api/admin/unlock-requests?status=pending', {
                headers: { [USER_EMAIL_HEADER]: email },
              })
              const json = await res.json()
              if (json?.success) setPendingRequestCount(json.data?.length ?? 0)
            }}
          />
        )}
      </div>
    </ErrorBoundary>
  )
}
