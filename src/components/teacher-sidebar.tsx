import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Users, FileText, BookMarked, ClipboardList, Database, FileCheck, GraduationCap, BarChart3, Settings, LogOut } from 'lucide-react'
import { LogoMark } from '@/components/logo-mark'
import { useAuth } from '@/contexts/auth-context'
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarGroupContent, SidebarHeader, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarSeparator } from '@/components/ui/sidebar'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

const navItems = [
  { to: '/teacher/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/teacher/classes', label: 'Kelas Saya', icon: Users },
  { to: '/teacher/materials', label: 'Bahan Ajar', icon: FileText },
  { to: '/teacher/modules', label: 'Modul Ajar', icon: BookMarked },
  { to: '/teacher/assignments', label: 'Tugas', icon: ClipboardList },
  { to: '/teacher/question-banks', label: 'Bank Soal', icon: Database },
  { to: '/teacher/exams', label: 'Ujian Online', icon: FileCheck },
  { to: '/teacher/grading', label: 'Penilaian', icon: GraduationCap },
  { to: '/teacher/analytics', label: 'Nilai & Analisis', icon: BarChart3 },
  { to: '/teacher/settings', label: 'Pengaturan', icon: Settings },
]

export function TeacherSidebar() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const initials = profile?.full_name?.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() ?? 'G'

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <LogoMark className="size-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-base font-bold leading-tight text-sidebar-foreground">RuangAjar</span>
            <span className="text-xs text-muted-foreground">Panel Guru</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu Utama</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton asChild>
                    <NavLink to={item.to}>
                      <item.icon />
                      <span>{item.label}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarSeparator />
        <div className="flex items-center gap-2 px-2 py-1">
          <Avatar size="sm">
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium text-sidebar-foreground">{profile?.full_name || 'Guru'}</span>
            <span className="text-xs text-muted-foreground">Guru</span>
          </div>
          <button onClick={handleSignOut} className="text-muted-foreground hover:text-foreground" aria-label="Keluar">
            <LogOut className="size-4" />
          </button>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
