'use client'

import React, { useState } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import { useChatHistory } from '@/components/ChatHistoryProvider'
import { Trash2, MessageSquare, PenSquare, Wand2 } from 'lucide-react'

function relativeTime(iso?: string): string {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diff = Date.now() - then
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d ago`
  return new Date(iso).toLocaleDateString()
}

interface ChatHistorySidebarProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelectChat: (id: string) => void
  onNewCompose: () => void
  onNewRefine: () => void
}

export function ChatHistorySidebar({ open, onOpenChange, onSelectChat, onNewCompose, onNewRefine }: ChatHistorySidebarProps) {
  const { chats, activeChatId, deleteChat } = useChatHistory()
  const [chatToDelete, setChatToDelete] = useState<{ id: string; title: string } | null>(null)

  return (
    <>
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="bg-studio-page border-studio-border text-studio-ink p-0 flex flex-col w-[300px] sm:max-w-[300px]"
      >
        <SheetHeader className="px-4 pt-5 pb-3 border-b border-studio-border">
          <SheetTitle className="font-sans font-bold text-base text-studio-ink text-left">Chat history</SheetTitle>
        </SheetHeader>

        <div className="px-3 py-3 space-y-1.5">
          <p className="text-xs font-bold uppercase tracking-wider text-studio-mutedSoft px-0.5">
            Start a new chat
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => { onNewCompose(); onOpenChange(false) }}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-studio-card hover:bg-studio-border text-sm text-studio-ink transition-colors"
            >
              <PenSquare className="h-4 w-4" />
              <span>Compose</span>
            </button>
            <button
              type="button"
              onClick={() => { onNewRefine(); onOpenChange(false) }}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-studio-card hover:bg-studio-border text-sm text-studio-ink transition-colors"
            >
              <Wand2 className="h-4 w-4" />
              <span>Refine</span>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-0.5">
          {chats.length === 0 && (
            <p className="px-3 py-6 text-sm text-studio-mutedSoft text-center">
              No chats yet. Generate copy to start one.
            </p>
          )}
          {chats.map((chat) => {
            const isActive = chat._id === activeChatId
            return (
              <div
                key={chat._id}
                className={`group flex items-center gap-2 rounded-md px-3 py-2 cursor-pointer transition-colors ${
                  isActive ? 'bg-studio-card' : 'hover:bg-studio-cardSubtle'
                }`}
                onClick={() => { onSelectChat(chat._id); onOpenChange(false) }}
              >
                <MessageSquare className="h-4 w-4 flex-shrink-0 text-studio-mutedSoft" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-studio-ink truncate">{chat.title}</p>
                  <p className="text-xs text-studio-mutedSoft">
                    {relativeTime(chat.updatedAt)}
                    {chat.versionCount > 0 ? ` · ${chat.versionCount} saved` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Delete chat"
                  onClick={(e) => { e.stopPropagation(); setChatToDelete({ id: chat._id, title: chat.title }) }}
                  className="opacity-0 group-hover:opacity-100 text-studio-mutedSoft hover:text-studio-scoreRed transition-opacity flex-shrink-0"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )
          })}
        </div>
      </SheetContent>
    </Sheet>

    {/* Confirm before deleting a chat (and all its versions). */}
    <AlertDialog open={!!chatToDelete} onOpenChange={(o) => { if (!o) setChatToDelete(null) }}>
      <AlertDialogContent className="bg-studio-page border-studio-border">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-studio-ink">Delete this chat?</AlertDialogTitle>
          <AlertDialogDescription className="text-studio-muted">
            “{chatToDelete?.title}” and all of its saved versions will be permanently
            removed. This can’t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="border-0 bg-transparent shadow-none text-studio-mutedSoft hover:bg-studio-cardSubtle hover:text-studio-ink">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (chatToDelete) void deleteChat(chatToDelete.id)
              setChatToDelete(null)
            }}
            className="bg-studio-scoreRed/90 hover:bg-studio-scoreRed text-studio-page"
          >
            Delete chat
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  )
}
