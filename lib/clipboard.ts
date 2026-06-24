/**
 * Safe clipboard utility for iframe environments
 *
 * The native Clipboard API (navigator.clipboard) is blocked in iframes
 * due to permissions policy. This utility provides fallback methods.
 */

/**
 * Copy text to clipboard with iframe-safe fallback
 * @param text - Text to copy
 * @returns Promise<boolean> - true if copy succeeded
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  // Try modern Clipboard API first (works outside iframes)
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Clipboard API blocked (likely in iframe), try fallback
    }
  }

  // Fallback: Use deprecated execCommand (works in iframes)
  try {
    const textArea = document.createElement('textarea')
    textArea.value = text

    // Avoid scrolling to bottom
    textArea.style.top = '0'
    textArea.style.left = '0'
    textArea.style.position = 'fixed'
    textArea.style.opacity = '0'
    textArea.style.pointerEvents = 'none'

    document.body.appendChild(textArea)
    textArea.focus()
    textArea.select()

    const successful = document.execCommand('copy')
    document.body.removeChild(textArea)

    return successful
  } catch {
    console.error('Failed to copy to clipboard')
    return false
  }
}

/**
 * Copy rich text (formatted) to clipboard, with an iframe-safe fallback.
 * Writes both text/html (formatting preserved when pasted into email/docs) and
 * text/plain (clean fallback). Returns true if any copy method succeeded.
 * @param html - HTML representation (formatting)
 * @param plain - plain-text representation (fallback)
 */
export async function copyRichText(html: string, plain: string): Promise<boolean> {
  // Modern async Clipboard API — works outside iframes.
  if (
    navigator.clipboard &&
    typeof (navigator.clipboard as any).write === 'function' &&
    typeof ClipboardItem !== 'undefined'
  ) {
    try {
      const item = new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([plain], { type: 'text/plain' }),
      })
      await navigator.clipboard.write([item])
      return true
    } catch {
      // Blocked (likely in an iframe) — fall through to the selection fallback.
    }
  }

  // Fallback: select a hidden rich element and execCommand('copy'). The browser
  // serializes the selection as text/html, so formatting is preserved.
  try {
    const container = document.createElement('div')
    container.innerHTML = html
    container.setAttribute('contenteditable', 'true')
    container.style.position = 'fixed'
    container.style.top = '0'
    container.style.left = '0'
    container.style.opacity = '0'
    container.style.pointerEvents = 'none'
    document.body.appendChild(container)

    const range = document.createRange()
    range.selectNodeContents(container)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)

    const ok = document.execCommand('copy')
    sel?.removeAllRanges()
    document.body.removeChild(container)
    if (ok) return true
  } catch {
    // fall through to plain-text copy
  }

  return copyToClipboard(plain)
}

/**
 * React hook for clipboard copy with status
 */
export function useCopyToClipboard(): [
  (text: string) => Promise<void>,
  boolean
] {
  const [copied, setCopied] = React.useState(false)

  const copy = React.useCallback(async (text: string) => {
    const success = await copyToClipboard(text)
    if (success) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [])

  return [copy, copied]
}

// Import React for the hook
import * as React from 'react'
