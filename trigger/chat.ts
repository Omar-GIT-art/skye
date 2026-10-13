import { stepCountIs, type ModelMessage } from "ai"
import { openrouter } from "@openrouter/ai-sdk-provider"
import { chat } from "@trigger.dev/sdk/ai"
import { z } from "zod"

import { createSandboxTools } from "./tools"

/**
 * Google (via OpenRouter) rejects conversations that end with a model turn
 * or contain orphaned tool calls (a `tool-call` with no matching
 * `tool-result`, or vice versa). Both states arise from failed turns: the
 * transcript persists partial turns, so a streamed tool call whose run died
 * mid-flight is saved without its result, and every resubmission then fails
 * the same way forever. Sanitize history before each turn:
 * 1. drop trailing assistant messages (also removes end-of-history orphans),
 * 2. strip assistant tool-call parts that never received a result,
 * 3. strip tool results whose call was removed, dropping emptied messages.
 */
function sanitizeMessages(messages: ModelMessage[]): ModelMessage[] {
  let end = messages.length
  while (end > 0 && messages[end - 1].role === "assistant") {
    end--
  }
  const trimmed = messages.slice(0, end)

  const answeredIds = new Set<string>()
  for (const message of trimmed) {
    if (message.role === "tool") {
      for (const part of message.content) {
        if (part.type === "tool-result") {
          answeredIds.add(part.toolCallId)
        }
      }
    }
  }

  const keptCallIds = new Set<string>()
  const withoutOrphans = trimmed.flatMap<ModelMessage>((message) => {
    if (message.role !== "assistant" || typeof message.content === "string") {
      return [message]
    }
    const content = message.content.filter((part) => {
      if (part.type === "tool-call") {
        const keep = answeredIds.has(part.toolCallId)
        if (keep) {
          keptCallIds.add(part.toolCallId)
        }
        return keep
      }
      return true
    })
    if (content.length === 0) {
      return []
    }
    return [{ ...message, content }]
  })

  return withoutOrphans.flatMap<ModelMessage>((message) => {
    if (message.role !== "tool") {
      return [message]
    }
    const content = message.content.filter(
      (part) => part.type !== "tool-result" || keptCallIds.has(part.toolCallId)
    )
    if (content.length === 0) {
      return []
    }
    return [{ ...message, content }]
  })
}

/**
 * Near-miss tool names the model invents (e.g. `takeScreenshot` instead of
 * `viewScreen`, `navigate` instead of `openUrl`). Without repair, an unknown
 * tool name fails the whole run with a bare error. Map them onto the real
 * tool set: exact case-insensitive matches first, then a small alias table.
 * Anything else returns null so the original error surfaces (now visible via
 * `onError` below instead of masked).
 */
const TOOL_NAME_ALIASES: Record<string, string> = {
  screenshot: "viewScreen",
  takescreenshot: "viewScreen",
  screencapture: "viewScreen",
  capturescreen: "viewScreen",
  showscreen: "showScreen",
  displayscreen: "showScreen",
  openbrowser: "openUrl",
  openwebsite: "openUrl",
  openpage: "openUrl",
  navigate: "openUrl",
  goto: "openUrl",
  gotourl: "openUrl",
  browse: "openUrl",
  visiturl: "openUrl",
  terminal: "bash",
  shell: "bash",
  runcommand: "bash",
  exec: "bash",
  execute: "bash",
  python: "runPython",
  runscript: "runPython",
  listwindow: "listWindows",
  getwindows: "listWindows",
  click: "mouseClick",
  presskey: "keyboardPress",
  type: "keyboardType",
  scroll: "mouseScroll",
  drag: "mouseDrag",
}

export const skyeChat = chat.agent({
  id: "skye-chat",
  clientDataSchema: z.object({
    instructions: z.string().max(2000).nullish(),
    botName: z.string().max(80).nullish(),
    botJob: z.string().max(120).nullish(),
    sandboxId: z.string().nullish(),
  }),
  // Resolved once per turn: every tool operates on the bot's own sandbox.
  tools: ({ clientData }) => createSandboxTools(clientData?.sandboxId),
  // Forward the real error text to the client (truncated). The AI SDK masks
  // stream errors as "An error occurred." by default, which makes failures
  // undebuggable from the chat UI.
  uiMessageStreamOptions: {
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : "An error occurred."
      const maxLength = 300
      return message.length > maxLength
        ? `${message.slice(0, maxLength)}…`
        : message
    },
  },
  // Transcript persistence uses the platform default storage, keyed by
  // chatId (the Session externalId). No custom storage: history, state,
  // and resume cursors round-trip per chat automatically.
  run: async ({ messages, tools, clientData, signal, streamText }) => {
    const cleaned = sanitizeMessages(messages)
    if (cleaned.length !== messages.length) {
      console.warn(
        `[skye-chat] sanitized history ${messages.length} -> ${cleaned.length} (incoming tail: ${messages
          .slice(-4)
          .map((m) => m.role)
          .join(",")})`
      )
    }
    if (cleaned.length === 0) {
      throw new Error(
        "There is no user message to respond to yet. Send a message first."
      )
    }
    return streamText({
      model: openrouter("google/gemini-3.8-flash"),
      instructions: buildBaseInstructions({
        botName: clientData?.botName,
        botJob: clientData?.botJob,
        purpose: clientData?.instructions,
        sandboxId: clientData?.sandboxId,
      }),
      messages: cleaned,
      tools,
      abortSignal: signal,
      // Retry transient provider failures (non-retryable 400s skip this).
      maxRetries: 3,
      // Server-side fingerprint for turn failures: roles only, no content.
      // Read these lines in the trigger run log to see exactly which shape
      // the provider rejected.
      onError: ({ error }) => {
        const err = error as {
          name?: unknown
          statusCode?: unknown
          data?: unknown
        }
        console.error(
          `[skye-chat] turn failed: name=${String(err?.name ?? "unknown")} status=${String(err?.statusCode ?? "?")} history=${cleaned.length} tail=${cleaned
            .slice(-5)
            .map((m) => m.role)
            .join(",")}`
        )
      },
      onStepFinish: ({ finishReason, response }) => {
        console.info(
          `[skye-chat] step finished: reason=${finishReason} responseRoles=${response.messages
            .map((m) => m.role)
            .join(",")}`
        )
      },
      repairToolCall: async ({ toolCall, tools: availableTools, error }) => {
        if (error.name !== "NoSuchToolError") {
          return null
        }
        const normalized = toolCall.toolName
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "")
        const exact = Object.keys(availableTools).find(
          (name) => name.toLowerCase() === normalized
        )
        const repaired = exact ?? TOOL_NAME_ALIASES[normalized]
        if (!repaired) {
          return null
        }
        return { ...toolCall, toolName: repaired }
      },
      stopWhen: stepCountIs(15),
    })
  },
})

