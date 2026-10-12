"use server"

import { auth } from "@clerk/nextjs/server"

import { and, eq, inArray } from "drizzle-orm"

import { db } from "@/db"
import {
  bots,
  chatMembers,
  chats,
  deleteBotSchema,
  insertBotSchema,
  updateBotSchema,
} from "@/db/schema"
import { createBotSandbox, deleteBotSandbox } from "@/lib/daytona"
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

  // One Daytona sandbox per bot. Created before the DB rows so its id can
  // be stored on `bots.sandbox_id`. No exec/start/stop — just create.
  const sandboxId = await createBotSandbox({ botId, userId })

  try {
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
          sandboxId,
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
  } catch (err) {
    // Don't strand an orphan sandbox if the DB insert fails.
    try {
      await deleteBotSandbox(sandboxId)
    } catch {
      // Best effort — the original DB error is what matters.
    }
    throw err
  }
}

export async function updateBot(input: unknown) {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated || !userId) {
    throw new Error("Unauthorized")
  }

  const parsed = updateBotSchema.parse(input)

  const [bot] = await db
    .update(bots)
    .set({
      name: parsed.name,
      avatar: parsed.avatar,
      job: parsed.job,
      instructions:
        parsed.instructions && parsed.instructions.length > 0
          ? parsed.instructions
          : null,
    })
    .where(and(eq(bots.id, parsed.id), eq(bots.userId, userId)))
    .returning()

  if (!bot) {
    throw new Error("Bot not found.")
  }

  return { bot }
}

export async function deleteBot(input: unknown) {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated || !userId) {
    throw new Error("Unauthorized")
  }

  const parsed = deleteBotSchema.parse(input)

  const existing = await db.query.bots.findFirst({
    where: and(eq(bots.id, parsed.id), eq(bots.userId, userId)),
    with: { memberships: true },
  })

  if (!existing) {
    throw new Error("Bot not found.")
  }

  const chatIds = existing.memberships.map((m) => m.chatId)

  // Chats left with no bots once this one is gone are removed too, so
  // deleting a bot never strands an "Untitled chat" in the sidebar.
  // Group chats that still have other bots are left untouched.
  const memberships = chatIds.length
    ? await db.query.chatMembers.findMany({
        where: inArray(chatMembers.chatId, chatIds),
      })
    : []
  const memberCounts = new Map<string, number>()
  for (const m of memberships) {
    memberCounts.set(m.chatId, (memberCounts.get(m.chatId) ?? 0) + 1)
  }
  const orphanChatIds = chatIds.filter(
    (chatId) => (memberCounts.get(chatId) ?? 0) <= 1
  )
  const ownedChats = orphanChatIds.length
    ? await db.query.chats.findMany({
        where: inArray(chats.id, orphanChatIds),
      })
    : []
  const deletableChatIds = ownedChats
    .filter((chat) => chat.userId === userId)
    .map((chat) => chat.id)

  await db.batch([
    db
      .delete(bots)
      .where(and(eq(bots.id, parsed.id), eq(bots.userId, userId))),
    ...deletableChatIds.map((chatId) =>
      db
        .delete(chats)
        .where(and(eq(chats.id, chatId), eq(chats.userId, userId)))
    ),
  ])

  // Delete the bot's sandbox. Best effort after the DB rows are gone so a
  // Daytona outage never blocks bot deletion — just log and move on.
  if (existing.sandboxId) {
    try {
      await deleteBotSandbox(existing.sandboxId)
    } catch (err) {
      console.warn(
        `[daytona] failed to delete sandbox ${existing.sandboxId} for bot ${parsed.id}:`,
        err
      )
    }
  }

  return { deletedChatIds: deletableChatIds }
}
