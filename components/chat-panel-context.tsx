"use client"

import * as React from "react"

type ChatPanelContextValue = {
  open: boolean
  toggle: () => void
}

const ChatPanelContext =
  React.createContext<ChatPanelContextValue | null>(null)

export function ChatPanelProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [open, setOpen] = React.useState(false)
  const toggle = React.useCallback(() => {
    setOpen((value) => !value)
  }, [])
  const value = React.useMemo(() => ({ open, toggle }), [open, toggle])

  return (
    <ChatPanelContext.Provider value={value}>
      {children}
    </ChatPanelContext.Provider>
  )
}

export function useChatPanel() {
  const context = React.useContext(ChatPanelContext)
  if (!context) {
    throw new Error("useChatPanel must be used within ChatPanelProvider")
  }
  return context
}
