"use client"

import { useChat } from "@ai-sdk/react"
import {
  useLoadTranscript,
  useTriggerChatTransport,
} from "@trigger.dev/sdk/chat/react"
import type { InferChatUIMessageFromTools } from "@trigger.dev/sdk/ai"
import { MessageSquareIcon } from "lucide-react"
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
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message"
import {
  PromptInput,
  type PromptInputMessage,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input"
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
  "tool-readFile": "Read file",
  "tool-writeFile": "Write file",
  "tool-listFiles": "List files",
  "tool-mouseClick": "Click",
  "tool-mouseMove": "Move mouse",
  "tool-mouseScroll": "Scroll",
  "tool-keyboardType": "Type",
  "tool-keyboardPress": "Press key",
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
        title={toolTitles[part.type]}
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
              description="Start a conversation to see messages here"
            />
          ) : (
            messages.map((message) => (
              <Message from={message.role} key={message.id}>
                <MessageContent>
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
              </Message>
            ))
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {error && (
        <div className="flex items-center gap-2 px-1 py-2 text-sm text-destructive">
          <span>Something went wrong.</span>
          <button
            type="button"
            className="underline underline-offset-2"
            onClick={() => regenerate()}
          >
            Retry
          </button>
        </div>
      )}

      <div className="mx-auto w-full max-w-4xl shrink-0 p-4 pt-0">
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
