"use server"

import { getChatById } from "@/queries/chats"
import { getDaytonaClient } from "@/lib/daytona"

// noVNC web client port inside Daytona sandboxes.
const VNC_PORT = 6080
// Signed preview URLs max out at 24h; keep the desktop link usable
// across sandbox restarts for a full day.
const VNC_URL_TTL_SECONDS = 24 * 60 * 60

// Signed preview URL for the bot sandbox's noVNC desktop, scoped to the
// chat owner. Wakes a stopped sandbox and starts the desktop stack
// (Xvfb, xfce4, x11vnc, novnc) so the viewer connects immediately.
export async function getSandboxVncUrl(
  chatId: string
): Promise<{ url: string }> {
  if (!chatId || chatId.trim().length === 0) {
    throw new Error("Missing chat id.")
  }

  const chat = await getChatById(chatId)
  const sandboxId = chat?.bot?.sandboxId
  if (!sandboxId) {
    throw new Error("This chat has no sandbox linked to it.")
  }

  const daytona = getDaytonaClient()
  if (!daytona) {
    throw new Error("Daytona is not configured.")
  }

  let sandbox
  try {
    sandbox = await daytona.get(sandboxId)
  } catch {
    throw new Error("The linked sandbox no longer exists.")
  }

  await sandbox.refreshData().catch(() => {})
  if (sandbox.state !== "started" && sandbox.state !== "starting") {
    await sandbox.start()
  }

  const status = await sandbox.computerUse.getStatus().catch(() => null)
  if (status?.status !== "running") {
    await sandbox.computerUse.start()
  }

  const signed = await sandbox.getSignedPreviewUrl(
    VNC_PORT,
    VNC_URL_TTL_SECONDS
  )
  const base = signed.url.replace(/\/$/, "")
  return {
    url: `${base}/vnc.html?autoconnect=true&resize=scale`,
  }
}
