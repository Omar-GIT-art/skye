import { openrouter } from "@openrouter/ai-sdk-provider"
import { chat } from "@trigger.dev/sdk/ai"
import { z } from "zod"

export const skyeChat = chat.agent({
  id: "skye-chat",
  clientDataSchema: z.object({
    instructions: z.string().max(2000).nullish(),
  }),
  // Transcript persistence uses the platform default storage, keyed by
  // chatId (the Session externalId). No custom storage: history, state,
  // and resume cursors round-trip per chat automatically.
  run: async ({ messages, clientData, signal, streamText }) =>
    streamText({
      model: openrouter("google/gemini-2.5-flash"),
      instructions:
        clientData?.instructions ?? "You are a helpful assistant.",
      messages,
      abortSignal: signal,
    }),
})
