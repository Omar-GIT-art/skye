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

  const makeDir = tool({
    description:
      "Create a directory (including any missing parents) in the sandbox. Use an absolute path.",
    inputSchema: z.object({
      path: z.string().describe("Absolute path of the directory to create."),
    }),
    outputSchema: z.object({
      path: z.string(),
      ok: z.boolean(),
    }),
    execute: async ({ path }) => {
      const sandbox = await getRunningSandbox(requireSandboxId(sandboxId))
      await sandbox.fs.createFolder(path, "755")
      return { path, ok: true }
    },
  })

  const deleteFile = tool({
    description:
      "Delete a file or directory in the sandbox. Pass recursive=true to delete a non-empty directory.",
    inputSchema: z.object({
      path: z.string().describe("Absolute path of the file or directory to delete."),
      recursive: z
        .boolean()
        .optional()
        .describe("Delete directories recursively. Defaults to false."),
    }),
    outputSchema: z.object({
      path: z.string(),
      ok: z.boolean(),
    }),
    execute: async ({ path, recursive }) => {
      const sandbox = await getRunningSandbox(requireSandboxId(sandboxId))
      await sandbox.fs.deleteFile(path, recursive ?? false)
      return { path, ok: true }
    },
  })

  const moveFile = tool({
    description:
      "Move or rename a file or directory in the sandbox. Use absolute paths for both ends.",
    inputSchema: z.object({
      source: z
        .string()
        .describe("Absolute path of the file or directory to move."),
      destination: z.string().describe("Absolute destination path."),
    }),
    outputSchema: z.object({
      source: z.string(),
      destination: z.string(),
      ok: z.boolean(),
    }),
    execute: async ({ source, destination }) => {
      const sandbox = await getRunningSandbox(requireSandboxId(sandboxId))
      await sandbox.fs.moveFiles(source, destination)
      return { source, destination, ok: true }
    },
  })

  const statFile = tool({
    description:
      "Get metadata for a file or directory in the sandbox: size, type, permissions and modification time.",
    inputSchema: z.object({
      path: z.string().describe("Absolute path of the file or directory to inspect."),
    }),
    outputSchema: z.object({
      path: z.string(),
      name: z.string(),
      isDirectory: z.boolean(),
      size: z.number(),
      permissions: z.string(),
      modifiedAt: z.string(),
    }),
    execute: async ({ path }) => {
      const sandbox = await getRunningSandbox(requireSandboxId(sandboxId))
      const info = await sandbox.fs.getFileDetails(path)
      return {
        path: info.path ?? path,
        name: info.name,
        isDirectory: info.isDir,
        size: info.size,
        permissions: info.permissions,
        modifiedAt: info.modifiedAt,
      }
    },
  })

  const searchFiles = tool({
    description:
      "Search the contents of files under a sandbox directory for a text pattern (like grep -r). Returns the files containing the pattern — read the exact lines with readFile or bash afterwards.",
    inputSchema: z.object({
      path: z.string().describe("Absolute directory to search under."),
      pattern: z.string().describe("Text pattern to search for."),
    }),
    outputSchema: z.object({
      path: z.string(),
      pattern: z.string(),
      files: z.array(z.string()),
      truncated: z.boolean(),
    }),
    execute: async ({ path, pattern }) => {
      const sandbox = await getRunningSandbox(requireSandboxId(sandboxId))
      const res = await sandbox.fs.searchFiles(path, pattern)
      const files = res.files ?? []
      const truncated = files.length > MAX_LIST_ENTRIES
      return {
        path,
        pattern,
        files: files.slice(0, MAX_LIST_ENTRIES),
        truncated,
      }
    },
  })

  const findFiles = tool({
    description:
      "Find files under a sandbox directory whose names match a glob pattern (e.g. '*.log', '**/*.ts'). Returns matches with file, line number and a preview.",
    inputSchema: z.object({
      path: z.string().describe("Absolute directory to search under."),
      pattern: z.string().describe("Glob pattern, e.g. '*.log'."),
    }),
    outputSchema: z.object({
      path: z.string(),
      pattern: z.string(),
      matches: z.array(
        z.object({
          file: z.string(),
          line: z.number(),
          preview: z.string(),
        })
      ),
      truncated: z.boolean(),
    }),
    execute: async ({ path, pattern }) => {
      const sandbox = await getRunningSandbox(requireSandboxId(sandboxId))
      const found = await sandbox.fs.findFiles(path, pattern)
      const truncated = found.length > MAX_LIST_ENTRIES
      return {
        path,
        pattern,
        matches: found.slice(0, MAX_LIST_ENTRIES).map((m) => ({
          file: m.file,
          line: m.line,
          preview: m.content.slice(0, 200),
        })),
        truncated,
      }
    },
  })

  const editFile = tool({
    description:
      "Replace an exact block of text inside a sandbox file, without rewriting the whole file. The old text must occur in the file.",
    inputSchema: z.object({
      path: z.string().describe("Absolute path of the file to edit."),
      oldString: z.string().describe("Exact text to replace (must occur in the file)."),
      newString: z.string().describe("Replacement text."),
    }),
    outputSchema: z.object({
      path: z.string(),
      ok: z.boolean(),
    }),
    execute: async ({ path, oldString, newString }) => {
      const sandbox = await getRunningSandbox(requireSandboxId(sandboxId))
      const results = await sandbox.fs.replaceInFiles(
        [path],
        oldString,
        newString
      )
      const first = results[0]
      if (!first?.success) {
        throw new Error(
          first?.error ??
            `Could not replace text in ${path}: the old text was not found. Read the file first to get the exact text.`
        )
      }
      return { path, ok: true }
    },
  })

  const openUrl = tool({
    description:
      "Open a URL in the sandbox's web browser (Chromium) on its desktop. Starts the desktop if needed. Afterwards use viewScreen to see the page yourself, keyboardHotkey/clickUiElement/mouseClick to interact with it, and showScreen to show it to the user.",
    inputSchema: z.object({
      url: z.string().describe("The http(s) URL to open."),
    }),
    outputSchema: z.object({
      url: z.string(),
      ok: z.boolean(),
      logPath: z.string(),
    }),
    execute: async ({ url }) => {
      const sandbox = await getRunningSandbox(requireSandboxId(sandboxId))
      await ensureDesktop(sandbox)
      const safeUrl = url.replace(/"/g, "")
      await sandbox.process.executeCommand(
        `nohup chromium --no-sandbox --disable-gpu --disable-dev-shm-usage --no-first-run --window-size=1024,768 "${safeUrl}" > /tmp/chromium.log 2>&1 &`,
        undefined,
        // The shell has no DISPLAY set — inject it so Chromium connects
        // to the visible desktop.
        { DISPLAY: ":0" },
        15
      )
      return { url, ok: true, logPath: "/tmp/chromium.log" }
    },
  })

  const listWindows = tool({
    description:
      "List the open windows on the sandbox desktop (title, position, size, which is active). Use it to check whether an app you launched is actually open before interacting with it.",
    inputSchema: z.object({}),
    outputSchema: z.object({
      count: z.number(),
      windows: z.array(
        z.object({
          id: z.number(),
          title: z.string(),
          isActive: z.boolean(),
          x: z.number(),
          y: z.number(),
          width: z.number(),
          height: z.number(),
        })
      ),
    }),
    execute: async () => {
      const sandbox = await getRunningSandbox(requireSandboxId(sandboxId))
      await ensureDesktop(sandbox)
      const res = await sandbox.computerUse.display.getWindows()
      const windows = (res.windows ?? []).map((w) => ({
        id: w.id ?? 0,
        title: w.title ?? "",
        isActive: w.isActive ?? false,
        x: w.x ?? 0,
        y: w.y ?? 0,
        width: w.width ?? 0,
        height: w.height ?? 0,
      }))
      return { count: windows.length, windows }
    },
  })

  const mouseDrag = tool({
    description:
      "Drag the mouse from one screen coordinate to another — for selecting text, moving windows, or using sliders. Only use coordinates you read from a recent screenshot.",
    inputSchema: z.object({
      startX: z.number().describe("Starting X coordinate in screen pixels."),
      startY: z.number().describe("Starting Y coordinate in screen pixels."),
      endX: z.number().describe("Ending X coordinate in screen pixels."),
      endY: z.number().describe("Ending Y coordinate in screen pixels."),
      button: z
        .enum(["left", "right", "middle"])
        .optional()
        .describe("Mouse button. Defaults to left."),
    }),
    outputSchema: z.object({
      ok: z.boolean(),
      startX: z.number(),
      startY: z.number(),
      endX: z.number(),
      endY: z.number(),
    }),
    execute: async ({ startX, startY, endX, endY, button }) => {
      const sandbox = await getRunningSandbox(requireSandboxId(sandboxId))
      await ensureDesktop(sandbox)
      await sandbox.computerUse.mouse.drag(
        startX,
        startY,
        endX,
        endY,
        button ?? "left"
      )
      return { ok: true, startX, startY, endX, endY }
    },
  })

  const keyboardHotkey = tool({
    description:
      "Press a keyboard shortcut chord on the sandbox desktop, e.g. 'ctrl+t' for a new browser tab, 'ctrl+l' to focus the address bar, 'alt+tab' to switch windows.",
    inputSchema: z.object({
      chord: z.string().describe("Shortcut chord, e.g. 'ctrl+t'."),
    }),
    outputSchema: z.object({
      ok: z.boolean(),
      chord: z.string(),
    }),
    execute: async ({ chord }) => {
      const sandbox = await getRunningSandbox(requireSandboxId(sandboxId))
      await ensureDesktop(sandbox)
      await sandbox.computerUse.keyboard.hotkey(chord)
      return { ok: true, chord }
    },
  })

  const findUiElement = tool({
    description:
      "Find desktop UI elements (buttons, text fields, links, ...) by role and/or name through the accessibility tree — no screenshot coordinates needed. Returns element ids with on-screen bounds: pass an id's element to clickUiElement, or derive click coordinates from its bounds.",
    inputSchema: z.object({
      role: z
        .string()
        .optional()
        .describe("Element role, e.g. 'button', 'entry', 'link'."),
      name: z
        .string()
        .optional()
        .describe("Substring of the element's name, e.g. the button label."),
      limit: z
        .number()
        .min(1)
        .max(30)
        .optional()
        .describe("Max matches to return. Defaults to 15."),
    }),
    outputSchema: z.object({
      count: z.number(),
      truncated: z.boolean(),
      elements: z.array(
        z.object({
          id: z.string(),
          role: z.string(),
          name: z.string(),
          description: z.string(),
          x: z.number(),
          y: z.number(),
          width: z.number(),
          height: z.number(),
        })
      ),
    }),
    execute: async ({ role, name, limit }) => {
      const sandbox = await getRunningSandbox(requireSandboxId(sandboxId))
      await ensureDesktop(sandbox)
      const res = await sandbox.computerUse.accessibility.findNodes({
        ...(role ? { role } : {}),
        ...(name ? { name, nameMatch: "substring" } : {}),
        scope: "all",
        limit: limit ?? 15,
      })
      const matches = res.matches ?? []
      return {
        count: matches.length,
        truncated: res.truncated ?? false,
        elements: matches.map((m) => ({
          id: m.id ?? "",
          role: m.role ?? "",
          name: m.name ?? "",
          description: m.description ?? "",
          x: m.bounds?.x ?? 0,
          y: m.bounds?.y ?? 0,
          width: m.bounds?.width ?? 0,
          height: m.bounds?.height ?? 0,
        })),
      }
    },
  })

  const clickUiElement = tool({
    description:
      "Click a desktop UI element found by role and/or name (e.g. the 'Search' button) without needing screen coordinates. Fails when nothing matches — then use findUiElement to explore, or viewScreen plus mouseClick.",
    inputSchema: z.object({
      role: z
        .string()
        .optional()
        .describe("Element role, e.g. 'button', 'link'."),
      name: z
        .string()
        .optional()
        .describe(
          "Substring of the element's name, e.g. the button label. At least one of role or name is required."
        ),
    }),
    outputSchema: z.object({
      ok: z.boolean(),
      id: z.string(),
      role: z.string(),
      name: z.string(),
    }),
    execute: async ({ role, name }) => {
      if (!role && !name) {
        throw new Error("Provide at least one of role or name.")
      }
      const sandbox = await getRunningSandbox(requireSandboxId(sandboxId))
      await ensureDesktop(sandbox)
      const res = await sandbox.computerUse.accessibility.findNodes({
        ...(role ? { role } : {}),
        ...(name ? { name, nameMatch: "substring" } : {}),
        scope: "all",
        limit: 5,
      })
      const match = res.matches?.[0]
      if (!match?.id) {
        throw new Error(
          `No UI element found (role=${role ?? "-"}, name=${name ?? "-"}). Use findUiElement to explore, or viewScreen plus mouseClick.`
        )
      }
      await sandbox.computerUse.accessibility.invokeNode(match.id, "click")
      return {
        ok: true,
        id: match.id,
        role: match.role ?? "",
        name: match.name ?? "",
      }
    },
  })

  const wait = tool({
    description:
      "Pause for a few seconds, e.g. to let a web page or app finish loading before you viewScreen. Needs no sandbox.",
    inputSchema: z.object({
      seconds: z
        .number()
        .min(1)
        .max(30)
        .describe("Seconds to wait (1–30)."),
    }),
    outputSchema: z.object({
      ok: z.boolean(),
      seconds: z.number(),
    }),
    execute: async ({ seconds }) => {
      await new Promise((resolve) => setTimeout(resolve, seconds * 1000))
      return { ok: true, seconds }
    },
  })

  const runPython = tool({
    description:
      "Run Python code in the sandbox and return its output. Use it for computation, data processing and scripting instead of shelling out from bash.",
    inputSchema: z.object({
      code: z.string().describe("The Python code to run."),
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
    execute: async ({ code, timeoutSeconds }) => {
      const sandbox = await getRunningSandbox(requireSandboxId(sandboxId))
      const res = await sandbox.process.codeRun(
        code,
        undefined,
        timeoutSeconds ?? 60
      )
      const { text, truncated } = truncate(res.result, MAX_BASH_OUTPUT_CHARS)
      return { exitCode: res.exitCode, output: text, truncated }
    },
  })

  return {
    bash,
    readFile,
    writeFile,
    editFile,
    listFiles,
    findFiles,
    searchFiles,
    statFile,
    makeDir,
    moveFile,
    deleteFile,
    wait,
    runPython,
    openUrl,
    listWindows,
    viewScreen,
    showScreen,
    findUiElement,
    clickUiElement,
    mouseClick,
    mouseMove,
    mouseDrag,
    mouseScroll,
    keyboardType,
    keyboardPress,
    keyboardHotkey,
  }
}

export type SandboxTools = ReturnType<typeof createSandboxTools>
