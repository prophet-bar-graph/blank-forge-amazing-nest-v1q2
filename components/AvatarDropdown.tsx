'use client'

import React from 'react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { Settings, ShieldCheck } from 'lucide-react'

interface AvatarDropdownProps {
  initials: string
  onConfigureBrand: () => void
  isAdmin?: boolean
  pendingRequestCount?: number
  onOpenAdminRequests?: () => void
}

export function AvatarDropdown({
  initials,
  onConfigureBrand,
  isAdmin = false,
  pendingRequestCount = 0,
  onOpenAdminRequests,
}: AvatarDropdownProps) {
  const showBadgeDot = isAdmin && pendingRequestCount > 0

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="relative h-9 w-9 rounded-full bg-studio-ink hover:bg-studio-muted transition-colors flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-studio-mutedSoft"
          title="Account & settings"
        >
          <span className="font-medium text-studio-page text-xs tracking-wide">{initials}</span>
          {showBadgeDot && (
            <span
              aria-label={`${pendingRequestCount} pending request${pendingRequestCount === 1 ? '' : 's'}`}
              className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-studio-scoreRed border border-studio-page"
            />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-studio-page border-studio-border min-w-[220px]">
        <DropdownMenuItem
          onClick={onConfigureBrand}
          className="text-sm text-studio-ink hover:bg-studio-card cursor-pointer gap-2"
        >
          <Settings className="h-3.5 w-3.5" />
          Configure brand
        </DropdownMenuItem>

        {isAdmin && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onOpenAdminRequests}
              className="text-sm text-studio-ink hover:bg-studio-card cursor-pointer gap-2 justify-between"
            >
              <span className="flex items-center gap-2">
                <ShieldCheck className="h-3.5 w-3.5" />
                Pending requests
              </span>
              {pendingRequestCount > 0 && (
                <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-studio-scoreRed text-white text-[11px] font-bold">
                  {pendingRequestCount}
                </span>
              )}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
