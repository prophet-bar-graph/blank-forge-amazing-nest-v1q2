'use client'

import React, { useEffect, useRef, useState } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Loader2, Send, Sparkles } from 'lucide-react'
import { useBrandProfile } from '@/components/BrandProfileProvider'
import { emptyBrandProfile } from '@/lib/brandProfile'
import { buildBrandContextBlock } from '@/lib/brandContextPrompt'

type Turn = { role: 'user' | 'agent'; text: string }

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCallAgent: (prompt: string) => Promise<any>
  loading: boolean
}

function extractText(response: any, depth = 0): string {
  if (depth > 5) return typeof response === 'string' ? response : ''
  if (typeof response === 'string') {
    // Many of our responses arrive as JSON-stringified objects with a "response" field.
    const trimmed = response.trim()
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try { return extractText(JSON.parse(trimmed), depth + 1) } catch {}
    }
    return response
  }
  if (response && typeof response === 'object') {
    for (const k of ['response', 'text', 'message', 'content', 'answer', 'result']) {
      if (k in response && response[k] != null) {
        const t = extractText(response[k], depth + 1)
        if (t) return t
      }
    }
  }
  return ''
}

function cleanMarkdown(s: string): string {
  return s
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export default function CommandPalette({ open, onOpenChange, onCallAgent, loading }: CommandPaletteProps) {
  const [input, setInput] = useState('')
  const [history, setHistory] = useState<Turn[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const { profile } = useBrandProfile()
  const brand = profile || emptyBrandProfile()
  // Two framework-generic prompts + one brand-personalised one that references
  // the first portfolio pillar by name. Falls back gracefully if pillars is empty.
  const firstProduct = brand.portfolioPillars?.[0] || brand.companyName || 'our product'
  const examplePrompts = [
    'What two messaging themes should I lean into for a LinkedIn post?',
    'List our voice principles',
    `How do I make ${firstProduct}'s technical features sound human and relevant?`,
  ]

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
  }, [open])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [history, loading])

  const submit = async () => {
    const q = input.trim()
    if (!q || loading) return
    const prompt = `${buildBrandContextBlock(brand)}\nAnswer briefly and conversationally as the brand assistant. Question: ${q}`
    setHistory(prev => [...prev, { role: 'user', text: q }])
    setInput('')
    const response = await onCallAgent(prompt)
    const answer = cleanMarkdown(extractText(response)) || 'I could not produce a response. Try again.'
    setHistory(prev => [...prev, { role: 'agent', text: answer }])
  }

  const onKey: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-studio-page border-studio-border/80 max-w-2xl p-0 gap-0 overflow-hidden rounded-xl">
        <div className="flex items-center gap-3 px-5 py-4 pr-12 border-b border-studio-muted/30">
          <Sparkles className="h-4 w-4 text-studio-ink" />
          <p className="text-[11px] uppercase tracking-[0.2em] text-studio-muted/80">Ask the brand assistant</p>
        </div>

        {history.length > 0 && (
          <div ref={scrollRef} className="px-5 py-4 max-h-[420px] overflow-y-auto space-y-4 bg-white/40">
            {history.map((turn, i) => (
              <div key={i} className={turn.role === 'user' ? 'flex justify-end' : ''}>
                <div className={turn.role === 'user'
                  ? 'max-w-[85%] bg-studio-ink text-studio-page rounded-2xl rounded-br-sm px-4 py-2 text-sm leading-relaxed'
                  : 'max-w-full text-studio-ink text-[15px] leading-relaxed'
                }>
                  <p className="whitespace-pre-wrap">{turn.text}</p>
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-studio-muted/90 text-sm italic">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Thinking…</span>
              </div>
            )}
          </div>
        )}

        {history.length === 0 && (
          <div className="px-5 py-8 bg-white/40">
            <p className="text-lg italic text-studio-ink text-center mb-1">Ask anything about brand voice, messaging, or strategy.</p>
            <p className="text-[11px] uppercase tracking-[0.2em] text-studio-muted/85 text-center mt-4 mb-3">Try one of these</p>
            <div className="space-y-2 max-w-lg mx-auto">
              {examplePrompts.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => {
                    setInput(q)
                    inputRef.current?.focus()
                  }}
                  className="w-full text-left px-4 py-2.5 rounded-md border border-studio-border/70 bg-white/60 hover:bg-studio-border/30 hover:border-studio-muted/40 transition-colors text-[13px] text-studio-ink italic"
                >
                  &ldquo;{q}&rdquo;
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 px-4 py-3 border-t border-studio-muted/30 bg-studio-page">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            placeholder="Ask about brand voice, messaging, strategy…"
            disabled={loading}
            className="flex-1 bg-transparent border-0 text-[15px] text-studio-ink placeholder:text-studio-muted/65 focus:outline-none focus:ring-0 disabled:opacity-50"
          />
          <button
            onClick={submit}
            disabled={loading || !input.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-studio-ink text-studio-page text-[12px] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-studio-ink transition-colors"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            <span>{loading ? 'Asking' : 'Ask'}</span>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
