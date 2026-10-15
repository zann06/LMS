import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/auth-context'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from '@/components/ui/alert-dialog'
import { FileCheck, Clock, CheckCircle } from 'lucide-react'
import { AttemptReviewDialog } from '@/components/attempt-review-dialog'

interface ExamItem {
  id: string
  title: string
  instructions: string | null
  duration_minutes: number
  start_at: string | null
  end_at: string | null
  max_attempts: number
  status: string
}

interface AttemptInfo {
  id: string
  attempt_number: number
  status: string
  total_score: number | null
  grade: { score: number; max_score: number } | null   // hanya bila nilai sudah diterbitkan guru
}

export function StudentExamsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [exams, setExams] = useState<(ExamItem & { attempts: AttemptInfo[] })[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmExam, setConfirmExam] = useState<ExamItem | null>(null)
  const [starting, setStarting] = useState(false)
  const [reviewId, setReviewId] = useState<string | null>(null)

  useEffect(() => {
    if (user) loadExams()
  }, [user])

  async function loadExams() {
    if (!user) return

    const { data: memberships } = await supabase
      .from('class_members')
      .select('class_id')
      .eq('student_id', user.id)
      .eq('membership_status', 'active')

    const classIds = memberships?.map(m => m.class_id) ?? []
    if (classIds.length === 0) { setLoading(false); return }

    const { data: examClasses } = await supabase
      .from('exam_classes')
      .select('exam_id')
      .in('class_id', classIds)

    const examIds = [...new Set(examClasses?.map(ec => ec.exam_id) ?? [])]
    if (examIds.length === 0) { setLoading(false); return }

    const { data: examData } = await supabase
      .from('exams')
      .select('id, title, instructions, duration_minutes, start_at, end_at, max_attempts, status')
      .in('id', examIds)
      .in('status', ['published', 'closed'])
      .order('created_at', { ascending: false })

    if (!examData || examData.length === 0) { setLoading(false); return }

    const { data: attemptsData } = await supabase
      .from('exam_attempts')
      .select('id, exam_id, attempt_number, status, total_score')
      .eq('student_id', user.id)

    // skor hanya ditampilkan dari nilai yang SUDAH diterbitkan guru (bukan total_score mentah)
    const attemptIds = (attemptsData ?? []).map(a => a.id)
    const gradeMap = new Map<string, { score: number; max_score: number }>()
    if (attemptIds.length > 0) {
      const { data: gradeRows } = await supabase.from('grades').select('exam_attempt_id, score, max_score').in('exam_attempt_id', attemptIds).not('published_at', 'is', null)
      ;(gradeRows ?? []).forEach(g => { if (g.exam_attempt_id) gradeMap.set(g.exam_attempt_id, { score: Number(g.score), max_score: Number(g.max_score) }) })
    }

    const attemptMap = new Map<string, AttemptInfo[]>()
    ;(attemptsData ?? []).forEach(a => {
      const arr = attemptMap.get(a.exam_id) ?? []
      arr.push({ id: a.id, attempt_number: a.attempt_number, status: a.status, total_score: a.total_score, grade: gradeMap.get(a.id) ?? null })
      attemptMap.set(a.exam_id, arr)
    })

    // ujian yang sudah ditutup hanya ditampilkan bila siswa pernah mengerjakannya
    const combined = examData
      .map(e => ({ ...e, attempts: (attemptMap.get(e.id) ?? []).sort((x, y) => x.attempt_number - y.attempt_number) }))
      .filter(e => e.status === 'published' || e.attempts.length > 0)

    setExams(combined)
    setLoading(false)
  }

  async function startExam(exam: ExamItem) {
    if (!user) return
    setStarting(true)

    const now = new Date()
    if (exam.start_at && new Date(exam.start_at) > now) {
      toast.error('Ujian belum dimulai')
      setStarting(false)
      return
    }
    if (exam.end_at && new Date(exam.end_at) < now) {
      toast.error('Ujian sudah berakhir')
      setStarting(false)
      return
    }

    const existingAttempts = exams.find(e => e.id === exam.id)?.attempts ?? []
    const inProgress = existingAttempts.find(a => a.status === 'in_progress')
    if (inProgress) {
      setStarting(false)
      navigate(`/student/exam-attempts/${inProgress.id}`)
      return
    }

    if (existingAttempts.length >= exam.max_attempts) {
      toast.error('Anda sudah mencapai batas percobaan maksimal')
      setStarting(false)
      return
    }

    // nomor percobaan, jam mulai, dan tenggat ditentukan SERVER (trigger); klien cukup mengirim exam_id
    const { data, error } = await supabase.from('exam_attempts').insert({ exam_id: exam.id }).select('id').single()

    if (error || !data) {
      toast.error('Gagal memulai ujian: ' + (error?.message ?? 'Kesalahan tidak diketahui'))
      setStarting(false)
      return
    }

    setStarting(false)
    setConfirmExam(null)
    navigate(`/student/exam-attempts/${data.id}`)
  }

  function getExamStatus(exam: ExamItem & { attempts: AttemptInfo[] }) {
    const now = new Date()
    // percobaan yang sedang berjalan selalu bisa dilanjutkan (tenggatnya diatur per percobaan)
    const inProgress = exam.attempts.find(a => a.status === 'in_progress')
    if (inProgress) {
      return { label: 'Sedang dikerjakan', variant: 'default' as const, canStart: true }
    }
    if (exam.status === 'closed') {
      return { label: 'Ditutup', variant: 'secondary' as const, canStart: false }
    }
    if (exam.start_at && new Date(exam.start_at) > now) {
      return { label: 'Belum dimulai', variant: 'outline' as const, canStart: false }
    }
    if (exam.end_at && new Date(exam.end_at) < now) {
      return { label: 'Berakhir', variant: 'secondary' as const, canStart: false }
    }
    if (exam.attempts.length >= exam.max_attempts) {
      return { label: 'Selesai', variant: 'secondary' as const, canStart: false }
    }
    return { label: 'Tersedia', variant: 'default' as const, canStart: true }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Ujian</h1>
        <p className="text-sm text-muted-foreground">Ujian online dari kelas Anda</p>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Memuat...</p>
      ) : exams.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Belum ada ujian</EmptyTitle>
            <EmptyDescription>Ujian akan muncul saat guru menerbitkannya</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-3">
          {exams.map(e => {
            const status = getExamStatus(e)
            const inProgress = e.attempts.find(a => a.status === 'in_progress')
            const completed = e.attempts.filter(a => a.status !== 'in_progress')
            return (
              <Card key={e.id} className="transition-shadow hover:shadow-md">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <FileCheck className="size-5 text-primary" />
                      <div>
                        <CardTitle className="text-base leading-tight">{e.title}</CardTitle>
                        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="size-3" />
                          {e.duration_minutes} menit · Maks. {e.max_attempts} percobaan
                        </p>
                      </div>
                    </div>
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {e.instructions && (
                    <p className="text-sm text-muted-foreground line-clamp-2 whitespace-pre-wrap">{e.instructions}</p>
                  )}
                  {(e.start_at || e.end_at) && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {e.start_at && `Mulai ${new Date(e.start_at).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`}
                      {e.start_at && e.end_at && ' · '}
                      {e.end_at && `Berakhir ${new Date(e.end_at).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`}
                    </p>
                  )}
                  {completed.length > 0 && (
                    <div className="mt-3 space-y-1">
                      {completed.map(a => (
                        <div key={a.id} className="flex items-center gap-2 text-sm text-muted-foreground">
                          <CheckCircle className="size-4 text-primary" />
                          <span>
                            Percobaan {a.attempt_number}:{' '}
                            {a.grade ? <><strong className="text-foreground">{a.grade.score} / {a.grade.max_score}</strong>{' '}<button type="button" className="text-primary underline" onClick={() => setReviewId(a.id)}>lihat hasil</button></>
                              : a.status === 'awaiting_grading' ? 'menunggu penilaian esai'
                              : a.status === 'graded' ? 'sudah dinilai, nilai belum diterbitkan guru'
                              : 'dikumpulkan'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <Button
                    size="sm"
                    className="mt-3"
                    variant={inProgress ? 'default' : 'outline'}
                    disabled={!status.canStart}
                    onClick={() => {
                      if (inProgress) {
                        navigate(`/student/exam-attempts/${inProgress.id}`)
                      } else {
                        setConfirmExam(e)
                      }
                    }}
                  >
                    {inProgress ? 'Lanjutkan' : 'Mulai Ujian'}
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <AttemptReviewDialog attemptId={reviewId} onClose={() => setReviewId(null)} />

      <AlertDialog open={!!confirmExam} onOpenChange={(open) => { if (!open) setConfirmExam(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mulai Ujian?</AlertDialogTitle>
            <AlertDialogDescription>
              Anda akan memulai "{confirmExam?.title}" dengan durasi {confirmExam?.duration_minutes} menit.
              Pastikan koneksi internet stabil. Jawaban akan tersimpan otomatis.
              {confirmExam && confirmExam.max_attempts > 1 && ` Anda memiliki maksimal ${confirmExam.max_attempts} percobaan.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmExam && startExam(confirmExam)} disabled={starting}>
              {starting ? 'Memulai...' : 'Mulai Sekarang'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
