"use client"

import * as React from "react"

import { ResizablePanel } from "@/components/ui/resizable"
import { useChatPanel } from "@/components/chat-panel-context"
import {
  SandboxDesktopDialog,
  SandboxDesktopPreview,
  useSandboxDesktop,
} from "@/components/sandbox-desktop"

export function ChatSidePanel() {
  const { open } = useChatPanel()
  const { closeFullscreen } = useSandboxDesktop()

  // The dialog lives inside the panel: closing the panel exits fullscreen
  // so the shared iframe always has its panel host to return to.
  React.useEffect(() => {
    if (!open) {
      closeFullscreen()
    }
  }, [open, closeFullscreen])

  if (!open) {
    return null
  }

  return (
    <ResizablePanel
      id="chat-side"
      defaultSize="30%"
      minSize="20%"
      className="min-h-0"
    >
      <div className="flex h-full min-h-0 flex-col">
        <SandboxDesktopPreview />
      </div>
      <SandboxDesktopDialog />
    </ResizablePanel>
  )
}
