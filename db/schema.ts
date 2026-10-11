import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core"
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
