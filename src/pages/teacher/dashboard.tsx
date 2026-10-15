import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/auth-context'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Users, FileText, BookMarked, ClipboardList, FileCheck, GraduationCap, Clock, TrendingUp, Plus } from 'lucide-react'

interface Stats {
  classCount: number
  studentCount: number
  materialCount: number
  moduleCount: number
  activeAssignments: number
  upcomingExams: number
  ungradedSubmissions: number
  ungradedEssays: number
}

interface ClassItem {
  id: string
  name: string
}

export function TeacherDashboard() {
  const { user } = useAuth()
  // null = semua kelas
  const [selectedClass, setSelectedClass] = useState<string | null>(null)
  const [classes, setClasses] = useState<ClassItem[]>([])
  const [stats, setStats] = useState<Stats>({
    classCount: 0, studentCount: 0, materialCount: 0, moduleCount: 0,
    activeAssignments: 0, upcomingExams: 0, ungradedSubmissions: 0, ungradedEssays: 0,
  })
  const [loading, setLoading] = useState(true)
  const [recentActivity, setRecentActivity] = useState<{ id: string; title: string; subtitle: string; time: string }[]>([])

  // daftar kelas untuk dropdown — cukup dimuat sekali
  useEffect(() => {
    if (user) loadClasses()
  }, [user])

  useEffect(() => {
    if (!user) return
    loadStats()
    loadActivity()
  }, [user, selectedClass])

  async function loadClasses() {
    if (!user) return
    const { data } = await supabase
      .from('classes')
      .select('id, name')
      .eq('teacher_id', user.id)
      .eq('is_archived', false)
      .order('name')
    setClasses((data ?? []).map(c => ({ id: c.id, name: c.name })))
  }

  async function loadStats() {
    if (!user) return

    // Semua kelas aktif milik guru (untuk jumlah kelas & filter)
    const { data: classRows } = await supabase
      .from('classes').select('id').eq('teacher_id', user.id).eq('is_archived', false)
    const allClassIds = (classRows ?? []).map(c => c.id)
    const scopeClassIds = selectedClass ? [selectedClass] : allClassIds

    // Siswa aktif
    const membersResult = scopeClassIds.length > 0
      ? await supabase.from('class_members').select('id', { count: 'exact', head: true })
          .eq('membership_status', 'active').in('class_id', scopeClassIds)
      : { count: 0 }

    // Bahan ajar
    let materialCount = 0
    if (selectedClass) {
      const { data: links } = await supabase.from('class_materials').select('material_id').eq('class_id', selectedClass)
      const ids = (links ?? []).map(l => l.material_id)
      if (ids.length > 0) {
        const { count } = await supabase.from('materials').select('id', { count: 'exact', head: true })
          .in('id', ids).neq('visibility_status', 'archived')
        materialCount = count ?? 0
      }
    } else {
      const { count } = await supabase.from('materials').select('id', { count: 'exact', head: true })
        .eq('teacher_id', user.id).neq('visibility_status', 'archived')
      materialCount = count ?? 0
    }

    // Modul ajar
    let moduleCount = 0
    if (selectedClass) {
      const { data: links } = await supabase.from('class_modules').select('module_id').eq('class_id', selectedClass)
      const ids = (links ?? []).map(l => l.module_id)
      if (ids.length > 0) {
        const { count } = await supabase.from('teaching_modules').select('id', { count: 'exact', head: true })
          .in('id', ids).neq('status', 'archived')
        moduleCount = count ?? 0
      }
    } else {
      const { count } = await supabase.from('teaching_modules').select('id', { count: 'exact', head: true })
        .eq('teacher_id', user.id).neq('status', 'archived')
      moduleCount = count ?? 0
    }

    // Tugas aktif + id-nya (dipakai untuk menghitung yang belum dinilai)
    let assignmentQuery = supabase.from('assignments').select('id').eq('teacher_id', user.id).eq('status', 'published')
    if (selectedClass) assignmentQuery = assignmentQuery.eq('class_id', selectedClass)
    const { data: assignmentRows } = await assignmentQuery
    const assignmentIds = (assignmentRows ?? []).map(a => a.id)

    let ungradedSubmissions = 0
    if (assignmentIds.length > 0) {
      const { count } = await supabase.from('assignment_submissions').select('id', { count: 'exact', head: true })
        .is('score', null).in('assignment_id', assignmentIds)
      ungradedSubmissions = count ?? 0
    }

    // Ujian mendatang
    let examQuery = supabase.from('exams').select('id, start_at').eq('teacher_id', user.id).eq('status', 'published')
    if (selectedClass) {
      const { data: links } = await supabase.from('exam_classes').select('exam_id').eq('class_id', selectedClass)
      const ids = (links ?? []).map(l => l.exam_id)
      examQuery = examQuery.in('id', ids.length > 0 ? ids : ['00000000-0000-0000-0000-000000000000'])
    }
    const { data: examRows } = await examQuery
    const now = new Date()
    const upcoming = (examRows ?? []).filter(e => e.start_at && new Date(e.start_at) > now).length

    // ujian yang sudah dikumpulkan siswa dan menunggu nilai esai
    let ungradedEssays = 0
    let pendingExamQuery = supabase.from('exams').select('id').eq('teacher_id', user.id)
    if (selectedClass) {
      const { data: links } = await supabase.from('exam_classes').select('exam_id').eq('class_id', selectedClass)
      const ids = (links ?? []).map(l => l.exam_id)
      pendingExamQuery = pendingExamQuery.in('id', ids.length > 0 ? ids : ['00000000-0000-0000-0000-000000000000'])
    }
    const { data: teacherExams } = await pendingExamQuery
    const teacherExamIds = (teacherExams ?? []).map(e => e.id)
    if (teacherExamIds.length > 0) {
      const { count } = await supabase.from('exam_attempts').select('id', { count: 'exact', head: true })
        .eq('status', 'awaiting_grading').in('exam_id', teacherExamIds)
      ungradedEssays = count ?? 0
    }

    setStats({
      classCount: allClassIds.length,
      studentCount: membersResult.count ?? 0,
      materialCount,
      moduleCount,
      activeAssignments: assignmentIds.length,
      upcomingExams: upcoming,
      ungradedSubmissions,
      ungradedEssays,
    })
    setLoading(false)
  }

  async function loadActivity() {
    if (!user) return
    const { data: recentExams } = await supabase
      .from('exams')
      .select('id, title, created_at')
      .eq('teacher_id', user.id)
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(5)

    const { data: recentMaterials } = await supabase
      .from('materials')
      .select('id, title, created_at')
      .eq('teacher_id', user.id)
      .neq('visibility_status', 'archived')
      .order('created_at', { ascending: false })
      .limit(5)

    const activities: { id: string; title: string; subtitle: string; time: string }[] = []
    recentMaterials?.forEach(m => activities.push({ id: m.id, title: `Materi: ${m.title}`, subtitle: 'Bahan ajar baru', time: m.created_at }))
    recentExams?.forEach(e => activities.push({ id: e.id, title: `Ujian: ${e.title}`, subtitle: 'Ujian dibuat', time: e.created_at }))
    activities.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
    setRecentActivity(activities.slice(0, 6))
  }

  const statCards = [
    { label: 'Kelas Aktif', value: stats.classCount, icon: Users, to: '/teacher/classes' },
    { label: 'Siswa Aktif', value: stats.studentCount, icon: Users, to: '/teacher/classes' },
    { label: 'Bahan Ajar', value: stats.materialCount, icon: FileText, to: '/teacher/materials' },
    { label: 'Modul Ajar', value: stats.moduleCount, icon: BookMarked, to: '/teacher/modules' },
    { label: 'Tugas Aktif', value: stats.activeAssignments, icon: ClipboardList, to: '/teacher/assignments' },
    { label: 'Ujian Mendatang', value: stats.upcomingExams, icon: FileCheck, to: '/teacher/exams' },
    { label: 'Tugas Belum Dinilai', value: stats.ungradedSubmissions, icon: GraduationCap, to: '/teacher/grading' },
    { label: 'Ujian Perlu Dinilai', value: stats.ungradedEssays, icon: Clock, to: '/teacher/grading' },
  ]

  const quickActions = [
    { label: 'Tambah Materi', to: '/teacher/materials', icon: FileText },
    { label: 'Buat Modul', to: '/teacher/modules', icon: BookMarked },
    { label: 'Buat Tugas', to: '/teacher/assignments', icon: ClipboardList },
    { label: 'Buat Soal', to: '/teacher/question-banks', icon: Plus },
    { label: 'Buat Ujian', to: '/teacher/exams', icon: FileCheck },
    { label: 'Rekap Nilai', to: '/teacher/analytics', icon: TrendingUp },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 mb-4">
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        
        <div className="relative">
          <select
            value={selectedClass ?? ''}
            onChange={(e) => setSelectedClass(e.target.value || null)}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">Semua kelas</option>
            {classes.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {statCards.map((card) => (
          <Link key={card.label} to={card.to}>
            <Card className="transition-shadow hover:shadow-md">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
                  <card.icon className="size-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-2xl font-bold leading-tight">{loading ? '...' : card.value}</p>
                  <p className="truncate text-xs text-muted-foreground">{card.label}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Quick actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Akses Cepat</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {quickActions.map((action) => (
              <Button key={action.label} variant="outline" size="sm" asChild>
                <Link to={action.to}>
                  <action.icon className="size-4" />
                  {action.label}
                </Link>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recent activity */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Aktivitas Terbaru</CardTitle>
          <CardDescription>Aktivitas pembelajaran terkini</CardDescription>
        </CardHeader>
        <CardContent>
          {recentActivity.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada aktivitas</p>
          ) : (
            <div className="space-y-3">
              {recentActivity.map((activity) => (
                <div key={activity.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                  <div>
                    <p className="text-sm font-medium">{activity.title}</p>
                    <p className="text-xs text-muted-foreground">{activity.subtitle}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(activity.time).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
