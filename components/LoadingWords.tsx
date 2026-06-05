'use client'

import React, { useEffect, useState } from 'react'

interface LoadingWordsProps {
  words: string[]
  /** ms between word changes. Default 4000ms — deliberate pace, matches Proactive Partner voice. */
  interval?: number
  /** Tailwind classes applied to the wrapping span. */
  className?: string
}

/**
 * Cycles a single italic-serif word with trailing ellipsis while a response generates.
 * Vusion-branded equivalent of Claude Code's "Elucidating… Refining…" status text.
 */
export default function LoadingWords({ words, interval = 4000, className = 'italic text-studio-muted' }: LoadingWordsProps) {
  const [index, setIndex] = useState(0)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    if (words.length === 0) return
    const tick = setInterval(() => {
      // Fade out → swap word → fade in
      setVisible(false)
      setTimeout(() => {
        setIndex(prev => (prev + 1) % words.length)
        setVisible(true)
      }, 180)
    }, interval)
    return () => clearInterval(tick)
  }, [words.length, interval])

  if (words.length === 0) return null

  return (
    <span className={`${className} transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}>
      {words[index]}&hellip;
    </span>
  )
}
