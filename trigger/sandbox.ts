import { Daytona, type Sandbox } from "@daytona/sdk"

/**
 * Worker-side Daytona access for chat-agent tools. Self-contained inside
 * `trigger/` so the task bundle stays hermetic (no `@/` alias needed).
 *
 * The client is constructed with explicit credentials: the SDK also
 * auto-loads `.env.local` itself, and when the same variable exists in
 * both the file and `process.env` it throws an "ambiguous endpoint" error.
 */
export function getWorkerDaytona(): Daytona {
  const apiKey = process.env.DAYTONA_API_KEY
  if (!apiKey) {
    throw new Error(
      "DAYTONA_API_KEY is not set in the Trigger.dev worker environment."
    )
  }
  return new Daytona({
    apiKey,
    apiUrl: process.env.DAYTONA_API_URL || "https://app.daytona.io/api",
    target: process.env.DAYTONA_TARGET,
  })
}

export function requireSandboxId(sandboxId: string | null | undefined): string {
  if (!sandboxId) {
    throw new Error(
      "This chat has no sandbox linked to it, so sandbox tools cannot run."
    )
  }
  return sandboxId
}

/**
 * Resolve a bot sandbox and make sure it is running. Sandboxes auto-stop
 * after idle, so tools must wake them before use. `start()` is only called
 * when the sandbox is not already started/starting.
 */
export async function getRunningSandbox(sandboxId: string): Promise<Sandbox> {
  const daytona = getWorkerDaytona()
  let sandbox: Sandbox
  try {
    sandbox = await daytona.get(sandboxId)
  } catch {
    throw new Error(
      "The linked sandbox no longer exists. It may have been deleted."
    )
  }
  await sandbox.refreshData().catch(() => {})
  if (sandbox.state !== "started" && sandbox.state !== "starting") {
    await sandbox.start()
  }
  return sandbox
}

/**
 * Make sure the desktop stack (Xvfb, window manager, VNC) is up so
 * mouse/keyboard/screenshot calls succeed. Cheap when already running:
 * a single status check, and `start()` only when not fully up.
 */
export async function ensureDesktop(sandbox: Sandbox): Promise<void> {
  const status = await sandbox.computerUse.getStatus().catch(() => null)
  if (status?.status !== "running") {
    await sandbox.computerUse.start()
  }
}
