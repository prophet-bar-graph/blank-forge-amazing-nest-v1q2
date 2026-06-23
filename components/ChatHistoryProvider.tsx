'use client'

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  type ChatHistory,
  type ChatListItem,
  type ChatBrief,
  type ChatVariation,
  type ChatVersion,
  type WorkingCopy,
  listChats,
  createChat as apiCreateChat,
  getChat as apiGetChat,
  saveVersion as apiSaveVersion,
  renameChat as apiRenameChat,
  deleteChat as apiDeleteChat,
  deleteVersion as apiDeleteVersion,
  latestWorkingCopy,
  workingCopyAt,
  deriveTitle,
} from '@/lib/chatHistory'

interface ChatHistoryContextValue {
  chats: ChatListItem[]
  activeChatId: string | null
  activeChat: ChatHistory | null
  // Index into activeChat.versions currently loaded in Refine (null = none).
  activeVersionIndex: number | null
  loading: boolean
  refreshList: () => Promise<void>
  // Create a chat from a Compose generation; returns the new id (or null on failure).
  createChat: (brief: ChatBrief, channel: string, audience: string, variations: ChatVariation[]) => Promise<string | null>
  // Append a version to the active chat (lazily creating one if none is active).
  // When the loaded version is not the latest, saving truncates the newer
  // ("future") versions — the caller should confirm with the user first.
  // `seed` is written first when a chat is lazily created (paste-started chats
  // capture the user's original draft as version 0).
  saveVersion: (version: ChatVersion, seed?: ChatVersion) => Promise<boolean>
  renameChat: (title: string) => Promise<void>
  deleteChat: (id: string) => Promise<void>
  // Load a chat and return the copy/scores/detail to seed Refine with (latest version).
  loadChat: (id: string) => Promise<WorkingCopy | null>
  // Load a specific version of the active chat by index.
  loadVersion: (index: number) => WorkingCopy | null
  // Delete a version by index; returns the new current version to load (or null
  // if the chat had only that version and was removed entirely).
  deleteVersion: (index: number) => Promise<WorkingCopy | null>
  startNewChat: () => void
}

const ChatHistoryContext = createContext<ChatHistoryContextValue | null>(null)

