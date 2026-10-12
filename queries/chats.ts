import { auth } from "@clerk/nextjs/server"
import { and, desc, eq } from "drizzle-orm"

import { db } from "@/db"
import { chats } from "@/db/schema"

export type SidebarChat = {
  id: string
  name: string
  avatarSeed: string
  lastMessagePreview: string | null
  lastMessageAt: Date
}

export type ChatDetail = {
  id: string
  name: string
  avatarSeed: string
  bot: {
    id: string
    name: string
    avatar: string
    job: string
    instructions: string | null
  } | null
}

export async function getChatById(chatId: string): Promise<ChatDetail | null> {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated || !userId) {
    return null
  }

  const chat = await db.query.chats.findFirst({
    where: and(eq(chats.id, chatId), eq(chats.userId, userId)),
    with: {
      members: {
        with: {
          bot: true,
        },
      },
    },
  })

  if (!chat) {
    return null
  }

  // Ignore group chats for now: always fall back to the first bot.
  const firstBot = chat.members[0]?.bot
  return {
    id: chat.id,
    name: chat.name ?? firstBot?.name ?? "Untitled chat",
    avatarSeed: firstBot?.avatar ?? chat.id,
    bot: firstBot
      ? {
          id: firstBot.id,
          name: firstBot.name,
          avatar: firstBot.avatar,
          job: firstBot.job,
          instructions: firstBot.instructions,
        }
      : null,
  }
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
