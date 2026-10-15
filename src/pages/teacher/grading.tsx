import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/auth-context'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { GraduationCap, Eye, FileCheck } from 'lucide-react'

interface SubmissionRow {
  id: string; assignment_id: string; student_id: string; submission_text: string | null
  submitted_at: string; score: number | null; feedback: string | null
}
interface AssignmentInfo { id: string; title: string; class_id: string; max_score?: number }
interface PendingExam { attemptId: string; examId: string; examTitle: string; studentName: string; submittedAt: string | null }

export function GradingPage() {
  const { user } = useAuth()
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([])
  const [assignments, setAssignments] = useState<Map<string, AssignmentInfo>>(new Map())
  const [students, setStudents] = useState<Map<string, string>>(new Map())
  const [pendingExams, setPendingExams] = useState<PendingExam[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'ungraded' | 'all'>('ungraded')
  const [assignmentFilter, setAssignmentFilter] = useState('all')
  const [gradingId, setGradingId] = useState<string | null>(null)
  const [gradeScore, setGradeScore] = useState('')
  const [gradeFeedback, setGradeFeedback] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (user) { loadSubmissions(); loadPendingExams() } }, [user])

  async function loadSubmissions() {
    if (!user) return
    const { data: assignData } = await supabase.from('assignments').select('id, title, class_id, max_score').eq('teacher_id', user.id)
    const assignMap = new Map<string, AssignmentInfo>()
    ;(assignData ?? []).forEach(a => assignMap.set(a.id, a))
    setAssignments(assignMap)

    if (assignData && assignData.length > 0) {
      const { data: subs } = await supabase.from('assignment_submissions').select('*').in('assignment_id', assignData.map(a => a.id)).order('submitted_at', { ascending: false })
      const subData = (subs ?? []) as SubmissionRow[]
      setSubmissions(subData)
      const ids = [...new Set(subData.map(s => s.student_id))]
      if (ids.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', ids)
        setStudents(prev => { const m = new Map(prev); (profiles ?? []).forEach(p => m.set(p.id, p.full_name)); return m })
      }
    }
    setLoading(false)
  }

  /** Ujian yang menunggu nilai esai (butuh tindakan guru di halaman detail ujian). */
  async function loadPendingExams() {
    if (!user) return
    const { data: exams } = await supabase.from('exams').select('id, title').eq('teacher_id', user.id)
    if (!exams || exams.length === 0) { setPendingExams([]); return }
    const { data: attempts } = await supabase.from('exam_attempts').select('id, exam_id, student_id, submitted_at').in('exam_id', exams.map(e => e.id)).eq('status', 'awaiting_grading').order('submitted_at', { ascending: true })
    const rows = attempts ?? []
    if (rows.length === 0) { setPendingExams([]); return }
    const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', [...new Set(rows.map(a => a.student_id))])
    const names = new Map((profiles ?? []).map(p => [p.id, p.full_name]))
    const titles = new Map(exams.map(e => [e.id, e.title]))
    setPendingExams(rows.map(a => ({ attemptId: a.id, examId: a.exam_id, examTitle: titles.get(a.exam_id) ?? '-', studentName: names.get(a.student_id) ?? 'Tidak dikenal', submittedAt: a.submitted_at })))
  }

  function openGrading(sub: SubmissionRow) {
    setGradingId(sub.id); setGradeScore(sub.score?.toString() ?? ''); setGradeFeedback(sub.feedback ?? '')
  }

  async function handleGrade() {
    if (!gradingId) return
    const sub = submissions.find(s => s.id === gradingId)
    const max = (sub && assignments.get(sub.assignment_id)?.max_score) ?? 100
    const score = parseFloat(gradeScore)
    if (gradeScore.trim() === '' || !Number.isFinite(score)) { toast.error('Isi nilai terlebih dahulu'); return }
    if (score < 0 || score > max) { toast.error(`Nilai harus antara 0 dan ${max}`); return }
    setSaving(true)
    const { error } = await supabase.rpc('grade_assignment_submission', { p_submission_id: gradingId, p_score: score, p_feedback: gradeFeedback })
    setSaving(false)
    if (error) { toast.error('Gagal menyimpan nilai: ' + error.message); return }
    setGradingId(null)
    toast.success('Nilai disimpan')
    loadSubmissions()
  }

  const ungraded = submissions.filter(s => s.score === null)
  const graded = submissions.filter(s => s.score !== null)
  const shown = submissions.filter(s => (filter === 'all' || s.score === null) && (assignmentFilter === 'all' || s.assignment_id === assignmentFilter))
  const gradingSub = gradingId ? submissions.find(s => s.id === gradingId) : null
  const gradingMax = (gradingSub && assignments.get(gradingSub.assignment_id)?.max_score) ?? 100

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold tracking-tight">Penilaian</h1><p className="text-sm text-muted-foreground">Koreksi tugas dan esai ujian siswa</p></div>

      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="flex items-center gap-3 p-4"><GraduationCap className="size-5 text-primary" /><div><p className="text-2xl font-bold">{ungraded.length}</p><p className="text-xs text-muted-foreground">Tugas belum dinilai</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4"><GraduationCap className="size-5 text-muted-foreground" /><div><p className="text-2xl font-bold">{graded.length}</p><p className="text-xs text-muted-foreground">Tugas sudah dinilai</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4"><FileCheck className="size-5 text-primary" /><div><p className="text-2xl font-bold">{pendingExams.length}</p><p className="text-xs text-muted-foreground">Ujian menunggu nilai esai</p></div></CardContent></Card>
      </div>

      <Tabs defaultValue="assignments">
        <TabsList>
          <TabsTrigger value="assignments">Tugas</TabsTrigger>
          <TabsTrigger value="exams">Esai Ujian{pendingExams.length > 0 && ` (${pendingExams.length})`}</TabsTrigger>
        </TabsList>

        <TabsContent value="assignments" className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Select value={filter} onValueChange={(v) => setFilter(v as 'ungraded' | 'all')}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="ungraded">Belum dinilai</SelectItem><SelectItem value="all">Semua</SelectItem></SelectContent>
            </Select>
            <Select value={assignmentFilter} onValueChange={setAssignmentFilter}>
              <SelectTrigger className="w-56"><SelectValue placeholder="Semua tugas" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua tugas</SelectItem>
                {[...assignments.values()].map(a => <SelectItem key={a.id} value={a.id}>{a.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {loading ? <p className="text-muted-foreground">Memuat...</p> : shown.length === 0 ? (
            <Empty><EmptyHeader><EmptyTitle>{filter === 'ungraded' ? 'Semua sudah dinilai' : 'Belum ada pengumpulan'}</EmptyTitle><EmptyDescription>{filter === 'ungraded' ? 'Tidak ada pengumpulan tugas yang menunggu nilai' : 'Belum ada siswa yang mengumpulkan tugas'}</EmptyDescription></EmptyHeader></Empty>
          ) : (
            <Card><CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>Siswa</TableHead><TableHead>Tugas</TableHead><TableHead>Dikumpulkan</TableHead><TableHead>Nilai</TableHead><TableHead className="text-right">Aksi</TableHead></TableRow></TableHeader>
                <TableBody>
                  {shown.map(s => {
                    const a = assignments.get(s.assignment_id)
                    return (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{students.get(s.student_id) ?? 'Tidak dikenal'}</TableCell>
                        <TableCell>{a?.title ?? '-'}</TableCell>
                        <TableCell>{new Date(s.submitted_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</TableCell>
                        <TableCell>{s.score != null ? <Badge variant="default">{s.score}/{a?.max_score ?? 100}</Badge> : <Badge variant="secondary">Belum</Badge>}</TableCell>
                        <TableCell className="text-right"><Button variant="ghost" size="sm" onClick={() => openGrading(s)}><Eye className="size-4" /> Nilai</Button></TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent></Card>
          )}
        </TabsContent>

        <TabsContent value="exams">
          {pendingExams.length === 0 ? (
            <Empty><EmptyHeader><EmptyTitle>Tidak ada esai yang menunggu</EmptyTitle><EmptyDescription>Esai ujian yang sudah dikumpulkan siswa akan muncul di sini</EmptyDescription></EmptyHeader></Empty>
          ) : (
            <Card><CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>Siswa</TableHead><TableHead>Ujian</TableHead><TableHead>Dikumpulkan</TableHead><TableHead className="text-right">Aksi</TableHead></TableRow></TableHeader>
                <TableBody>
                  {pendingExams.map(p => (
                    <TableRow key={p.attemptId}>
                      <TableCell className="font-medium">{p.studentName}</TableCell>
                      <TableCell>{p.examTitle}</TableCell>
                      <TableCell>{p.submittedAt ? new Date(p.submittedAt).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-'}</TableCell>
                      <TableCell className="text-right"><Button variant="ghost" size="sm" asChild><Link to={`/teacher/exams/${p.examId}`}>Nilai esai</Link></Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent></Card>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!gradingId} onOpenChange={(o) => { if (!o) setGradingId(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nilai Pengumpulan</DialogTitle><DialogDescription>Nilai maksimum {gradingMax}</DialogDescription></DialogHeader>
          {gradingSub && (
            <div className="space-y-4">
              <div className="rounded-md bg-muted/30 p-3">
                <p className="text-sm font-medium">{students.get(gradingSub.student_id)}</p>
                <p className="text-xs text-muted-foreground">{assignments.get(gradingSub.assignment_id)?.title}</p>
              </div>
              {gradingSub.submission_text && <div className="max-h-60 overflow-y-auto rounded-md border p-3"><p className="whitespace-pre-wrap text-sm">{gradingSub.submission_text}</p></div>}
              <div><label className="text-sm font-medium">Nilai</label><Input type="number" min="0" max={gradingMax} step="0.5" value={gradeScore} onChange={e => setGradeScore(e.target.value)} placeholder={`0-${gradingMax}`} /></div>
              <div><label className="text-sm font-medium">Feedback</label><Textarea value={gradeFeedback} onChange={e => setGradeFeedback(e.target.value)} placeholder="Feedback untuk siswa..." className="min-h-24" /></div>
            </div>
          )}
          <DialogFooter><Button type="button" variant="outline" onClick={() => setGradingId(null)}>Batal</Button><Button onClick={handleGrade} disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan Nilai'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