function buildBaseInstructions({
  botName,
  botJob,
  purpose,
  sandboxId,
}: {
  botName?: string | null
  botJob?: string | null
  purpose?: string | null
  sandboxId?: string | null
}): string {
  const name = botName?.trim() || "Skye"
  const job = botJob?.trim() || "helpful assistant"

  const lines = [
    `You are ${name}, a ${job}.`,
    "You live in Skye, a chat app where each bot is paired with the person talking to it.",
    "Style: write all chat prose in lowercase only — no capital letters anywhere, including 'i' instead of 'I'. Keep code, commands, urls and file paths exactly as they must be (they are case-sensitive), but every normal sentence stays lowercase.",
  ]

  if (purpose && purpose.trim().length > 0) {
    lines.push(`Your purpose, as described by your owner:\n${purpose.trim()}`)
  }

  if (sandboxId && sandboxId.trim().length > 0) {
    lines.push(
      "You are paired with a dedicated, isolated sandbox environment " +
        `(Daytona sandbox id \`${sandboxId.trim()}\`) that shares your lifecycle: ` +
        "it was created alongside you and is removed when you are deleted."
    )
  }

  lines.push(
    [
      "## Your sandbox computer",
      "Your sandbox is a Linux computer you can operate with your tools. When the user asks you to do something on your computer, use the tools below to do it — never claim you are unable to act on your sandbox, and never ask the user to open anything manually: you can open apps and browsers yourself.",
      "- `bash`: run shell commands. Use absolute paths; the working directory defaults to the sandbox home. Commands must terminate on their own.",
      "- `runPython`: run Python code for computation, data processing and scripting.",
      "- `readFile`, `writeFile`, `editFile`, `listFiles`, `findFiles`, `searchFiles`, `statFile`, `makeDir`, `moveFile`, `deleteFile`: full file management by absolute path. Prefer `editFile` over rewriting whole files.",
      "- `openUrl`: open a web page in the sandbox browser yourself — this is how you 'open' sites, never ask the user to do it. Navigate straight to the target site (e.g. `openUrl` https://youtube.com) — never route through google.com or another search engine unless the user explicitly asked to search for something.",
      "- `listWindows`: check which desktop apps are open and whether your launch worked.",
      "- `findUiElement` / `clickUiElement`: find and click buttons, fields and links by name/role without screenshots — prefer these over pixel coordinates whenever possible.",
      "- `mouseClick`, `mouseMove`, `mouseDrag`, `mouseScroll`, `keyboardType`, `keyboardPress`, `keyboardHotkey`: operate the sandbox desktop.",
      "- `wait`: pause a few seconds for pages/apps to load before looking.",
      "- GUI apps run on the desktop (Xvfb display `:0`, 1024x768 — already in your environment, no need to set it).",
      "- `viewScreen`: capture a screenshot for your own inspection. The user will NOT see it — use it to ground coordinates before acting.",
      "- `showScreen`: capture a screenshot to show the user. Use it when the user asks what is on the screen or asks to see it.",
      "## Desktop operating rules (follow strictly)",
      "1. NEVER guess screen coordinates. Before any coordinate action (`mouseClick`, `mouseMove`, `mouseDrag`, `mouseScroll`, or `keyboardType` into a field), call `viewScreen` first and read the coordinates from that screenshot. Coordinates go stale after every action — re-capture before the next one. Clicking blind at invented coordinates is forbidden.",
      "2. Work one step at a time and verify: act, then `viewScreen` to confirm the effect before the next action. If an action had no visible effect, look again and try a different approach — do not repeat the exact same coordinates blindly.",
      "3. Browser recipe: `openUrl` → `wait` 2–4s for the page to load → `listWindows` to confirm the browser is open → `viewScreen` to see the state → interact (prefer `clickUiElement`/`findUiElement` and `keyboardHotkey` like `ctrl+l` for the address bar, `ctrl+t` for a new tab) → verify with `viewScreen` after each step.",
      "4. Typing into a search field: focus the field first (click it or use `clickUiElement`), then `keyboardType` the text, then confirm with `keyboardPress` key `enter` (or click the Search button), then verify with `viewScreen` and report what you see.",
      "5. Narrate briefly as you go so the user can follow: one short line per tool step is enough.",
      "6. If a page shows a robot/captcha/bot check, stop and report it to the user instead of retrying in a loop — sandbox ips often trip bot detection and pushing through rarely works. Offer what they can do instead (e.g. you can still fetch the page content another way if they want).",
    ].join("\n")
  )

  return lines.join("\n\n")
}
