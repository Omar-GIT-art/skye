"use client"

import * as React from "react"
import { PlusIcon, UsersIcon } from "lucide-react"

import { BotDialog } from "@/components/bot-dialog"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function SidebarNewMenu() {
  const [botOpen, setBotOpen] = React.useState(false)

  return (
    <div className="flex w-full flex-row items-center justify-between gap-1 group-data-[collapsible=icon]:w-auto group-data-[collapsible=icon]:flex-col">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              aria-label="New"
              className="rounded-xl"
            />
          }
        >
          <PlusIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuItem
              onClick={() => setBotOpen(true)}
              className="cursor-pointer"
            >
              <PlusIcon />
              Create new bot
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer">
              <UsersIcon />
              Create group chat
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <ThemeToggle />
      <BotDialog open={botOpen} onOpenChange={setBotOpen} />
    </div>
  )
}
