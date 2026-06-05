'use client'

import React from 'react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Settings } from 'lucide-react'

// Avatar in the top right of the header. Click opens a menu — currently
// just "Configure brand" but designed to host future per-user / per-session
// items (e.g., Sign out, Recent uploads, Help).

interface AvatarDropdownProps {
  initials: string                  // shown inside the circle (e.g., "DD")
  onConfigureBrand: () => void
}

export function AvatarDropdown({ initials, onConfigureBrand }: AvatarDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="h-9 w-9 rounded-full bg-studio-ink hover:bg-studio-muted transition-colors flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-studio-mutedSoft"
          title="Account & settings"
        >
          <span className="font-medium text-studio-page text-xs tracking-wide">{initials}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-studio-page border-studio-border">
        <DropdownMenuItem
          onClick={onConfigureBrand}
          className="text-sm text-studio-ink hover:bg-studio-card cursor-pointer gap-2"
        >
          <Settings className="h-3.5 w-3.5" />
          Configure brand
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
