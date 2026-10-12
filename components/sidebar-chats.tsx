import { differenceInSeconds, formatDistanceToNow } from "date-fns"

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
} from "@/components/ui/sidebar"
import { getUserChats, type SidebarChat } from "@/queries/chats"
import { SidebarChatItem } from "@/components/sidebar-chat-item"

function formatChatTime(date: Date) {
  const seconds = differenceInSeconds(new Date(), date)
  if (seconds < 60) {
    const clamped = Math.max(seconds, 1)
    return `${clamped} second${clamped === 1 ? "" : "s"}`
  }
  return formatDistanceToNow(date, { addSuffix: false })
}

export async function SidebarChats({ chats }: { chats?: SidebarChat[] }) {
  const items = chats ?? (await getUserChats())

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Chats</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu className="gap-1">
          {items.map((chat) => (
            <SidebarChatItem
              key={chat.id}
              id={chat.id}
              name={chat.name}
              avatarSeed={chat.avatarSeed}
              lastMessagePreview={chat.lastMessagePreview}
              timeLabel={formatChatTime(chat.lastMessageAt)}
            />
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
