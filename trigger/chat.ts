import { stepCountIs } from "ai"
import { openrouter } from "@openrouter/ai-sdk-provider"
import { chat } from "@trigger.dev/sdk/ai"
import { z } from "zod"

import { createSandboxTools } from "./tools"

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
  // Transcript persistence uses the platform default storage, keyed by
  // chatId (the Session externalId). No custom storage: history, state,
  // and resume cursors round-trip per chat automatically.
  run: async ({ messages, tools, clientData, signal, streamText }) =>
    streamText({
      model: openrouter("google/gemini-3.5-flash"),
      instructions: buildBaseInstructions({
        botName: clientData?.botName,
        botJob: clientData?.botJob,
        purpose: clientData?.instructions,
        sandboxId: clientData?.sandboxId,
      }),
      messages,
      tools,
      abortSignal: signal,
      stopWhen: stepCountIs(15),
    }),
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
      "Your sandbox is a Linux computer you can operate with your tools. When the user asks you to do something on your computer, use the tools below to do it — never claim you are unable to act on your sandbox.",
      "- `bash`: run shell commands. Use absolute paths; the working directory defaults to the sandbox home. Commands must terminate on their own.",
      "- `readFile`, `writeFile`, `listFiles`: read, write and browse text files by absolute path.",
      "- `mouseClick`, `mouseMove`, `mouseScroll`, `keyboardType`, `keyboardPress`: operate the sandbox desktop. Only use coordinates you read from a recent screenshot, and look again after each action since the desktop changes.",
      "- GUI apps run on the desktop (Xvfb display `:0`, 1024x768 — already in your environment, no need to set it). Launch them in the background from `bash`, e.g. `nohup chromium --no-sandbox --disable-gpu --disable-dev-shm-usage --window-size=1024,768 https://www.google.com > /tmp/chromium.log 2>&1 &`, wait a few seconds, then inspect with `viewScreen` and drive with mouse and keyboard.",
      "- `viewScreen`: capture a screenshot for your own inspection. The user will not see it — use it to ground coordinates before acting.",
      "- `showScreen`: capture a screenshot to show the user. Use it when the user asks what is on the screen or asks to see it.",
    ].join("\n")
  )

  return lines.join("\n\n")
}
