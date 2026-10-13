import { auth } from "@clerk/nextjs/server"
import { notFound } from "next/navigation"

import { Chat } from "@/components/chat"
import { ChatMainPanel } from "@/components/chat-main-panel"
import { ChatPanelHandle } from "@/components/chat-panel-handle"
import { ChatPanelProvider } from "@/components/chat-panel-context"
import { ChatSidePanel } from "@/components/chat-side-panel"
import { SandboxDesktopProvider } from "@/components/sandbox-desktop"
import { ResizablePanelGroup } from "@/components/ui/resizable"
import { getChatSession } from "@/actions/chat"
import { getChatById } from "@/queries/chats"

export default async function Page({
  params,
}: {
  params: Promise<{ chatId: string }>
}) {
  await auth.protect()
  const { chatId } = await params
  const chat = await getChatById(chatId)
  if (!chat) {
    notFound()
  }
  const initialSession = await getChatSession(chatId)

  return (
    <ChatPanelProvider>
      <SandboxDesktopProvider chatId={chat.id}>
        <ResizablePanelGroup
          orientation="horizontal"
          className="-m-4 min-h-0 flex-1"
        >
        <ChatMainPanel>
          <div className="flex h-full min-h-0 flex-col">
            <Chat
              key={chat.id}
              chatId={chat.id}
              name={chat.name}
              avatarSeed={chat.avatarSeed}
              bot={chat.bot}
              initialSession={initialSession}
            />
          </div>
        </ChatMainPanel>
        <ChatPanelHandle />
        <ChatSidePanel />
      </ResizablePanelGroup>
      </SandboxDesktopProvider>
    </ChatPanelProvider>
  )
}
