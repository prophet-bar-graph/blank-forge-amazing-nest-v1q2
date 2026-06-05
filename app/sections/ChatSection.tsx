'use client'

import React, { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { HiOutlinePaperAirplane, HiOutlineArrowPath, HiOutlineChatBubbleLeftRight } from 'react-icons/hi2'
import { AiOutlineLoading3Quarters } from 'react-icons/ai'

interface ChatMessage {
  role: 'user' | 'agent'
  content: string
  error?: boolean
}

interface ChatSectionProps {
  onCallAgent: (prompt: string) => Promise<any>
  loading: boolean
}

function extractResponseText(response: any): string {
  if (typeof response === 'string') return response
  if (response?.response && typeof response.response === 'string') return response.response
  if (response?.text && typeof response.text === 'string') return response.text
  if (response?.message && typeof response.message === 'string') return response.message
  if (response?.data?.text) return response.data.text
  if (response?.content && typeof response.content === 'string') return response.content
  return ''
}

function renderMarkdown(text: string) {
  if (!text) return null
  return (
    <div className="space-y-1.5">
      {text.split('\n').map((line, i) => {
        if (line.startsWith('### ')) return <h4 key={i} className="font-semibold text-sm mt-2 mb-1">{line.slice(4)}</h4>
        if (line.startsWith('## ')) return <h3 key={i} className="font-semibold text-base mt-2 mb-1">{line.slice(3)}</h3>
        if (line.startsWith('# ')) return <h2 key={i} className="font-bold text-lg mt-3 mb-1">{line.slice(2)}</h2>
        if (line.startsWith('- ') || line.startsWith('* ')) return <li key={i} className="ml-4 list-disc text-sm">{formatInline(line.slice(2))}</li>
        if (/^\d+\.\s/.test(line)) return <li key={i} className="ml-4 list-decimal text-sm">{formatInline(line.replace(/^\d+\.\s/, ''))}</li>
        if (!line.trim()) return <div key={i} className="h-1" />
        return <p key={i} className="text-sm">{formatInline(line)}</p>
      })}
    </div>
  )
}

function formatInline(text: string) {
  const parts = text.split(/\*\*(.*?)\*\*/g)
  if (parts.length === 1) return text
  return parts.map((part, i) => i % 2 === 1 ? <strong key={i} className="font-semibold">{part}</strong> : part)
}

const WELCOME_MSG: ChatMessage = {
  role: 'agent',
  content: "Welcome! I'm your Brand Voice & Messaging assistant. Ask me anything about brand guidelines, voice, messaging, or strategy.",
}

export default function ChatSection({ onCallAgent, loading }: ChatSectionProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MSG])
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, loading])

  const handleSend = async () => {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: text }])

    const response = await onCallAgent(text)
    if (response) {
      const responseText = extractResponseText(response)
      setMessages(prev => [...prev, { role: 'agent', content: responseText || 'Received response.' }])
    } else {
      setMessages(prev => [...prev, { role: 'agent', content: 'Sorry, I encountered an error. Please try again.', error: true }])
    }
    inputRef.current?.focus()
  }

  const handleRetry = async (idx: number) => {
    const userMsgIdx = messages.slice(0, idx).reverse().findIndex(m => m.role === 'user')
    if (userMsgIdx === -1) return
    const actualIdx = idx - 1 - userMsgIdx
    const userMsg = messages[actualIdx]?.content
    if (!userMsg) return

    setMessages(prev => prev.filter((_, i) => i !== idx))

    const response = await onCallAgent(userMsg)
    if (response) {
      const responseText = extractResponseText(response)
      setMessages(prev => [...prev, { role: 'agent', content: responseText || 'Received response.' }])
    } else {
      setMessages(prev => [...prev, { role: 'agent', content: 'Sorry, I encountered an error. Please try again.', error: true }])
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-280px)] max-h-[600px]">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-2 py-4 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${msg.role === 'user' ? 'bg-[#EAB308] text-gray-900 rounded-br-md' : msg.error ? 'bg-red-50 border border-red-200 text-red-600 rounded-bl-md' : 'bg-[#f5f6f8] text-gray-800 border border-[#dddfe3] rounded-bl-md shadow-[0_1px_3px_rgba(221,223,227,0.5)]'}`}>
              {msg.role === 'agent' && !msg.error ? (
                renderMarkdown(msg.content)
              ) : (
                <p className="text-sm">{msg.content}</p>
              )}
              {msg.error && (
                <Button size="sm" variant="ghost" onClick={() => handleRetry(i)} className="mt-2 text-red-600 hover:bg-red-50 h-7 px-2 text-xs rounded-lg">
                  <HiOutlineArrowPath className="h-3 w-3 mr-1" />Retry
                </Button>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-[#f5f6f8] border border-[#dddfe3] rounded-2xl rounded-bl-md px-4 py-3 shadow-[0_1px_3px_rgba(221,223,227,0.5)]">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#EAB308] animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="h-2 w-2 rounded-full bg-[#EAB308] animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="h-2 w-2 rounded-full bg-[#EAB308] animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input Bar */}
      <div className="border-t border-[#dddfe3] pt-4 pb-2">
        <div className="flex gap-2">
          <Input ref={inputRef} placeholder="Ask about brand voice, messaging, strategy..." value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()} disabled={loading} className="bg-white border-[#dddfe3] text-gray-900 placeholder:text-gray-400 focus-visible:ring-[#EAB308] flex-1 rounded-lg" />
          <Button onClick={handleSend} disabled={loading || !input.trim()} className="bg-[#EAB308] text-gray-900 hover:bg-[#CA9A06] px-4 rounded-lg">
            {loading ? <AiOutlineLoading3Quarters className="h-4 w-4 animate-spin" /> : <HiOutlinePaperAirplane className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  )
}
