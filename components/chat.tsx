"use client"

import { useChat } from "@ai-sdk/react"
import {
  useLoadTranscript,
  useTriggerChatTransport,
} from "@trigger.dev/sdk/chat/react"
import type { InferChatUIMessageFromTools } from "@trigger.dev/sdk/ai"
import {
  CheckIcon,
  CopyIcon,
  MessageSquareIcon,
  RefreshCcwIcon,
} from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { useStickToBottomContext } from "use-stick-to-bottom"

import {
  deleteChatSession,
  loadChatTranscript,
  mintChatAccessToken,
  saveChatSession,
  startChatSession,
  type ChatSessionState,
} from "@/actions/chat"
import { ChatHeader } from "@/components/chat-header"
import { CodeBlock } from "@/components/ai-elements/code-block"
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation"
import { Image } from "@/components/ai-elements/image"
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message"
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning"
import { Shimmer } from "@/components/ai-elements/shimmer"
import {
  PromptInput,
  type PromptInputMessage,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input"
import {
  Suggestion,
  Suggestions,
} from "@/components/ai-elements/suggestion"
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool"
import type { skyeChat } from "@/trigger/chat"
import type { SandboxTools } from "@/trigger/tools"

// Typed from the tool set (not the agent) because the agent resolves its
// tools per turn from clientData, which erases the static tool types.
type SkyeMessage = InferChatUIMessageFromTools<SandboxTools>

type ToolPart = Extract<
  SkyeMessage["parts"][number],
  { type: `tool-${string}` }
>

const toolTitles: Record<ToolPart["type"], string> = {
  "tool-bash": "Run command",
  "tool-wait": "Wait",
  "tool-runPython": "Run Python",
  "tool-readFile": "Read file",
  "tool-writeFile": "Write file",
  "tool-editFile": "Edit file",
  "tool-listFiles": "List files",
  "tool-findFiles": "Find files",
  "tool-searchFiles": "Search files",
  "tool-statFile": "File info",
  "tool-makeDir": "Create folder",
  "tool-moveFile": "Move file",
  "tool-deleteFile": "Delete file",
  "tool-openUrl": "Open in browser",
  "tool-listWindows": "List windows",
  "tool-mouseClick": "Click",
  "tool-mouseMove": "Move mouse",
  "tool-mouseDrag": "Drag",
  "tool-mouseScroll": "Scroll",
  "tool-keyboardType": "Type",
  "tool-keyboardPress": "Press key",
  "tool-keyboardHotkey": "Shortcut",
  "tool-findUiElement": "Find UI element",
  "tool-clickUiElement": "Click UI element",
  "tool-viewScreen": "Look at screen",
  "tool-showScreen": "Show screen",
}

function ToolCall({ part }: { part: ToolPart }) {
  // Screenshots for the bot's own eyes stay out of the chat
  if (part.type === "tool-viewScreen") {
    return null
  }

  // The one tool whose result is for the reader: show it, not the call
  if (part.type === "tool-showScreen" && part.state === "output-available") {
    const base64 = part.output.base64
    return (
      <div className="w-full min-w-0 overflow-hidden rounded-md border">
        <Image
          alt="The sandbox's screen"
          base64={base64}
          uint8Array={Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))}
          className="block h-auto w-full shrink-0"
          mediaType={part.output.mediaType}
        />
      </div>
    )
  }

  return (
    <Tool>
      <ToolHeader
        state={part.state}
        title={toolTitles[part.type] ?? part.type}
        type={part.type}
      />
      <ToolContent>
        <ToolCallDetails part={part} />
      </ToolContent>
    </Tool>
  )
}

function ToolCallDetails({ part }: { part: ToolPart }) {
  const error = part.state === "output-error" ? part.errorText : undefined

  if (part.type === "tool-showScreen") {
    return <ToolOutput errorText={error} output={undefined} />
  }

  if (part.type === "tool-bash") {
    return (
      <>
        {part.input?.command ? (
          <CodeBlock code={part.input.command} language="bash" />
        ) : null}
        <ToolOutput
          errorText={error}
          output={
            part.state === "output-available" ? (
              <CodeBlock
                code={part.output.output || `Exit code ${part.output.exitCode}`}
                language="log"
              />
            ) : undefined
          }
        />
      </>
    )
  }

  if (part.type === "tool-runPython") {
    return (
      <>
        {part.input?.code ? (
          <CodeBlock code={part.input.code} language="python" />
        ) : null}
        <ToolOutput
          errorText={error}
          output={
            part.state === "output-available" ? (
              <CodeBlock
                code={part.output.output || `Exit code ${part.output.exitCode}`}
                language="log"
              />
            ) : undefined
          }
        />
      </>
    )
  }

  return (
    <>
      {part.input === undefined ? null : <ToolInput input={part.input} />}
      <ToolOutput
        errorText={error}
        output={part.state === "output-available" ? part.output : undefined}
      />
    </>
  )
}

