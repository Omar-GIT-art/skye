import { config } from "dotenv"

// drizzle-kit runs outside the Next.js runtime, so load `.env.local`
// explicitly (Next.js itself does this automatically for the app).
config({ path: ".env.local" })

import { defineConfig } from "drizzle-kit"

// Migrations must use the direct (non-pooled) connection. Pooled hostnames
// contain `-pooler` and can fail under PgBouncer transaction mode.
if (!process.env.DATABASE_URL_UNPOOLED) {
  throw new Error(
    "DATABASE_URL_UNPOOLED is not set in `.env.local`. " +
      "Copy the direct (non-pooled) connection string for your branch " +
      "from the Neon Console (Connect modal) or run `npx neon env pull`."
  )
}

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL_UNPOOLED,
  },
})
