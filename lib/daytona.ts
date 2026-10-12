import { Daytona } from "@daytona/sdk"

/**
 * Shared Daytona client factory (Daytona Cloud).
 *
 * Reads DAYTONA_API_KEY / DAYTONA_API_URL / DAYTONA_TARGET from the
 * environment — see `.env.local`. Returns null when no API key is
 * configured so callers can fail with a clear error.
 */
export function getDaytonaClient(): Daytona | null {
  if (!process.env.DAYTONA_API_KEY) {
    return null
  }
  // Pass apiUrl/apiKey explicitly: the SDK also auto-loads `.env.local`
  // itself, and when the same var exists in both the file and
  // process.env it throws an "ambiguous endpoint" error.
  return new Daytona({
    apiKey: process.env.DAYTONA_API_KEY,
    apiUrl: process.env.DAYTONA_API_URL || "https://app.daytona.io/api",
    target: process.env.DAYTONA_TARGET,
  })
}

/**
 * Create one sandbox for a bot. We deliberately do nothing else with it
 * here — no exec/codeRun, no start/stop — just create and return the id
 * so it can be stored on `bots.sandbox_id`.
 */
export async function createBotSandbox(opts: {
  botId: string
  userId: string
}): Promise<string> {
  const daytona = getDaytonaClient()
  if (!daytona) {
    throw new Error(
      "DAYTONA_API_KEY is not set. Add it to `.env.local` to create bot sandboxes."
    )
  }

  const sandbox = await daytona.create({
    name: `bot-${opts.botId}`,
    labels: {
      "skye/bot-id": opts.botId,
      "skye/user-id": opts.userId,
      "skye/managed-by": "skye",
    },
  })

  return sandbox.id
}

/**
 * Best-effort sandbox deletion: resolves the sandbox by id and deletes it.
 * Swallows "not found" errors (already gone) but rethrows anything else so
 * callers can decide whether to fail or log-and-continue.
 */
export async function deleteBotSandbox(sandboxId: string): Promise<void> {
  const daytona = getDaytonaClient()
  if (!daytona) {
    throw new Error(
      "DAYTONA_API_KEY is not set. Cannot delete bot sandbox."
    )
  }
  const sandbox = await daytona.get(sandboxId)
  await sandbox.delete()
}
