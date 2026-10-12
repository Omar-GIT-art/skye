import { cookies } from "next/headers"

import { AppSidebar } from "@/components/app-sidebar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const cookieStore = await cookies()
  const sidebarState = cookieStore.get("sidebar_state")?.value
  const defaultOpen = sidebarState === undefined ? true : sidebarState === "true"

  return (
    <SidebarProvider defaultOpen={defaultOpen} className="h-svh overflow-hidden">
      <AppSidebar />
      <SidebarInset>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-x-clip p-4">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}
