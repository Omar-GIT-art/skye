import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import { SidebarNewMenu } from "./sidebar-new-menu"
import { SidebarSearch } from "./sidebar-search"
import { SidebarChats } from "./sidebar-chats"
import { UserMenu } from "./user-menu"
import { getUserChats } from "@/queries/chats"

export async function AppSidebar() {
  const chats = await getUserChats()

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="group-data-[collapsible=icon]:items-center">
        <div className="flex flex-row items-center justify-start group-data-[collapsible=icon]:justify-center">
          <SidebarNewMenu />
        </div>
        <SidebarSearch chats={chats} />
      </SidebarHeader>
      <SidebarContent>
        <SidebarChats chats={chats} />
        <SidebarGroup />
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <UserMenu />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
