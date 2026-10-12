import { tool } from "ai"
import { z } from "zod"

import {
  ensureDesktop,
  getRunningSandbox,
  requireSandboxId,
} from "./sandbox"

const MAX_BASH_OUTPUT_CHARS = 12_000
const MAX_READ_BYTES = 65_536
const MAX_LIST_ENTRIES = 200

function truncate(text: string, max: number): { text: string; truncated: boolean } {
  if (text.length <= max) {
    return { text, truncated: false }
  }
  return {
    text: text.slice(0, max) + `\n…[truncated ${text.length - max} chars]`,
    truncated: true,
  }
}

const screenshotOutputSchema = z.object({
  mediaType: z.string(),
  base64: z.string(),
  width: z.number(),
  height: z.number(),
})

type ScreenshotOutput = z.infer<typeof screenshotOutputSchema>

async function captureScreenshot(sandboxId: string): Promise<ScreenshotOutput> {
  const sandbox = await getRunningSandbox(sandboxId)
  await ensureDesktop(sandbox)
  const info = await sandbox.computerUse.display.getInfo()
  const primary =
    info.displays?.find((d) => d.isActive) ?? info.displays?.[0]
  const width = primary?.width ?? 0
  const height = primary?.height ?? 0
  const shot = await sandbox.computerUse.screenshot.takeCompressed({
    format: "jpeg",
    quality: 75,
    showCursor: true,
  })
  if (!shot.screenshot) {
    throw new Error("The sandbox returned an empty screenshot.")
  }
  return {
    mediaType: "image/jpeg",
    base64: shot.screenshot,
    width,
    height,
  }
}

function screenshotModelOutput({
  output,
}: {
  output: ScreenshotOutput
}) {
  return {
    type: "content" as const,
    value: [
      {
        type: "text" as const,
        text: `Screenshot of the sandbox desktop (${output.width}x${output.height}). Mouse and keyboard coordinates are screen pixels at this resolution.`,
      },
      {
        type: "file" as const,
        data: { type: "data" as const, data: output.base64 },
        mediaType: output.mediaType,
      },
    ],
  }
}

/**
 * Build the per-turn tool set bound to one bot sandbox. Called from the
 * agent's `tools` resolver with the session's `clientData.sandboxId`, so
 * every tool operates on the bot's own sandbox.
 */
