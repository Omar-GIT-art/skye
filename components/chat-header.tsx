"use client"

import * as React from "react"
import { Monitor } from "lucide-react"

import { BotEditDialog, type EditableBot } from "@/components/bot-edit-dialog"
import { ChatAvatar } from "@/components/chat-avatar"
import { Button } from "@/components/ui/button"

export function ChatHeader({
  name,
  avatarSeed,
  bot,
}: {
  name: string
  avatarSeed: string
  bot?: EditableBot | null
}) {
  const [editOpen, setEditOpen] = React.useState(false)

  return (
    <header className="-m-4 flex h-12 items-center justify-between border-b border-border bg-background px-4">
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
      >
        <Monitor />
      </Button>
    </header>
  )
}
