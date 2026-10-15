import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/auth-context'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { FileText, BookMarked, ClipboardList, FileCheck, Clock, ArrowRight } from 'lucide-react'

interface UpcomingItem {
  id: string
  title: string
  type: 'assignment' | 'exam'
  when: string | null
  note: string
  class_name: string
  urgent?: boolean
}

export function StudentDashboard() {
  const { user, profile } = useAuth()
  const [classCount, setClassCount] = useState(0)
  const [materialCount, setMaterialCount] = useState(0)
  const [moduleCount, setModuleCount] = useState(0)
  const [assignmentCount, setAssignmentCount] = useState(0)
  const [examCount, setExamCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [upcoming, setUpcoming] = useState<UpcomingItem[]>([])

  useEffect(() => { if (user) loadData() }, [user])

  async function loadData() {
    if (!user) return

    const { data: memberships } = await supabase.from('class_members').select('class_id').eq('student_id', user.id).eq('membership_status', 'active')
    const classIds = memberships?.map(m => m.class_id) ?? []
    if (classIds.length === 0) { setLoading(false); return }

    const { data: classesData } = await supabase.from('classes').select('id, name').in('id', classIds).eq('is_archived', false)
    setClassCount(classesData?.length ?? 0)
    const classNameMap = new Map((classesData ?? []).map(c => [c.id, c.name]))
    const activeClassIds = [...classNameMap.keys()]
    if (activeClassIds.length === 0) { setLoading(false); return }

    const [matLinks, modLinks, assignRes, examLinks, subsRes, attemptsRes] = await Promise.all([
      supabase.from('class_materials').select('material_id').in('class_id', activeClassIds),
      supabase.from('class_modules').select('module_id').in('class_id', activeClassIds),
      supabase.from('assignments').select('id, title, class_id, due_at').in('class_id', activeClassIds).eq('status', 'published'),
      supabase.from('exam_classes').select('exam_id, class_id').in('class_id', activeClassIds),
      supabase.from('assignment_submissions').select('assignment_id').eq('student_id', user.id),
      supabase.from('exam_attempts').select('exam_id').eq('student_id', user.id),
    ])

    // hitung hanya yang benar-benar terbit (tautan kelas juga mencakup materi/modul berstatus draf)
    const matIds = [...new Set(matLinks.data?.map(m => m.material_id) ?? [])]
    const modIds = [...new Set(modLinks.data?.map(m => m.module_id) ?? [])]
    const [matCount, modCount] = await Promise.all([
      matIds.length ? supabase.from('materials').select('id', { count: 'exact', head: true }).in('id', matIds).eq('visibility_status', 'published') : Promise.resolve({ count: 0 }),
      modIds.length ? supabase.from('teaching_modules').select('id', { count: 'exact', head: true }).in('id', modIds).eq('status', 'published') : Promise.resolve({ count: 0 }),
    ])
    setMaterialCount(matCount.count ?? 0)
    setModuleCount(modCount.count ?? 0)

    const submitted = new Set((subsRes.data ?? []).map(s => s.assignment_id))
    const pending = (assignRes.data ?? []).filter(a => !submitted.has(a.id))
    setAssignmentCount(pending.length)

    const now = new Date()
    const items: UpcomingItem[] = []
    pending.forEach(a => {
      const overdue = !!a.due_at && new Date(a.due_at) < now
      items.push({ id: a.id, title: a.title, type: 'assignment', when: a.due_at, class_name: classNameMap.get(a.class_id) ?? '',
        note: overdue ? 'Lewat tenggat' : a.due_at ? 'Tenggat' : 'Tanpa tenggat', urgent: overdue })
    })

    const examIds = [...new Set(examLinks.data?.map(e => e.exam_id) ?? [])]
    if (examIds.length > 0) {
      const { data: examData } = await supabase.from('exams').select('id, title, start_at, end_at, max_attempts').in('id', examIds).eq('status', 'published')
      const attemptCount = new Map<string, number>()
      ;(attemptsRes.data ?? []).forEach(a => attemptCount.set(a.exam_id, (attemptCount.get(a.exam_id) ?? 0) + 1))
      const classOf = new Map<string, string>()
      ;(examLinks.data ?? []).forEach(ec => { if (!classOf.has(ec.exam_id)) classOf.set(ec.exam_id, classNameMap.get(ec.class_id) ?? '') })

      let available = 0
      ;(examData ?? []).forEach(e => {
        const started = !e.start_at || new Date(e.start_at) <= now
        const ended = !!e.end_at && new Date(e.end_at) < now
        const hasQuota = (attemptCount.get(e.id) ?? 0) < e.max_attempts
        if (started && !ended && hasQuota) {
          available++
          items.push({ id: e.id, title: e.title, type: 'exam', when: e.end_at, class_name: classOf.get(e.id) ?? '', note: e.end_at ? 'Tersedia, sampai' : 'Tersedia sekarang', urgent: true })
        } else if (!started) {
          items.push({ id: e.id, title: e.title, type: 'exam', when: e.start_at, class_name: classOf.get(e.id) ?? '', note: 'Mulai' })
        }
      })
      setExamCount(available)
    }

    // yang mendesak/terdekat dulu; tanpa tanggal di akhir
    items.sort((a, b) => (a.when ? new Date(a.when).getTime() : Infinity) - (b.when ? new Date(b.when).getTime() : Infinity))
    setUpcoming(items.slice(0, 6))
    setLoading(false)
  }

  const statCards = [
    { label: 'Kelas', value: classCount, icon: BookMarked, to: '/student/materials' },
    { label: 'Bahan Ajar', value: materialCount, icon: FileText, to: '/student/materials' },
    { label: 'Modul', value: moduleCount, icon: BookMarked, to: '/student/modules' },
    { label: 'Tugas belum dikumpulkan', value: assignmentCount, icon: ClipboardList, to: '/student/assignments' },
    { label: 'Ujian tersedia', value: examCount, icon: FileCheck, to: '/student/exams' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Halo, {profile?.full_name || 'Siswa'}! Selamat belajar.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {statCards.map((card) => (
          <Link key={card.label} to={card.to}>
            <Card className="h-full transition-shadow hover:shadow-md">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-primary"><card.icon className="size-5" /></div>
                <div className="min-w-0">
                  <p className="text-2xl font-bold leading-tight">{loading ? '...' : card.value}</p>
                  <p className="text-xs leading-tight text-muted-foreground">{card.label}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Yang Perlu Dikerjakan</CardTitle>
          <CardDescription>Tugas yang belum dikumpulkan dan ujian yang tersedia atau akan datang</CardDescription>
        </CardHeader>
        <CardContent>
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">Tidak ada tugas atau ujian yang menunggu</p>
          ) : (
            <div className="space-y-3">
              {upcoming.map((item) => (
                <Link key={`${item.type}-${item.id}`} to={item.type === 'exam' ? '/student/exams' : '/student/assignments'}
                  className="flex items-center justify-between gap-2 border-b pb-2 last:border-0 hover:text-primary">
                  <div className="flex items-center gap-3">
                    {item.type === 'exam' ? <FileCheck className="size-4 text-primary" /> : <ClipboardList className="size-4 text-primary" />}
                    <div>
                      <p className="text-sm font-medium">{item.title}</p>
                      <p className="text-xs text-muted-foreground">{item.class_name}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={item.type === 'exam' ? 'default' : 'secondary'}>{item.type === 'exam' ? 'Ujian' : 'Tugas'}</Badge>
                    <span className={`flex items-center gap-1 text-xs ${item.urgent && item.note === 'Lewat tenggat' ? 'text-destructive' : 'text-muted-foreground'}`}>
                      <Clock className="size-3" />
                      {item.note}{item.when ? ` ${new Date(item.when).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}
                    </span>
                    <ArrowRight className="size-3 text-muted-foreground" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
