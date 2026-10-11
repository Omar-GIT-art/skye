import { auth } from "@clerk/nextjs/server"
import { desc, eq } from "drizzle-orm"

import { db } from "@/db"
import { chats } from "@/db/schema"

export type SidebarChat = {
  id: string
  name: string
  avatarSeed: string
  lastMessagePreview: string | null
  lastMessageAt: Date
}

export async function getUserChats(): Promise<SidebarChat[]> {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated || !userId) {
    return []
  }

  const rows = await db.query.chats.findMany({
    where: eq(chats.userId, userId),
    orderBy: [desc(chats.lastMessageAt)],
    with: {
      members: {
        with: {
          bot: true,
        },
      },
    },
  })

  return rows.map((chat) => {
    // Ignore group-chat naming for now: always fall back to the first bot.
    const firstBot = chat.members[0]?.bot
    return {
      id: chat.id,
      name: chat.name ?? firstBot?.name ?? "Untitled chat",
      avatarSeed: firstBot?.avatar ?? chat.id,
      lastMessagePreview: chat.lastMessagePreview,
      lastMessageAt: chat.lastMessageAt,
    }
  })
}
