import { auth } from "@clerk/nextjs/server"
import { UserButton } from "@clerk/nextjs"
import { nanoid } from "nanoid"
import { BotDialog } from "@/components/bot-dialog"
import { ChatAvatar } from "@/components/chat-avatar"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"

export default async function Page() {
  await auth.protect()
  return (
    <div className="flex min-h-svh flex-col p-6">
      <header className="flex items-center justify-end gap-2">
        <UserButton />
      </header>
      <main className="flex flex-1 items-center justify-center">
        <Empty className="max-w-lg gap-6 border-0">
          <EmptyHeader className="gap-3">
            <EmptyMedia>
              <ChatAvatar seed={nanoid()} className="size-14 rounded-full" />
            </EmptyMedia>
            <EmptyTitle className="text-xl font-semibold">
              Say hello to your first bot
            </EmptyTitle>
            <EmptyDescription className="text-base">
              Give it a personality, a memory, and a face. Spin one up and
              start the conversation.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent className="gap-3">
            <BotDialog />
          </EmptyContent>
        </Empty>
      </main>
    </div>
  )
}
