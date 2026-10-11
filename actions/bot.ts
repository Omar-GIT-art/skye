"use server"

import { auth } from "@clerk/nextjs/server"

import { db } from "@/db"
import { bots, chatMembers, chats, insertBotSchema } from "@/db/schema"
import { nanoid } from "nanoid"

export async function createBot(input: unknown) {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated || !userId) {
    throw new Error("Unauthorized")
  }

  const parsed = insertBotSchema.parse(input)

  // Pre-generate ids so the bot, its direct chat, and the membership row
  // can be inserted atomically with one neon-http batch (the driver has
  // no interactive-transaction support, but batch runs all-or-nothing).
  const botId = nanoid()
  const chatId = nanoid()

  const [[bot], [chat]] = await db.batch([
    db
      .insert(bots)
      .values({
        id: botId,
        name: parsed.name,
        avatar: parsed.avatar,
        job: parsed.job,
        instructions:
          parsed.instructions && parsed.instructions.length > 0
            ? parsed.instructions
            : null,
        userId,
      })
      .returning(),
    db
      .insert(chats)
      .values({
        id: chatId,
        userId,
        kind: "direct",
      })
      .returning(),
    db.insert(chatMembers).values({
      chatId,
      botId,
    }),
  ])

  return { bot, chat }
}