export function ChatHistoryProvider({ children }: { children: React.ReactNode }) {
  const [chats, setChats] = useState<ChatListItem[]>([])
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const [activeChat, setActiveChat] = useState<ChatHistory | null>(null)
  const [activeVersionIndex, setActiveVersionIndex] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshList = useCallback(async () => {
    setLoading(true)
    try {
      setChats(await listChats())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refreshList() }, [refreshList])

  const createChat = useCallback(
    async (brief: ChatBrief, channel: string, audience: string, variations: ChatVariation[]): Promise<string | null> => {
      const created = await apiCreateChat({
        title: deriveTitle(brief.contentObjective, variations),
        channel,
        audience,
        brief,
        variations,
      })
      if (!created) return null
      setActiveChatId(created._id)
      setActiveChat(created)
      setActiveVersionIndex(null)
      await refreshList()
      return created._id
    },
    [refreshList]
  )

  const saveVersion = useCallback(
    async (version: ChatVersion, seed?: ChatVersion): Promise<boolean> => {
      // No active chat (e.g. the user pasted copy straight into Refine):
      // lazily create one titled from the copy so the version has a home.
      let id = activeChatId
      const versions = activeChat?.versions ?? []
      if (!id) {
        const created = await apiCreateChat({
          // Title from the seed (the user's original draft) when present.
          title: deriveTitle('', [{ copy: (seed ?? version).copy }]),
          channel: '',
          audience: '',
          brief: { contentObjective: '', supportingMessages: '', callToAction: '', mandatories: [], tone: 5 },
          variations: [],
        })
        if (!created) return false
        id = created._id
        setActiveChatId(id)
        setActiveChat(created)
        // Capture the user's original pasted draft as version 0.
        if (seed) {
          const seeded = await apiSaveVersion(id, seed)
          if (seeded) setActiveChat(seeded)
        }
      }
      // If the loaded version isn't the latest, saving truncates the newer ones
      // (history is linear — saving from the past overwrites the future).
      const truncateAfter =
        activeVersionIndex != null && activeVersionIndex < versions.length - 1
          ? activeVersionIndex
          : undefined
      const updated = await apiSaveVersion(id, version, truncateAfter)
      if (!updated) return false
      setActiveChat(updated)
      setActiveVersionIndex((updated.versions?.length ?? 1) - 1)
      await refreshList()
      return true
    },
    [activeChatId, activeChat, activeVersionIndex, refreshList]
  )

  const renameChat = useCallback(
    async (title: string) => {
      if (!activeChatId) return
      const updated = await apiRenameChat(activeChatId, title)
      if (updated) setActiveChat(updated)
      await refreshList()
    },
    [activeChatId, refreshList]
  )

  const deleteChat = useCallback(
    async (id: string) => {
      const ok = await apiDeleteChat(id)
      if (ok && id === activeChatId) {
        setActiveChatId(null)
        setActiveChat(null)
        setActiveVersionIndex(null)
      }
      await refreshList()
    },
    [activeChatId, refreshList]
  )

  const loadChat = useCallback(async (id: string) => {
    const chat = await apiGetChat(id)
    if (!chat) return null
    setActiveChatId(chat._id)
    setActiveChat(chat)
    setActiveVersionIndex(chat.versions?.length ? chat.versions.length - 1 : null)
    return latestWorkingCopy(chat)
  }, [])

  const loadVersion = useCallback((index: number): WorkingCopy | null => {
    const v = activeChat?.versions?.[index]
    if (!v) return null
    setActiveVersionIndex(index)
    return {
      copy: v.copy,
      scores: v.scores ?? null,
      changes: Array.isArray(v.changes) ? v.changes : [],
      overallNote: typeof v.overallNote === 'string' ? v.overallNote : '',
    }
  }, [activeChat])

  const deleteVersion = useCallback(
    async (index: number): Promise<WorkingCopy | null> => {
      if (!activeChatId) return null
      const updated = await apiDeleteVersion(activeChatId, index)
      if (!updated) return null
      // Last version removed → drop the (now empty) chat entirely.
      if (!updated.versions?.length) {
        await apiDeleteChat(activeChatId)
        setActiveChatId(null)
        setActiveChat(null)
        setActiveVersionIndex(null)
        await refreshList()
        return null
      }
      setActiveChat(updated)
      const newIndex = Math.min(index, updated.versions.length - 1)
      setActiveVersionIndex(newIndex)
      await refreshList()
      return workingCopyAt(updated, newIndex)
    },
    [activeChatId, refreshList]
  )

  const startNewChat = useCallback(() => {
    setActiveChatId(null)
    setActiveChat(null)
    setActiveVersionIndex(null)
  }, [])

  const value = useMemo(
    () => ({
      chats,
      activeChatId,
      activeChat,
      activeVersionIndex,
      loading,
      refreshList,
      createChat,
      saveVersion,
      renameChat,
      deleteChat,
      loadChat,
      loadVersion,
      deleteVersion,
      startNewChat,
    }),
    [chats, activeChatId, activeChat, activeVersionIndex, loading, refreshList, createChat, saveVersion, renameChat, deleteChat, loadChat, loadVersion, deleteVersion, startNewChat]
  )

  return <ChatHistoryContext.Provider value={value}>{children}</ChatHistoryContext.Provider>
}

// Permissive default when called outside the provider (matches BrandProfileProvider's
// NO_PROVIDER_DEFAULT pattern so a pre-mount render tick doesn't crash the tree).
const NO_PROVIDER_DEFAULT: ChatHistoryContextValue = {
  chats: [],
  activeChatId: null,
  activeChat: null,
  activeVersionIndex: null,
  loading: false,
  refreshList: async () => {},
  createChat: async () => null,
  saveVersion: async () => false,
  renameChat: async () => {},
  deleteChat: async () => {},
  loadChat: async () => null,
  loadVersion: () => null,
  deleteVersion: async () => null,
  startNewChat: () => {},
}

export function useChatHistory(): ChatHistoryContextValue {
  const ctx = useContext(ChatHistoryContext)
  return ctx ?? NO_PROVIDER_DEFAULT
}
