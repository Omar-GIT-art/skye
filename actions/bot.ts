"use server"

import { auth } from "@clerk/nextjs/server"

import { db } from "@/db"
import { bots, insertBotSchema } from "@/db/schema"

export async function createBot(input: unknown) {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated || !userId) {
    throw new Error("Unauthorized")
  }

  const parsed = insertBotSchema.parse(input)

  const [bot] = await db
    .insert(bots)
    .values({
      name: parsed.name,
      avatar: parsed.avatar,
      job: parsed.job,
      instructions:
        parsed.instructions && parsed.instructions.length > 0
          ? parsed.instructions
          : null,
      userId,
    })
    .returning()

  return bot
}
