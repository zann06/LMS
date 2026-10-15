import { Outlet } from 'react-router-dom'
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar'
import { TeacherSidebar } from '@/components/teacher-sidebar'
import { Separator } from '@/components/ui/separator'

export function TeacherLayout() {
  return (
    <SidebarProvider>
      <TeacherSidebar />
      <SidebarInset>
        <header className="flex h-14 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <div className="flex-1" />
        </header>
        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
