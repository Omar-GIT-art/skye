import Link from "next/link"
import { differenceInSeconds, formatDistanceToNow } from "date-fns"

import { ChatAvatar } from "@/components/chat-avatar"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { getUserChats } from "@/queries/chats"

function formatChatTime(date: Date) {
  const seconds = differenceInSeconds(new Date(), date)
  if (seconds < 60) {
    const clamped = Math.max(seconds, 1)
    return `${clamped} second${clamped === 1 ? "" : "s"}`
  }
  return formatDistanceToNow(date, { addSuffix: false })
}

export async function SidebarChats() {
  const chats = await getUserChats()

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Chats</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {chats.map((chat) => (
            <SidebarMenuItem key={chat.id}>
              <SidebarMenuButton
                size="lg"
                tooltip={{ children: chat.name, sideOffset: 16 }}
                render={<Link href={`/chats/${chat.id}`} />}
              >
                <ChatAvatar
                  seed={chat.avatarSeed}
                  className="size-8 shrink-0 rounded-full"
                />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex w-full items-baseline justify-between gap-2">
                    <span className="truncate font-medium">{chat.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatChatTime(chat.lastMessageAt)}
                    </span>
                  </span>
                  {chat.lastMessagePreview ? (
                    <span className="truncate text-xs text-muted-foreground">
                      {chat.lastMessagePreview}
                    </span>
                  ) : null}
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
