'use client'

import React from 'react'
import { Check } from 'lucide-react'

// Sub-card cell used inside the Brief grid on Compose and Refine. A small
// white card with a bold label, optional helper italic, optional inline "hint"
// (e.g., "· optional"), and a green-checkmark in the top-right when filled.

interface SubCardProps {
  label: string
  helper?: string
  hint?: string
  filled?: boolean
  /**
   * Optional handler that, when provided alongside `filled`, surfaces an
   * "edit" affordance in the bottom-left of the card. Callsites with their
   * own inline edit button (e.g. AudienceSubCard) should NOT pass this prop —
   * the SubCard's affordance is intended for cards whose input is always
   * visible and just need a visual signal that the value has been entered.
   * The default behavior is to focus the first input/textarea inside the card.
   */
  onEdit?: () => void
  /**
   * When true, suppresses the "edit" affordance. Pass the same flag the
   * callsite uses to render the input element so the link disappears while
   * the user is actively typing — otherwise it sits redundantly below an
   * already-focused input.
   */
  editing?: boolean
  children: React.ReactNode
}

export function SubCard({ label, helper, hint, filled, onEdit, editing, children }: SubCardProps) {
  const showEditAffordance = filled && onEdit && !editing
  return (
    <div className={`bg-studio-page border border-studio-border rounded-lg p-4 relative ${showEditAffordance ? 'pb-7' : ''}`}>
      <div className="flex items-baseline gap-1.5 mb-1 pr-5">
        <h3 className="font-bold text-sm text-studio-ink">{label}</h3>
        {hint && <span className="text-xs italic text-studio-mutedSoft">{hint}</span>}
      </div>
      {filled && <Check className="h-3.5 w-3.5 text-studio-scoreGreen absolute top-4 right-4" />}
      {helper && <p className="text-xs italic text-studio-mutedSoft mb-3">{helper}</p>}
      {children}
      {showEditAffordance && (
        <button
          type="button"
          onClick={onEdit}
          className="absolute bottom-2 left-4 text-xs italic underline text-studio-muted hover:text-studio-ink"
        >
          edit
        </button>
      )}
    </div>
  )
}
