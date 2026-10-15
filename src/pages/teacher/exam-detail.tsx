import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ArrowLeft, Users, Clock, FileCheck, Award, MoreVertical } from 'lucide-react'
import { getRubricText } from '@/lib/content-types'
import { downloadCsv } from '@/lib/csv'

interface ExamData {
  id: string; title: string; instructions: string | null; duration_minutes: number
  start_at: string | null; end_at: string | null; max_attempts: number
  shuffle_questions: boolean; shuffle_options: boolean
  show_score_after_submit: boolean; show_explanations_after_submit: boolean
  status: 'draft' | 'scheduled' | 'published' | 'closed' | 'archived'
}

interface AttemptRow {
  id: string; student_id: string; status: string; started_at: string
  submitted_at: string | null; total_score: number | null; attempt_number: number
}

interface EssayAnswer {
  answer_id: string
  question_id: string
  question_text: string
  answer_text: string
  score: number | null
  feedback: string | null
  max_points: number
  rubric: string
}

const attemptLabels: Record<string, string> = {
  in_progress: 'Mengerjakan', submitted: 'Dikumpulkan', awaiting_grading: 'Menunggu nilai esai', graded: 'Sudah dinilai',
}

const statusLabels: Record<ExamData['status'], string> = {
  draft: 'Draft',
  scheduled: 'Dijadwalkan',
  published: 'Diterbitkan',
  closed: 'Ditutup',
  archived: 'Diarsipkan',
}

