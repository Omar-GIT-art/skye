"use client"

import * as React from "react"
import Link from "next/link"
import { useParams } from "next/navigation"

import { ChatAvatar } from "@/components/chat-avatar"
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"

export function SidebarChatItem({
  id,
  name,
  avatarSeed,
  lastMessagePreview,
  timeLabel,
}: {
  id: string
  name: string
  avatarSeed: string
  lastMessagePreview: string | null
  timeLabel: string
}) {
  const params = useParams<{ chatId?: string | string[] }>()
  const activeChatId = Array.isArray(params?.chatId)
    ? params.chatId[0]
    : params?.chatId
  const isActive = activeChatId === id
  const linkRef = React.useRef<HTMLAnchorElement>(null)

  React.useEffect(() => {
    if (isActive) {
      linkRef.current?.scrollIntoView({ block: "nearest" })
    }
  }, [isActive])

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        size="lg"
        isActive={isActive}
        tooltip={{ children: name, sideOffset: 16 }}
        render={<Link ref={linkRef} href={`/chats/${id}`} />}
      >
        <ChatAvatar seed={avatarSeed} className="size-8 shrink-0 rounded-full" />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex w-full items-baseline justify-between gap-2">
            <span className="truncate font-medium">{name}</span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {timeLabel}
            </span>
          </span>
          {lastMessagePreview ? (
            <span className="truncate text-xs text-muted-foreground">
              {lastMessagePreview}
            </span>
          ) : null}
        </span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}
