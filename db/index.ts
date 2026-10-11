import { drizzle } from "drizzle-orm/neon-http"
import { neon } from "@neondatabase/serverless"

import * as schema from "./schema"

// Next.js loads `.env.local` into `process.env` automatically, so no
// dotenv import is needed here. Use the pooled connection for app traffic.
if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Run `npx neon env pull` (or add it to `.env.local`) to connect this app to your Neon branch."
  )
}

const sql = neon(process.env.DATABASE_URL)

export const db = drizzle({ client: sql, schema })