export function ExamDetailPage() {
  const { examId } = useParams()
  const [exam, setExam] = useState<ExamData | null>(null)
  const [selectedAttempt, setSelectedAttempt] = useState<AttemptRow | null>(null)
  const [essayAnswers, setEssayAnswers] = useState<EssayAnswer[]>([])
  const [loadingEssay, setLoadingEssay] = useState(false)
  const [savingEssayId, setSavingEssayId] = useState<string | null>(null)
  const [attempts, setAttempts] = useState<AttemptRow[]>([])
  const [students, setStudents] = useState<Map<string, string>>(new Map())
  const [questionCount, setQuestionCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (examId) {
      loadExam()
      loadAttempts()
      loadQuestionCount()
    }
  }, [examId])

  async function loadExam() {
    if (!examId) return
    const { data } = await supabase.from('exams').select('*').eq('id', examId).maybeSingle()
    setExam(data as ExamData | null)
  }

  async function loadQuestionCount() {
    if (!examId) return
    const { count } = await supabase.from('exam_questions').select('id', { count: 'exact', head: true }).eq('exam_id', examId)
    setQuestionCount(count ?? 0)
  }

  async function loadAttempts() {
    if (!examId) return
    const { data } = await supabase.from('exam_attempts').select('*').eq('exam_id', examId).order('started_at', { ascending: false })
    const attemptData = (data as AttemptRow[] | null) ?? []
    setAttempts(attemptData)

    if (attemptData.length > 0) {
      const studentIds = [...new Set(attemptData.map(a => a.student_id))]
      const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', studentIds)
      const map = new Map<string, string>()
      ;(profiles ?? []).forEach(p => map.set(p.id, p.full_name))
      setStudents(map)
    }
    setLoading(false)
  }

  async function loadEssayAnswers(attemptId: string) {
    setLoadingEssay(true)
    const { data } = await supabase
      .from('student_answers')
      .select('id, exam_question_id, answer_json, awarded_points, teacher_feedback')
      .eq('attempt_id', attemptId)

    // join dengan exam_questions untuk dapat teks & tipe soal
    const { data: eqData } = await supabase
      .from('exam_questions')
      .select('id, question_id, points_override, question_snapshot')
      .in('id', data?.map((a: any) => a.exam_question_id) ?? [])

    // rubrik penilaian (hanya guru yang bisa membaca tabel ini)
    const rubrics = new Map<string, string>()
    const qIds = (eqData ?? []).map((q: any) => q.question_id).filter(Boolean)
    if (qIds.length > 0) {
      const { data: keyRows } = await supabase.from('question_answer_keys').select('question_id, rubric_json').in('question_id', qIds)
      ;(keyRows ?? []).forEach(k => rubrics.set(k.question_id, getRubricText(k.rubric_json)))
    }

    const answers = (data ?? [])
      .map((a: any) => {
        const eq = (eqData ?? []).find((q: any) => q.id === a.exam_question_id)
        const snapshot = (eq?.question_snapshot ?? {}) as { question_type?: string; question_text?: string; points?: number }
        if (snapshot.question_type !== 'essay') return null

        const raw = a.answer_json
        const answerText =
          typeof raw === 'string' ? raw
          : raw && typeof raw === 'object' && 'text' in raw ? String(raw.text)
          : raw != null ? JSON.stringify(raw)
          : ''

        return {
          answer_id: a.id,
          question_id: eq?.question_id,
          question_text: snapshot.question_text ?? '',
          answer_text: answerText,
          score: a.awarded_points ?? null,
          feedback: a.teacher_feedback ?? null,
          max_points: Number(eq?.points_override ?? snapshot.points ?? 0),
          rubric: rubrics.get(eq?.question_id ?? '') ?? '',
        } as EssayAnswer
      })
      .filter((x): x is EssayAnswer => x !== null)

    setEssayAnswers(answers)
    setLoadingEssay(false)
  }

  async function handleEssayGrade(answerId: string, score: number, feedback: string, max: number) {
    if (!Number.isFinite(score) || score < 0 || score > max) {
      toast.error(`Nilai harus antara 0 dan ${max}`)
      return
    }
    setSavingEssayId(answerId)
    // penilaian & penghitungan nilai total dilakukan di server
    const { error } = await supabase.rpc('grade_essay_answer', {
      p_answer_id: answerId, p_points: score, p_feedback: feedback,
    })
    setSavingEssayId(null)
    if (error) { toast.error('Gagal menyimpan nilai esai: ' + error.message); return }
    toast.success('Nilai esai disimpan')
    if (selectedAttempt) loadEssayAnswers(selectedAttempt.id)
    loadAttempts()   // status & skor total di tabel ikut diperbarui
  }

  const openEssayDialog = (attempt: AttemptRow) => {
    setSelectedAttempt(attempt)
    loadEssayAnswers(attempt.id)
  }

  /** Siswa yang menutup tab/jaringan putus meninggalkan percobaan 'Mengerjakan'; guru bisa mengumpulkannya. */
  async function handleCloseExpired() {
    if (!examId) return
    const { data, error } = await supabase.rpc('teacher_close_attempts', { p_exam_id: examId, p_only_expired: true })
    if (error) { toast.error('Gagal mengumpulkan percobaan: ' + error.message); return }
    toast.success(data > 0 ? `${data} percobaan kedaluwarsa dikumpulkan & dinilai` : 'Tidak ada percobaan kedaluwarsa')
    loadAttempts()
  }

  async function handlePublishGrades(publish: boolean) {
    if (!examId) return
    const { data, error } = await supabase.rpc('publish_exam_grades', { p_exam_id: examId, p_publish: publish })
    if (error) { toast.error('Gagal mengubah publikasi nilai: ' + error.message); return }
    toast.success(publish ? `${data} nilai diterbitkan ke siswa` : `${data} nilai ditarik dari siswa`)
  }

  function exportResults() {
    downloadCsv(`hasil-${(exam?.title ?? 'ujian').replace(/\s+/g, '-').toLowerCase()}.csv`, [
      ['Siswa', 'Percobaan ke', 'Status', 'Dimulai', 'Dikumpulkan', 'Skor'],
      ...attempts.map(a => [students.get(a.student_id) ?? 'Tidak dikenal', a.attempt_number, attemptLabels[a.status] ?? a.status,
        new Date(a.started_at).toLocaleString('id-ID'), a.submitted_at ? new Date(a.submitted_at).toLocaleString('id-ID') : '', a.total_score ?? '']),
    ])
  }

  async function handlePublish() {
    if (!examId) return
    const { error } = await supabase.from('exams').update({ status: 'published' }).eq('id', examId)
    if (error) { toast.error('Gagal menerbitkan'); return }
    toast.success('Ujian diterbitkan')
    loadExam()
  }

  async function handleClose() {
    if (!examId) return
    const { error } = await supabase.from('exams').update({ status: 'closed' }).eq('id', examId)
    if (error) { toast.error('Gagal menutup ujian'); return }
    toast.success('Ujian ditutup')
    loadExam()
  }

  if (loading) return <p className="text-muted-foreground">Memuat...</p>
  if (!exam) return <p className="text-muted-foreground">Ujian tidak ditemukan</p>

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2"><Link to="/teacher/exams"><ArrowLeft className="size-4" /> Kembali</Link></Button>
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{exam.title}</h1>
            <Badge variant={exam.status === 'published' ? 'default' : 'secondary'} className="mt-1">{statusLabels[exam.status]}</Badge>
          </div>
          {exam.status === 'draft' && <Button onClick={handlePublish}>Terbitkan</Button>}
          {exam.status === 'published' && <Button variant="outline" onClick={handleClose}>Tutup Ujian</Button>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card><CardContent className="flex items-center gap-3 p-4"><FileCheck className="size-5 text-primary" /><div><p className="text-2xl font-bold">{questionCount}</p><p className="text-xs text-muted-foreground">Soal</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4"><Clock className="size-5 text-primary" /><div><p className="text-2xl font-bold">{exam.duration_minutes}</p><p className="text-xs text-muted-foreground">Menit</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4"><Users className="size-5 text-primary" /><div><p className="text-2xl font-bold">{attempts.length}</p><p className="text-xs text-muted-foreground">Percobaan</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4"><Award className="size-5 text-primary" /><div><p className="text-2xl font-bold">{attempts.filter(a => a.status === 'graded').length}</p><p className="text-xs text-muted-foreground">Dinilai</p></div></CardContent></Card>
      </div>

      {exam.instructions && (
        <Card><CardHeader><CardTitle className="text-base">Instruksi</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground whitespace-pre-wrap">{exam.instructions}</p></CardContent></Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Hasil Percobaan</CardTitle>
          <CardDescription>Daftar siswa yang mengerjakan ujian</CardDescription>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={handleCloseExpired}>Kumpulkan percobaan kedaluwarsa</Button>
            <Button variant="outline" size="sm" onClick={() => handlePublishGrades(true)}>Terbitkan nilai ke siswa</Button>
            <Button variant="ghost" size="sm" onClick={() => handlePublishGrades(false)}>Tarik nilai</Button>
            <Button variant="outline" size="sm" onClick={exportResults} disabled={attempts.length === 0}>Ekspor CSV</Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {attempts.length === 0 ? (
            <Empty><EmptyHeader><EmptyTitle>Belum ada percobaan</EmptyTitle><EmptyDescription>Siswa belum mengerjakan ujian ini</EmptyDescription></EmptyHeader></Empty>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Siswa</TableHead><TableHead>Percobaan</TableHead><TableHead>Status</TableHead><TableHead>Skor</TableHead><TableHead>Aksi</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {attempts.map(a => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{students.get(a.student_id) ?? 'Tidak dikenal'}</TableCell>
                    <TableCell>#{a.attempt_number}</TableCell>
                    <TableCell><Badge variant={a.status === 'graded' ? 'default' : 'secondary'}>{attemptLabels[a.status] ?? a.status}</Badge></TableCell>
                    <TableCell>{a.total_score != null ? a.total_score : '-'}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm"><MoreVertical className="size-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEssayDialog(a)}>Lihat Jawaban Essay</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialog untuk menilai essay */}
      <Dialog open={!!selectedAttempt} onOpenChange={open => { if (!open) setSelectedAttempt(null) }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Grading Essay – {selectedAttempt ? (students.get(selectedAttempt.student_id) ?? 'Tidak dikenal') : ''}
            </DialogTitle>
            <DialogDescription>Isi nilai & feedback untuk setiap jawaban essay.</DialogDescription>
          </DialogHeader>
          {loadingEssay ? (
            <p className="text-muted-foreground">Memuat jawaban essay...</p>
          ) : essayAnswers.length === 0 ? (
            <p className="text-muted-foreground">Tidak ada jawaban essay.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pertanyaan</TableHead>
                  <TableHead>Jawaban Siswa</TableHead>
                  <TableHead>Nilai</TableHead>
                  <TableHead>Feedback</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {essayAnswers.map(ans => (
                  <TableRow key={ans.answer_id}>
                    <TableCell>
                      <p className="whitespace-pre-wrap">{ans.question_text}</p>
                      {ans.rubric && <p className="mt-2 text-xs text-muted-foreground">Rubrik: {ans.rubric}</p>}
                    </TableCell>
                    <TableCell className="max-w-xs whitespace-pre-wrap">{ans.answer_text}</TableCell>
                    <TableCell>
                      <Input
                        type="number" min="0" max={ans.max_points} step="0.5"
                        placeholder={`/ ${ans.max_points}`}
                        value={ans.score ?? ''}
                        onChange={e => {
                          const val = e.target.value ? parseFloat(e.target.value) : null
                          setEssayAnswers(prev => prev.map(a => a.answer_id === ans.answer_id ? { ...a, score: val } : a))
                        }}
                        disabled={savingEssayId === ans.answer_id}
                        className="w-20"
                      />
                    </TableCell>
                    <TableCell>
                      <Textarea
                        value={ans.feedback ?? ''}
                        onChange={e => {
                          const fb = e.target.value
                          setEssayAnswers(prev => prev.map(a => a.answer_id === ans.answer_id ? { ...a, feedback: fb } : a))
                        }}
                        disabled={savingEssayId === ans.answer_id}
                        className="h-20"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        onClick={() => handleEssayGrade(ans.answer_id, ans.score as number, ans.feedback ?? '', ans.max_points)}
                        disabled={savingEssayId === ans.answer_id || ans.score === null}
                      >
                        {savingEssayId === ans.answer_id ? 'Menyimpan...' : 'Simpan'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}