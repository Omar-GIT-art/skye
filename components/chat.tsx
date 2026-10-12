"use client"

import { useChat } from "@ai-sdk/react"
import {
  useLoadTranscript,
  useTriggerChatTransport,
  type InferChatUIMessage,
} from "@trigger.dev/sdk/chat/react"
import { MessageSquareIcon } from "lucide-react"

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation"
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message"
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input"
import {
  deleteChatSession,
  loadChatTranscript,
  mintChatAccessToken,
  saveChatSession,
  startChatSession,
  type ChatSessionState,
} from "@/actions/chat"
import type { skyeChat } from "@/trigger/chat"

type SkyeMessage = InferChatUIMessage<typeof skyeChat>

export function Chat({
  chatId,
  instructions,
  initialSession,
}: {
  chatId: string
  instructions?: string | null
  initialSession?: ChatSessionState
}) {
  // `sessions` restores the session the previous page lifetime cached
  // (PAT + resume cursor). Without it, `reconnectToStream` on mount is a
  // no-op and a refresh mid-turn loses the in-flight answer.
  const transport = useTriggerChatTransport<typeof skyeChat>({
    task: "skye-chat",
    accessToken: ({ chatId }) => mintChatAccessToken(chatId),
    startSession: ({ chatId, clientData }) =>
      startChatSession({ chatId, clientData }),
    clientData: { instructions: instructions ?? undefined },
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

  if (isLoading) {
    return null
  }

  return (
    <ChatBody
      chatId={chatId}
      initialMessages={initialMessages}
      transport={transport}
    />
  )
}

function ChatBody({
  chatId,
  initialMessages,
  transport,
}: {
  chatId: string
  initialMessages: SkyeMessage[]
  transport: ReturnType<typeof useTriggerChatTransport>
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Conversation className="min-h-0">
        <ConversationContent>
          {messages.length === 0 ? (
            <ConversationEmptyState
              icon={<MessageSquareIcon className="size-6" />}
              title="No messages yet"
              description="Start a conversation to see messages here"
            />
          ) : (
            messages.map((message) => (
              <Message key={message.id} from={message.role}>
                <MessageContent>
                  {message.parts.map((part, index) =>
                    part.type === "text" ? (
                      <MessageResponse key={index}>{part.text}</MessageResponse>
                    ) : null
                  )}
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

      <PromptInput
        className="mt-2"
        onSubmit={({ text }) => {
          if (text.trim()) {
            sendMessage({ text })
          }
        }}
      >
        <PromptInputTextarea placeholder="Type a message..." />
        <PromptInputFooter>
          <div />
          <PromptInputSubmit status={status} onStop={stop} />
        </PromptInputFooter>
      </PromptInput>
    </div>
  )
}
