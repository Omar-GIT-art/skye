"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { SearchIcon } from "lucide-react"
import { cn } from "cn"

import { ChatAvatar } from "@/components/chat-avatar"
import { Button } from "@/components/ui/button"
import { useSidebar } from "@/components/ui/sidebar"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Kbd } from "@/components/ui/kbd"
import type { SidebarChat } from "@/queries/chats"

export function SidebarSearch({ chats }: { chats: SidebarChat[] }) {
  const [open, setOpen] = React.useState(false)
  const router = useRouter()
  const { state } = useSidebar()

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen((prev) => !prev)
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  return (
    <>
      {state === "collapsed" ? (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setOpen(true)}
          aria-label="Search chats"
          title="Search chats"
          className="size-8 shrink-0 rounded-xl"
        >
          <SearchIcon />
        </Button>
      ) : (
        <Button
          variant="outline"
          onClick={() => setOpen(true)}
          aria-label="Search chats"
          className={cn(
          // Default classes copied from components/ui/input.tsx so the
          // button visually appears as an input.
          "h-8 w-full min-w-0 rounded-xl border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
          // Button affordances: left-aligned placeholder text, shortcut
          // pinned right. Hover stays the button default (outline).
          "cursor-pointer justify-between font-normal text-muted-foreground shadow-none hover:bg-muted hover:text-foreground"
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <SearchIcon data-icon="inline-start" />
          <span className="truncate">Search</span>
        </span>
        <Kbd>⌘K</Kbd>
        </Button>
      )}
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Search chats"
        description="Search for a chat to open..."
      >
        <Command>
          <CommandInput placeholder="Search chats..." />
          <CommandList>
            <CommandEmpty>No chats found.</CommandEmpty>
            <CommandGroup heading="Chats">
              {chats.map((chat) => (
                <CommandItem
                  key={chat.id}
                  value={`${chat.name} ${chat.lastMessagePreview ?? ""}`}
                  onSelect={() => {
                    setOpen(false)
                    router.push(`/chats/${chat.id}`)
                  }}
                  className="py-2 cursor-pointer"
                >
                  <ChatAvatar
                    seed={chat.avatarSeed}
                    className="size-6 shrink-0 rounded-full"
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate font-medium">{chat.name}</span>
                    {chat.lastMessagePreview ? (
                      <span className="truncate text-xs text-muted-foreground">
                        {chat.lastMessagePreview}
                      </span>
                    ) : null}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  )
}
