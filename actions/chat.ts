"use server"

import { auth as clerkAuth } from "@clerk/nextjs/server"
import { auth as triggerAuth } from "@trigger.dev/sdk"
import {
  chat,
  defaultStorage,
  type ChatStartSessionParams,
} from "@trigger.dev/sdk/ai"
import { and, eq } from "drizzle-orm"

import { db } from "@/db"
import { chats, chatSessions } from "@/db/schema"
import type { skyeChat } from "@/trigger/chat"

export type ChatSessionState = {
  publicAccessToken: string
  lastEventId?: string
}

async function requireChatOwner(chatId: string) {
  const { isAuthenticated, userId } = await clerkAuth()
  if (!isAuthenticated || !userId) {
    throw new Error("Unauthorized")
  }

  const chatRow = await db.query.chats.findFirst({
    where: and(eq(chats.id, chatId), eq(chats.userId, userId)),
  })
  if (!chatRow) {
    throw new Error("Chat not found.")
  }
}

const startBase = chat.createStartSessionAction<typeof skyeChat>("skye-chat")

// Creates the Session + first run, returns a session PAT.
// Idempotent on (env, chatId).
export async function startChatSession(
  params: ChatStartSessionParams<typeof skyeChat>
) {
  await requireChatOwner(params.chatId)
  return startBase(params)
}

// Pure mint. The transport calls this on 401/403 to refresh an expired token.
export async function mintChatAccessToken(chatId: string) {
  await requireChatOwner(chatId)
  return triggerAuth.createPublicToken({
    scopes: { read: { sessions: chatId }, write: { sessions: chatId } },
    expirationTime: "1h",
  })
}

const loadBase = chat.createLoadTranscriptAction(defaultStorage, {
  limit: 50,
})

// Reads history from the agent's transcript storage (scoped to chatId).
export async function loadChatTranscript(params: {
  chatId: string
  limit?: number
  before?: string
}) {
  await requireChatOwner(params.chatId)
  return loadBase(params)
}

// Live session reconnect metadata for the transport. Returns undefined when
// there is nothing to resume (brand-new chat), so the caller can skip
// hydrating `sessions` instead of failing the page.
//
// Only the PAT is restored — never a persisted `lastEventId`. The resume
// cursor must come from the transcript load (`useLoadTranscript` seeds it
// from `lastOutEventId`, i.e. just past the persisted history). A persisted
// cursor goes stale two ways, and the transport prefers it over the fresh
// transcript seed (it never moves an existing cursor backward):
// - saves fire-and-forget on every session change, so concurrent upserts
//   can land out of order and resurrect an older cursor -> the reload
//   replays already-persisted events -> duplicated messages;
// - a cursor saved mid-stream sits ahead of the persisted transcript, so a
//   reload resubscribes past un-persisted events -> lost messages.
export async function getChatSession(
  chatId: string
): Promise<ChatSessionState | undefined> {
  const { isAuthenticated, userId } = await clerkAuth()
  if (!isAuthenticated || !userId) {
    return undefined
  }

  const chatRow = await db.query.chats.findFirst({
    where: and(eq(chats.id, chatId), eq(chats.userId, userId)),
  })
  if (!chatRow) {
    return undefined
  }

  const sessionRow = await db.query.chatSessions.findFirst({
    where: eq(chatSessions.chatId, chatId),
  })
  if (!sessionRow) {
    return undefined
  }

  return {
    publicAccessToken: sessionRow.publicAccessToken,
  }
}

// Called from the transport's `onSessionChange`: upserts the reconnect
// metadata every time the cached session changes. Persists only the PAT —
// see `getChatSession` for why the live cursor is deliberately dropped.
export async function saveChatSession(
  chatId: string,
  session: ChatSessionState
) {
  await requireChatOwner(chatId)
  await db
    .insert(chatSessions)
    .values({
      chatId,
      publicAccessToken: session.publicAccessToken,
      lastEventId: null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: chatSessions.chatId,
      set: {
        publicAccessToken: session.publicAccessToken,
        lastEventId: null,
        updatedAt: new Date(),
      },
    })
}

// Called from `onSessionChange` when the transport reports the session as
// ended (null): drops the row so a reload doesn't retry a dead session.
export async function deleteChatSession(chatId: string) {
  await requireChatOwner(chatId)
  await db.delete(chatSessions).where(eq(chatSessions.chatId, chatId))
}
