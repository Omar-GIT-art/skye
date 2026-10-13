"use client"

import * as React from "react"
import { usePanelRef } from "react-resizable-panels"

import { useChatPanel } from "@/components/chat-panel-context"
import { ResizablePanel } from "@/components/ui/resizable"

// The side panel starts closed, so mount the chat panel at full width —
// correct by construction on first paint, no effect timing involved. When
// the side panel opens, the effect below yields to an exact 70/30 split;
// when it closes, back to 100%. Imperative resize instead of remounting:
// remounting would destroy the Chat below and drop in-flight generations.
// (A CSS `:only-child` guard in globals.css backstops this for the same
// closed state.)
export function ChatMainPanel({ children }: { children: React.ReactNode }) {
  const { open } = useChatPanel()
  const panelRef = usePanelRef()

  React.useEffect(() => {
    panelRef.current?.resize(open ? "70%" : "100%")
  }, [open, panelRef])

  return (
    <ResizablePanel
      id="chat-main"
      defaultSize="100%"
      minSize="30%"
      panelRef={panelRef}
      className="min-h-0"
    >
      {children}
    </ResizablePanel>
  )
}