const starterSuggestions = [
  "Open the browser to https://example.com and show me what you see",
  "List the files in my home directory",
  "What's on the screen right now?",
  "Tell me about this computer (OS, CPU, memory)",
]

// Copy / regenerate actions under each assistant message.
function AssistantActions({
  message,
  isLast,
  onRegenerate,
}: {
  message: SkyeMessage
  isLast: boolean
  onRegenerate: () => void
}) {
  const [copied, setCopied] = useState(false)

  if (message.role !== "assistant") {
    return null
  }

  const text = message.parts
    .filter((part) => part.type === "text")
    .map((part) => (part as { text: string }).text)
    .join("\n\n")

  async function handleCopy() {
    if (!text) {
      return
    }
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard unavailable (permissions or insecure context) — no-op.
    }
  }

  if (!text && !isLast) {
    return null
  }

  return (
    <MessageActions>
      {text ? (
        <MessageAction tooltip="Copy response" onClick={handleCopy}>
          {copied ? (
            <CheckIcon className="size-4" />
          ) : (
            <CopyIcon className="size-4" />
          )}
        </MessageAction>
      ) : null}
      {isLast ? (
        <MessageAction tooltip="Regenerate response" onClick={onRegenerate}>
          <RefreshCcwIcon className="size-4" />
        </MessageAction>
      ) : null}
    </MessageActions>
  )
}

export function Chat({
  chatId,
  name,
  avatarSeed,
  bot,
  initialSession,
}: {
  chatId: string
  name: string
  avatarSeed: string
  bot?: {
    id: string
    name: string
    avatar: string
    job: string
    instructions: string | null
    sandboxId: string | null
  } | null
  initialSession?: ChatSessionState
}) {
  const [scrolled, setScrolled] = useState(false)
  const handleScrolledChange = useCallback((value: boolean) => {
    setScrolled(value)
  }, [])
  // `sessions` restores the session the previous page lifetime cached
  // (PAT + resume cursor). Without it, `reconnectToStream` on mount is a
  // no-op and a refresh mid-turn loses the in-flight answer.
  const transport = useTriggerChatTransport<typeof skyeChat>({
    task: "skye-chat",
    accessToken: ({ chatId }) => mintChatAccessToken(chatId),
    startSession: ({ chatId, clientData }) =>
      startChatSession({ chatId, clientData }),
    clientData: {
      instructions: bot?.instructions ?? undefined,
      botName: bot?.name,
      botJob: bot?.job,
      sandboxId: bot?.sandboxId ?? undefined,
    },
    sessions: initialSession ? { [chatId]: initialSession } : undefined,
    onSessionChange: (id, session) => {
      // Persist reconnect metadata for the next page load; drop the row
      // when the session ends so a reload doesn't retry a dead session.
      // A failed save only costs resume on the next load, never the chat.
      if (session) {
        void saveChatSession(id, {
          publicAccessToken: session.publicAccessToken,
          lastEventId: session.lastEventId,
        }).catch(() => {})
      } else {
        void deleteChatSession(id).catch(() => {})
      }
    },
  })
  const { messages: initialMessages, isLoading } = useLoadTranscript(
    chatId,
    loadChatTranscript,
    { transport }
  )

  return (
    <>
      <ChatHeader
        name={name}
        avatarSeed={avatarSeed}
        bot={bot}
        scrolled={scrolled}
      />
      {isLoading ? null : (
        <ChatBody
          chatId={chatId}
          initialMessages={initialMessages as SkyeMessage[]}
          transport={transport}
          onScrolledChange={handleScrolledChange}
        />
      )}
    </>
  )
}

// Reports the conversation's scroll position upward so the header can cast
// a shadow once the user scrolls down. Renders nothing, so it takes no
// space inside the conversation layout.
function ScrollShadowReporter({
  onChange,
}: {
  onChange: (scrolled: boolean) => void
}) {
  const { scrollRef } = useStickToBottomContext()

  useEffect(() => {
    const el = scrollRef.current
    if (!el) {
      return
    }
    const update = () => onChange(el.scrollTop > 8)
    update()
    el.addEventListener("scroll", update, { passive: true })
    return () => el.removeEventListener("scroll", update)
  }, [scrollRef, onChange])

  return null
}

