'use client'

import React, { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, ShieldCheck, Inbox } from 'lucide-react'
import { useSSO } from '@/components/SSOGuard'
import { USER_EMAIL_HEADER } from '@/lib/userEmail'

interface UnlockRequest {
  _id: string
  requesterEmail: string
  reason: string
  status: string
  createdAt: string
}

interface AdminRequestsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onChange?: () => void   // called after approve/deny so caller can refresh badge count
}

function relativeTime(iso: string): string {
  const now = Date.now()
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diffMs = now - then
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`
  const days = Math.floor(hrs / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

export function AdminRequestsModal({ open, onOpenChange, onChange }: AdminRequestsModalProps) {
  const { email } = useSSO()
  const [items, setItems] = useState<UnlockRequest[]>([])
  const [loading, setLoading] = useState(false)

  const refresh = async () => {
    if (!email) return
    setLoading(true)
    try {
      const res = await fetch('/api/admin/unlock-requests', {
        headers: { [USER_EMAIL_HEADER]: email },
      })
      const json = await res.json()
      if (json?.success) setItems(json.data || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) refresh()
  }, [open, email])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl border-studio-muted/30 bg-studio-page max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl text-studio-ink flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Pending re-configuration requests
            <span className="text-base text-studio-muted font-normal">· {items.length}</span>
          </DialogTitle>
          <DialogDescription className="text-sm text-studio-muted/85 pt-1">
            Approve to grant the user a one-time edit window. Deny to reject with an optional reason.
          </DialogDescription>
        </DialogHeader>

        {loading && items.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-studio-muted" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Inbox className="h-8 w-8 text-studio-muted mb-3" />
            <p className="font-bold text-studio-ink">No pending requests</p>
            <p className="text-sm text-studio-muted mt-1">You're all caught up.</p>
          </div>
        ) : (
          <div className="space-y-3 pt-2">
            {items.map((req) => (
              <AdminRequestCard
                key={req._id}
                request={req}
                adminEmail={email!}
                onSettled={async () => {
                  await refresh()
                  onChange?.()
                }}
              />
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function AdminRequestCard({
  request,
  adminEmail,
  onSettled,
}: {
  request: UnlockRequest
  adminEmail: string
  onSettled: () => void
}) {
  const [denying, setDenying] = useState(false)
  const [denialReason, setDenialReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const approve = async () => {
    setSubmitting(true)
    try {
      await fetch(`/api/admin/unlock-requests/${request._id}/approve`, {
        method: 'POST',
        headers: { [USER_EMAIL_HEADER]: adminEmail },
      })
      onSettled()
    } finally {
      setSubmitting(false)
    }
  }

  const deny = async () => {
    setSubmitting(true)
    try {
      await fetch(`/api/admin/unlock-requests/${request._id}/deny`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [USER_EMAIL_HEADER]: adminEmail,
        },
        body: JSON.stringify({ denialReason: denialReason.trim() }),
      })
      onSettled()
    } finally {
      setSubmitting(false)
      setDenying(false)
      setDenialReason('')
    }
  }

  return (
    <div className="rounded-xl border border-studio-border bg-studio-cardSubtle p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex flex-col">
          <span className="font-bold text-sm text-studio-ink">{request.requesterEmail}</span>
          <span className="text-xs text-studio-muted">{relativeTime(request.createdAt)}</span>
        </div>
      </div>
      {request.reason ? (
        <p className="text-sm text-studio-ink leading-relaxed mb-3">{request.reason}</p>
      ) : (
        <p className="text-sm italic text-studio-muted mb-3">No reason provided.</p>
      )}

      {denying ? (
        <div className="flex flex-col gap-2">
          <Textarea
            value={denialReason}
            onChange={(e) => setDenialReason(e.target.value.slice(0, 500))}
            placeholder="Tell the requester why (optional)"
            rows={2}
            className="bg-white border-studio-muted/30 text-sm rounded-md resize-none"
          />
          <div className="flex items-center justify-end gap-2">
            <Button
              onClick={() => { setDenying(false); setDenialReason('') }}
              variant="ghost"
              disabled={submitting}
              className="text-studio-muted/85 hover:text-studio-ink h-9"
            >
              Cancel
            </Button>
            <Button
              onClick={deny}
              disabled={submitting}
              className="bg-studio-scoreRed/80 hover:bg-studio-scoreRed text-white h-9"
            >
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : null}
              Confirm deny
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => setDenying(true)}
            disabled={submitting}
            className="text-sm text-studio-scoreRed hover:text-studio-scoreRed/80 disabled:text-studio-mutedSoft"
          >
            Deny
          </button>
          <Button
            onClick={approve}
            disabled={submitting}
            className="bg-studio-ink hover:bg-studio-ink/90 text-studio-page h-9"
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : null}
            Approve
          </Button>
        </div>
      )}
    </div>
  )
}
