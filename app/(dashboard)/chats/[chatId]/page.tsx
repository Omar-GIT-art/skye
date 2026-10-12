import { auth } from "@clerk/nextjs/server"
import { notFound } from "next/navigation"

import { ChatHeader } from "@/components/chat-header"
import { Chat } from "@/components/chat"
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

  return (
    <>
      <ChatHeader name={chat.name} avatarSeed={chat.avatarSeed} bot={chat.bot} />
      <Chat instructions={chat.bot?.instructions} />
    </>
  )
}