function ChatBody({
  chatId,
  initialMessages,
  transport,
  onScrolledChange,
}: {
  chatId: string
  initialMessages: SkyeMessage[]
  transport: ReturnType<typeof useTriggerChatTransport>
  onScrolledChange: (scrolled: boolean) => void
}) {
  const {
    messages,
    sendMessage,
    status,
    stop: aiStop,
    error,
    regenerate,
  } = useChat<SkyeMessage>({
    id: chatId,
    transport,
    messages: initialMessages,
    resume: initialMessages.length > 0,
  })

  const stop = () => {
    aiStop()
    transport.stopGeneration(chatId)
  }

  function handleSubmit(message: PromptInputMessage) {
    if (!message.text.trim()) {
      return
    }
    sendMessage({ text: message.text })
  }

  const isStreaming = status === "streaming"

  return (
    <div
      data-slot="chat"
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-clip"
    >
      <Conversation
        className="min-h-0"
        resize={{ damping: 0.85, stiffness: 0.07, mass: 1.2 }}
      >
        <ScrollShadowReporter onChange={onScrolledChange} />
        <ConversationContent className="mx-auto w-full max-w-4xl">
          {messages.length === 0 ? (
            <ConversationEmptyState
              icon={<MessageSquareIcon className="size-6" />}
              title="No messages yet"
              description="Ask me to browse the web, use apps, or work with files on my computer"
            />
          ) : (
            <>
              {messages.map((message, messageIndex) => {
                // Consolidate reasoning parts into one block so multiple
                // reasoning deltas don't render multiple "Thinking..."
                // indicators (per ai-elements reasoning docs).
                const reasoningParts = message.parts.filter(
                  (part) => part.type === "reasoning"
                ) as { text: string }[]
                const reasoningText = reasoningParts
                  .map((part) => part.text)
                  .join("\n\n")
                const lastPart = message.parts.at(-1)
                const isReasoningStreaming =
                  messageIndex === messages.length - 1 &&
                  isStreaming &&
                  lastPart?.type === "reasoning"

                return (
                  <Message from={message.role} key={message.id}>
                    <MessageContent>
                      {reasoningText ? (
                        <Reasoning
                          className="w-full"
                          isStreaming={isReasoningStreaming}
                        >
                          <ReasoningTrigger />
                          <ReasoningContent>{reasoningText}</ReasoningContent>
                        </Reasoning>
                      ) : null}
                      {message.parts.map((part, index) => {
                        if (part.type === "text") {
                          return (
                            <MessageResponse key={index}>
                              {part.text}
                            </MessageResponse>
                          )
                        }
                        if (
                          part.type === "dynamic-tool" ||
                          part.type.startsWith("tool-")
                        ) {
                          return (
                            <ToolCall key={index} part={part as ToolPart} />
                          )
                        }
                        return null
                      })}
                    </MessageContent>
                    <AssistantActions
                      message={message}
                      isLast={messageIndex === messages.length - 1}
                      onRegenerate={() => regenerate()}
                    />
                  </Message>
                )
              })}
              {status === "submitted" && (
                <Message from="assistant">
                  <MessageContent>
                    <Shimmer duration={1}>Thinking...</Shimmer>
                  </MessageContent>
                </Message>
              )}
            </>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {error && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1 py-2 text-sm text-destructive">
          <span
            className="line-clamp-2 min-w-0 flex-1 break-words"
            title={error.message}
          >
            Something went wrong{error.message ? `: ${error.message}` : "."}
          </span>
          <button
            type="button"
            className="shrink-0 underline underline-offset-2"
            onClick={() => regenerate()}
          >
            Retry
          </button>
          <button
            type="button"
            className="shrink-0 underline underline-offset-2"
            onClick={() => sendMessage({ text: "Continue" })}
          >
            Continue
          </button>
        </div>
      )}

      <div className="mx-auto w-full max-w-4xl shrink-0 p-4 pt-0">
        {messages.length === 0 && (
          <Suggestions className="mb-2">
            {starterSuggestions.map((suggestion) => (
              <Suggestion
                key={suggestion}
                suggestion={suggestion}
                onClick={(text) => sendMessage({ text })}
              />
            ))}
          </Suggestions>
        )}
        <PromptInput onSubmit={handleSubmit}>
          <PromptInputTextarea
            className="min-h-8 px-5 py-3"
            placeholder="Send a message..."
          />
          <PromptInputFooter className="justify-end">
            <PromptInputSubmit
              className="rounded-full"
              status={status}
              onStop={stop}
            />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  )
}
