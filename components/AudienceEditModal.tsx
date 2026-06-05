'use client'

import React, { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'

// Small Dialog that lets the user edit the Audience value from either the
// Compose or Refine Brief. Both sections share the same `audience` state in
// Page, so saving here updates both surfaces.

interface AudienceEditModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  audience: string
  onSave: (audience: string) => void
}

export function AudienceEditModal({ open, onOpenChange, audience, onSave }: AudienceEditModalProps) {
  const [draft, setDraft] = useState(audience)

  useEffect(() => {
    if (open) setDraft(audience)
  }, [open, audience])

  const handleSave = () => {
    onSave(draft.trim())
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-studio-page border-studio-border">
        <DialogHeader>
          <DialogTitle className="text-xl text-studio-ink">Define the audience</DialogTitle>
          <DialogDescription className="text-sm text-studio-muted pt-1">
            Who do you want to talk to? E.g., &ldquo;Internal leaders,&rdquo; &ldquo;Mid-market retail buyers,&rdquo; &ldquo;Existing customers in the Northeast.&rdquo;
          </DialogDescription>
        </DialogHeader>

        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="e.g. Internal leaders"
          className="bg-studio-page border-studio-border min-h-[100px]"
          autoFocus
        />

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-studio-border text-studio-muted hover:bg-studio-card"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            className="bg-studio-ink text-studio-page hover:bg-studio-muted"
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
