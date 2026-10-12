"use client"

import * as React from "react"
import { Monitor } from "lucide-react"

import { BotEditDialog, type EditableBot } from "@/components/bot-edit-dialog"
import { ChatAvatar } from "@/components/chat-avatar"
import { useChatPanel } from "@/components/chat-panel-context"
import { Button } from "@/components/ui/button"

export function ChatHeader({
  name,
  avatarSeed,
  bot,
  scrolled,
}: {
  name: string
  avatarSeed: string
  bot?: EditableBot | null
  scrolled?: boolean
}) {
  const [editOpen, setEditOpen] = React.useState(false)
  const { open, toggle } = useChatPanel()

  return (
    <header
      className={`sticky top-0 z-10 flex h-12 shrink-0 items-center justify-between border-b border-border bg-background px-4 transition-shadow ${scrolled ? "shadow-[0_12px_24px_-12px_rgb(0_0_0/0.3)]" : "shadow-none"}`}
    >
      {bot ? (
        <>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setEditOpen(true)}
            aria-label={`Edit ${name}`}
            aria-haspopup="dialog"
            className="-ml-2 flex min-w-0 items-center gap-2 px-2"
          >
            <ChatAvatar seed={avatarSeed} className="size-6 rounded-full" />
            <span className="truncate font-sans text-sm font-medium">
              {name}
            </span>
          </Button>
          <BotEditDialog
            bot={bot}
            open={editOpen}
            onOpenChange={setEditOpen}
          />
        </>
      ) : (
        <div className="flex min-w-0 items-center gap-2">
          <ChatAvatar seed={avatarSeed} className="size-6 rounded-full" />
          <h1 className="truncate font-sans text-sm font-medium">{name}</h1>
        </div>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Desktop view"
        aria-pressed={open}
        onClick={toggle}
        className={open ? "bg-muted" : undefined}
      >
        <Monitor />
      </Button>
    </header>
  )
}