export function createSandboxTools(sandboxId: string | null | undefined) {
  const bash = tool({
    description:
      "Run a shell command in the sandbox (Linux) and return its output. Use absolute paths; the working directory defaults to the sandbox home directory. Commands must terminate on their own — do not start long-running servers without returning.",
    inputSchema: z.object({
      command: z.string().describe("The shell command to run."),
      cwd: z
        .string()
        .optional()
        .describe("Working directory. Defaults to the sandbox working directory."),
      timeoutSeconds: z
        .number()
        .min(1)
        .max(600)
        .optional()
        .describe("Max seconds to wait. Defaults to 60."),
    }),
    outputSchema: z.object({
      exitCode: z.number(),
      output: z.string(),
      truncated: z.boolean(),
    }),
    execute: async ({ command, cwd, timeoutSeconds }) => {
      const sandbox = await getRunningSandbox(requireSandboxId(sandboxId))
      const res = await sandbox.process.executeCommand(
        command,
        cwd,
        // The desktop runs on Xvfb display :0, but the shell has no
        // DISPLAY set — inject it so GUI apps launched from bash
        // (e.g. `chromium`) connect to the visible desktop.
        { DISPLAY: ":0" },
        timeoutSeconds ?? 60
      )
      const { text, truncated } = truncate(res.result, MAX_BASH_OUTPUT_CHARS)
      return { exitCode: res.exitCode, output: text, truncated }
    },
  })

  const readFile = tool({
    description:
      "Read a text file from the sandbox and return its contents. Use an absolute path. For large files, read a slice with the bash tool instead.",
    inputSchema: z.object({
      path: z.string().describe("Absolute path of the file to read."),
      maxBytes: z
        .number()
        .min(1)
        .max(1_000_000)
        .optional()
        .describe("Refuse files larger than this. Defaults to 65536."),
    }),
    outputSchema: z.object({
      path: z.string(),
      content: z.string(),
    }),
    execute: async ({ path, maxBytes }) => {
      const sandbox = await getRunningSandbox(requireSandboxId(sandboxId))
      const limit = maxBytes ?? MAX_READ_BYTES
      const buf = await sandbox.fs.downloadFile(path)
      if (buf.byteLength > limit) {
        throw new Error(
          `File is ${buf.byteLength} bytes, over the ${limit} byte limit. Use the bash tool to read a slice of it.`
        )
      }
      return { path, content: buf.toString("utf8") }
    },
  })

  const writeFile = tool({
    description:
      "Write (or overwrite) a text file in the sandbox. Use an absolute path. Parent directories must already exist.",
    inputSchema: z.object({
      path: z.string().describe("Absolute path of the file to write."),
      content: z.string().describe("Full text content to write."),
    }),
    outputSchema: z.object({
      path: z.string(),
      bytesWritten: z.number(),
    }),
    execute: async ({ path, content }) => {
      const sandbox = await getRunningSandbox(requireSandboxId(sandboxId))
      const buf = Buffer.from(content, "utf8")
      await sandbox.fs.uploadFile(buf, path)
      return { path, bytesWritten: buf.byteLength }
    },
  })

  const listFiles = tool({
    description:
      "List a directory in the sandbox. Use an absolute path.",
    inputSchema: z.object({
      path: z.string().describe("Absolute path of the directory to list."),
      depth: z
        .number()
        .min(1)
        .max(3)
        .optional()
        .describe("How many levels deep to list. Defaults to 1."),
    }),
    outputSchema: z.object({
      path: z.string(),
      entries: z.array(
        z.object({
          name: z.string(),
          path: z.string(),
          isDirectory: z.boolean(),
          size: z.number(),
        })
      ),
      truncated: z.boolean(),
    }),
    execute: async ({ path, depth }) => {
      const sandbox = await getRunningSandbox(requireSandboxId(sandboxId))
      const files = await sandbox.fs.listFiles(path, { depth: depth ?? 1 })
      const truncated = files.length > MAX_LIST_ENTRIES
      return {
        path,
        entries: files.slice(0, MAX_LIST_ENTRIES).map((f) => ({
          name: f.name,
          path: f.path,
          isDirectory: f.isDir,
          size: f.size,
        })),
        truncated,
      }
    },
  })

  const mouseClick = tool({
    description:
      "Click the mouse at screen coordinates (x, y). Only use coordinates you read from a recent screenshot, since the desktop changes as you act.",
    inputSchema: z.object({
      x: z.number().describe("X coordinate in screen pixels."),
      y: z.number().describe("Y coordinate in screen pixels."),
      button: z
        .enum(["left", "right", "middle"])
        .optional()
        .describe("Mouse button. Defaults to left."),
      double: z
        .boolean()
        .optional()
        .describe("Double-click. Defaults to false."),
    }),
    outputSchema: z.object({
      ok: z.boolean(),
      x: z.number(),
      y: z.number(),
      button: z.string(),
      double: z.boolean(),
    }),
    execute: async ({ x, y, button, double }) => {
      const sandbox = await getRunningSandbox(requireSandboxId(sandboxId))
      await ensureDesktop(sandbox)
      await sandbox.computerUse.mouse.click(
        x,
        y,
        button ?? "left",
        double ?? false
      )
      return { ok: true, x, y, button: button ?? "left", double: double ?? false }
    },
  })

  const mouseMove = tool({
    description: "Move the mouse cursor to screen coordinates (x, y) without clicking.",
    inputSchema: z.object({
      x: z.number().describe("X coordinate in screen pixels."),
      y: z.number().describe("Y coordinate in screen pixels."),
    }),
    outputSchema: z.object({
      ok: z.boolean(),
      x: z.number(),
      y: z.number(),
    }),
    execute: async ({ x, y }) => {
      const sandbox = await getRunningSandbox(requireSandboxId(sandboxId))
      await ensureDesktop(sandbox)
      const pos = await sandbox.computerUse.mouse.move(x, y)
      return { ok: true, x: pos.x ?? x, y: pos.y ?? y }
    },
  })

  const mouseScroll = tool({
    description: "Scroll the mouse wheel at screen coordinates (x, y).",
    inputSchema: z.object({
      x: z.number().describe("X coordinate in screen pixels."),
      y: z.number().describe("Y coordinate in screen pixels."),
      direction: z.enum(["up", "down"]).describe("Scroll direction."),
      amount: z
        .number()
        .min(1)
        .max(20)
        .optional()
        .describe("Scroll amount. Defaults to 3."),
    }),
    outputSchema: z.object({ ok: z.boolean() }),
    execute: async ({ x, y, direction, amount }) => {
      const sandbox = await getRunningSandbox(requireSandboxId(sandboxId))
      await ensureDesktop(sandbox)
      await sandbox.computerUse.mouse.scroll(x, y, direction, amount ?? 3)
      return { ok: true }
    },
  })

  const keyboardType = tool({
    description:
      "Type text into the focused window on the sandbox desktop. Click the target field first if focus is uncertain.",
    inputSchema: z.object({
      text: z.string().describe("The text to type."),
    }),
    outputSchema: z.object({
      ok: z.boolean(),
      chars: z.number(),
    }),
    execute: async ({ text }) => {
      const sandbox = await getRunningSandbox(requireSandboxId(sandboxId))
      await ensureDesktop(sandbox)
      await sandbox.computerUse.keyboard.type(text)
      return { ok: true, chars: text.length }
    },
  })

  const keyboardPress = tool({
    description:
      "Press a key on the sandbox desktop, with optional modifiers. Key names include 'enter', 'escape', 'tab', letters, digits and function keys.",
    inputSchema: z.object({
      key: z.string().describe("The key to press, e.g. 'enter'."),
      modifiers: z
        .array(z.string())
        .optional()
        .describe("Modifiers, e.g. ['ctrl', 'shift']."),
    }),
    outputSchema: z.object({
      ok: z.boolean(),
      key: z.string(),
      modifiers: z.array(z.string()),
    }),
    execute: async ({ key, modifiers }) => {
      const sandbox = await getRunningSandbox(requireSandboxId(sandboxId))
      await ensureDesktop(sandbox)
      await sandbox.computerUse.keyboard.press(key, modifiers ?? [])
      return { ok: true, key, modifiers: modifiers ?? [] }
    },
  })

  const viewScreen = tool({
    description:
      "Capture a screenshot of the sandbox desktop for your own inspection — the user will NOT see this image. Use it to ground mouse/keyboard coordinates before acting, and re-capture after each action since the desktop changes.",
    inputSchema: z.object({}),
    outputSchema: screenshotOutputSchema,
    execute: async () => captureScreenshot(requireSandboxId(sandboxId)),
    toModelOutput: screenshotModelOutput,
  })

  const showScreen = tool({
    description:
      "Capture a screenshot of the sandbox desktop and show it to the user. Use this when the user asks what is on the screen or asks to see it.",
    inputSchema: z.object({}),
    outputSchema: screenshotOutputSchema,
    execute: async () => captureScreenshot(requireSandboxId(sandboxId)),
    toModelOutput: screenshotModelOutput,
  })

  return {
    bash,
    readFile,
    writeFile,
    listFiles,
    mouseClick,
    mouseMove,
    mouseScroll,
    keyboardType,
    keyboardPress,
    viewScreen,
    showScreen,
  }
}

export type SandboxTools = ReturnType<typeof createSandboxTools>
