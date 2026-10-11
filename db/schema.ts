import {
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { nanoid } from "nanoid"
import { z } from "zod"

export const bots = pgTable(
  "bots",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    avatar: text("avatar")
      .notNull()
      .$defaultFn(() => nanoid()),
    job: text("job").notNull(),
    instructions: text("instructions"),
    sandboxId: text("sandbox_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("bots_user_id_idx").on(table.userId)]
)

export const chatKindEnum = pgEnum("chat_kind", ["direct", "group"])

export const chats = pgTable(
  "chats",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    userId: text("user_id").notNull(),
    kind: chatKindEnum("kind").notNull().default("direct"),
    name: text("name"),
    lastMessagePreview: text("last_message_preview"),
    lastMessageAt: timestamp("last_message_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("chats_user_id_idx").on(table.userId)]
)

export const chatMembers = pgTable(
  "chat_members",
  {
    chatId: text("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    botId: text("bot_id")
      .notNull()
      .references(() => bots.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
  },
  (table) => [
    index("chat_members_bot_id_idx").on(table.botId),
    primaryKey({ columns: [table.chatId, table.botId] }),
  ]
)

export const botsRelations = relations(bots, ({ many }) => ({
  memberships: many(chatMembers),
}))

export const chatsRelations = relations(chats, ({ many }) => ({
  members: many(chatMembers),
}))

export const chatMembersRelations = relations(chatMembers, ({ one }) => ({
  chat: one(chats, {
    fields: [chatMembers.chatId],
    references: [chats.id],
  }),
  bot: one(bots, {
    fields: [chatMembers.botId],
    references: [bots.id],
  }),
}))

// NOTE: Previously built with drizzle-zod's createInsertSchema, but that
// produced a schema that threw `Invalid element at key "name": expected a
// Zod schema` at runtime under Next 16 (v3/v4 zod instances get mixed across
// the drizzle-zod boundary; the v4 shape check is lazy so it blows up on
// first parse, not on import). A plain zod object mirroring the table keeps
// one zod instance and behaves identically.
export const insertBotSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give your bot a name.")
    .max(80, "Keep the name under 80 characters."),
  avatar: z
    .string()
    .trim()
    .min(1, "Pick a face for your bot.")
    .max(256, "Avatar seed is too long."),
  job: z
    .string()
    .trim()
    .min(1, "Give your bot a job.")
    .max(120, "Keep the job under 120 characters."),
  instructions: z
    .string()
    .trim()
    .max(2000, "Keep instructions under 2000 characters.")
    .optional(),
})

export type InsertBotInput = z.infer<typeof insertBotSchema>
