'use client'

import React from 'react'

// "Step 01 | Complete the Brief" — the small section dividers above the Brief
// card and the Generate button in Compose / Refine. Bold "Step 0N", italic label.

interface StepEyebrowProps {
  step: number
  label: string
  className?: string
}

export function StepEyebrow({ step, label, className = '' }: StepEyebrowProps) {
  const padded = String(step).padStart(2, '0')
  return (
    <div className={`flex items-baseline gap-2 mb-3 ${className}`}>
      <span className="font-sans font-bold text-sm text-studio-ink">Step {padded}</span>
      <span className="text-studio-mutedSoft">|</span>
      <span className="italic text-sm text-studio-mutedSoft">{label}</span>
    </div>
  )
}
