import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { SidebarNewMenu } from "./sidebar-new-menu"
import { SidebarChats } from "./sidebar-chats"
import { UserMenu } from "./user-menu"

export function AppSidebar() {
  return (
    <Sidebar>
      <SidebarHeader className="flex-row items-center justify-start">
        <SidebarNewMenu />
      </SidebarHeader>
      <SidebarContent>
        <SidebarChats />
        <SidebarGroup />
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <UserMenu />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
