"use client"

import { ResizableHandle } from "@/components/ui/resizable"
import { useChatPanel } from "@/components/chat-panel-context"

export function ChatPanelHandle() {
  const { open } = useChatPanel()

  if (!open) {
    return null
  }

  return <ResizableHandle withHandle />
}
