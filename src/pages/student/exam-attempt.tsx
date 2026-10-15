import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from '@/components/ui/alert-dialog'
import { Clock, ChevronLeft, ChevronRight, Flag, AlertCircle, CheckCircle } from 'lucide-react'
import type { Json } from '@/lib/database.types'

interface OptionData { id: string; text: string }

interface ExamQuestionData {
  id: string
  exam_question_id: string
  position: number
  question_snapshot: {
    question_type: 'mcq' | 'essay'
    question_text: string
    options_json?: OptionData[] | null
    points: number
  }
  points_override: number | null
}

interface AttemptData {
  id: string
  exam_id: string
  status: string
  deadline_at: string | null
  started_at: string
}

interface AnswerMap {
  [examQuestionId: string]: { answer_json: Json | null }
}

const isAnswered = (v: Json | null | undefined) =>
  v !== null && v !== undefined && !(typeof v === 'string' && v.trim() === '')

/** Acak deterministik per percobaan: reload halaman tidak mengubah urutan. */
function seededShuffle<T>(arr: T[], seed: string): T[] {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  const rand = () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    h ^= h >>> 16
    return (h >>> 0) / 4294967296
  }
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function ExamAttemptPage() {
  const { attemptId } = useParams()
  const navigate = useNavigate()
  const [attempt, setAttempt] = useState<AttemptData | null>(null)
  const [examTitle, setExamTitle] = useState('')
  const [questions, setQuestions] = useState<ExamQuestionData[]>([])
  const [answers, setAnswers] = useState<AnswerMap>({})
  const [currentIdx, setCurrentIdx] = useState(0)
  const [loading, setLoading] = useState(true)
  const [timeLeft, setTimeLeft] = useState(0)
  const [showSubmit, setShowSubmit] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const answersRef = useRef<AnswerMap>({})
  const dirtyRef = useRef<Set<string>>(new Set())
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const submittingRef = useRef(false)
  const autoSubmitRef = useRef<() => void>(() => {})

  useEffect(() => {
    if (attemptId) loadAttempt()
  }, [attemptId])

  // peringatan kalau tab ditutup saat masih ada jawaban yang belum tersimpan
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current.size > 0) { e.preventDefault(); e.returnValue = '' }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  useEffect(() => () => { Object.values(timersRef.current).forEach(clearTimeout) }, [])

  const loadAttempt = async () => {
    if (!attemptId) return

    const { data: attemptData, error: attemptErr } = await supabase
      .from('exam_attempts')
      .select('id, exam_id, status, deadline_at, started_at')
      .eq('id', attemptId)
      .maybeSingle()

    if (attemptErr || !attemptData) {
      setError('Percobaan ujian tidak ditemukan')
      setLoading(false)
      return
    }

    if (attemptData.status !== 'in_progress') {
      setError('Ujian ini sudah selesai')
      setLoading(false)
      return
    }

    setAttempt(attemptData as AttemptData)

    const { data: examData } = await supabase
      .from('exams')
      .select('title, shuffle_questions, shuffle_options')
      .eq('id', attemptData.exam_id)
      .maybeSingle()
    setExamTitle(examData?.title ?? 'Ujian')

    const { data: eqData } = await supabase
      .from('exam_questions')
      .select('id, question_id, position, points_override, question_snapshot')
      .eq('exam_id', attemptData.exam_id)
      .order('position')

    let eqRows: ExamQuestionData[] = (eqData ?? []).map(eq => ({
      id: eq.id,
      exam_question_id: eq.id,
      position: eq.position,
      question_snapshot: eq.question_snapshot as unknown as ExamQuestionData['question_snapshot'],
      points_override: eq.points_override,
    }))

    // pengaturan acak soal/opsi dari ujian (sebelumnya tersimpan tapi tidak dipakai)
    if (examData?.shuffle_questions) eqRows = seededShuffle(eqRows, `${attemptId}:q`)
    if (examData?.shuffle_options) {
      eqRows = eqRows.map(r => {
        const opts = r.question_snapshot.options_json
        return opts && opts.length > 1
          ? { ...r, question_snapshot: { ...r.question_snapshot, options_json: seededShuffle(opts, `${attemptId}:${r.id}`) } }
          : r
      })
    }

    setQuestions(eqRows)

    const { data: answerData } = await supabase
      .from('student_answers')
      .select('exam_question_id, answer_json')
      .eq('attempt_id', attemptId)

    const aMap: AnswerMap = {}
    ;(answerData ?? []).forEach(a => {
      aMap[a.exam_question_id] = { answer_json: a.answer_json }
    })
    eqRows.forEach(eq => {
      if (!aMap[eq.exam_question_id]) aMap[eq.exam_question_id] = { answer_json: null }
    })

    setAnswers(aMap)
    answersRef.current = aMap
    setLoading(false)
  }

  // timer dihitung ulang dari tenggat server tiap detik (tidak melayang), auto-kumpul saat habis
  useEffect(() => {
    if (!attempt?.deadline_at) return
    const deadline = new Date(attempt.deadline_at).getTime()
    const tick = () => {
      const left = Math.max(0, Math.floor((deadline - Date.now()) / 1000))
      setTimeLeft(left)
      if (left <= 0) autoSubmitRef.current()
    }
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [attempt])

  useEffect(() => {
    autoSubmitRef.current = () => { void handleSubmit(true) }
  })

  /** Simpan satu jawaban (upsert: aman dipanggil berulang, tidak membuat duplikat). */
  async function persist(examQuestionId: string): Promise<boolean> {
    const current = answersRef.current[examQuestionId]
    if (!attemptId || !current || current.answer_json === null) {
      dirtyRef.current.delete(examQuestionId)
      return true
    }
    const sent = current.answer_json
    const { error: upErr } = await supabase
      .from('student_answers')
      .upsert(
        { attempt_id: attemptId, exam_question_id: examQuestionId, answer_json: sent },
        { onConflict: 'attempt_id,exam_question_id' },
      )
    if (upErr) return false
    // kalau jawaban berubah lagi selagi menyimpan, tetap dianggap belum tersimpan
    if (answersRef.current[examQuestionId]?.answer_json === sent) dirtyRef.current.delete(examQuestionId)
    return true
  }

  const saveAnswer = useCallback((examQuestionId: string, answer: Json) => {
    answersRef.current = { ...answersRef.current, [examQuestionId]: { answer_json: answer } }
    setAnswers(answersRef.current)
    dirtyRef.current.add(examQuestionId)

    // timer per soal: pindah soal tidak membatalkan simpanan soal sebelumnya
    clearTimeout(timersRef.current[examQuestionId])
    timersRef.current[examQuestionId] = setTimeout(async () => {
      setSaveState('saving')
      const ok = await persist(examQuestionId)
      setSaveState(ok ? 'saved' : 'error')
    }, 1000)
  }, [attemptId])

  async function handleSubmit(auto = false) {
    if (!attemptId || !attempt || submittingRef.current) return
    submittingRef.current = true
    setSubmitting(true)
    setShowSubmit(false)

    Object.values(timersRef.current).forEach(clearTimeout)

    // tulis semua jawaban yang belum tersimpan
    const pending = [...dirtyRef.current]
    const results = await Promise.all(pending.map(persist))
    if (results.some(ok => !ok)) {
      if (!auto) {
        toast.error('Sebagian jawaban gagal tersimpan. Periksa koneksi lalu coba kumpulkan lagi.')
        submittingRef.current = false
        setSubmitting(false)
        setSaveState('error')
        return
      }
      toast.warning('Sebagian jawaban terakhir mungkin tidak tersimpan (koneksi bermasalah)')
    }

    // penilaian pilihan ganda dilakukan di server memakai kunci jawaban yang tidak terlihat siswa
    const { error: rpcErr } = await supabase.rpc('submit_exam_attempt', { p_attempt_id: attemptId })
    if (rpcErr) {
      toast.error('Gagal mengumpulkan ujian: ' + rpcErr.message)
      submittingRef.current = false
      setSubmitting(false)
      return
    }

    setSubmitting(false)
    toast.success(auto ? 'Waktu habis! Ujian otomatis dikumpulkan' : 'Ujian berhasil dikumpulkan')
    navigate('/student/exams')
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const answeredCount = questions.filter(q => isAnswered(answers[q.exam_question_id]?.answer_json)).length

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Memuat ujian...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <AlertCircle className="size-12 text-destructive" />
        <p className="text-lg font-medium">{error}</p>
        <Button onClick={() => navigate('/student/exams')}>Kembali ke Daftar Ujian</Button>
      </div>
    )
  }

  const currentQuestion = questions[currentIdx]
  if (!currentQuestion) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Tidak ada soal</p>
      </div>
    )
  }

  const currentAnswer = answers[currentQuestion.exam_question_id]?.answer_json
  const hasDeadline = !!attempt?.deadline_at
  const isLowTime = hasDeadline && timeLeft < 300
  const saveLabel = saveState === 'saving' ? 'Menyimpan...' : saveState === 'saved' ? 'Tersimpan' : saveState === 'error' ? 'Gagal menyimpan, periksa koneksi' : ''

  return (
    <div className="min-h-screen bg-background">
      {/* Header bar */}
      <div className="sticky top-0 z-10 border-b bg-card px-4 py-3 shadow-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="truncate text-base font-bold">{examTitle}</h1>
            <p className="text-xs text-muted-foreground">Soal {currentIdx + 1} dari {questions.length}{saveLabel && ` · ${saveLabel}`}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${isLowTime ? 'bg-destructive/10 text-destructive' : 'bg-muted text-foreground'}`}>
              <Clock className="size-4" />
              {hasDeadline ? formatTime(timeLeft) : '—'}
            </div>
            <Button size="sm" variant="default" onClick={() => setShowSubmit(true)} disabled={submitting}>
              Kumpulkan
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-4xl space-y-4 p-4">
        {/* Question navigation grid */}
        <Card>
          <CardContent className="p-3">
            <div className="flex flex-wrap gap-2">
              {questions.map((q, idx) => {
                const answered = isAnswered(answers[q.exam_question_id]?.answer_json)
                return (
                  <button
                    key={q.exam_question_id}
                    onClick={() => setCurrentIdx(idx)}
                    className={`flex size-9 items-center justify-center rounded-md border text-sm font-medium transition-colors ${
                      idx === currentIdx
                        ? 'border-primary bg-primary text-primary-foreground'
                        : answered
                        ? 'border-primary/30 bg-primary/10 text-primary'
                        : 'border-border bg-background text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {idx + 1}
                  </button>
                )
              })}
            </div>
            <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><CheckCircle className="size-3" /> {answeredCount} terjawab</span>
              <span>{questions.length - answeredCount} belum dijawab</span>
            </div>
          </CardContent>
        </Card>

        {/* Question card */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="text-base">
                Soal {currentIdx + 1}
              </CardTitle>
              <Badge variant="secondary">
                {currentQuestion.points_override ?? currentQuestion.question_snapshot.points} poin
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="whitespace-pre-wrap text-sm leading-relaxed">
              {currentQuestion.question_snapshot.question_text}
            </p>

            {currentQuestion.question_snapshot.question_type === 'mcq' ? (
              <RadioGroup
                value={typeof currentAnswer === 'string' ? currentAnswer : ''}
                onValueChange={(val) => saveAnswer(currentQuestion.exam_question_id, val)}
              >
                <div className="space-y-2">
                  {(currentQuestion.question_snapshot.options_json ?? []).map((opt, idx) => (
                    <div key={opt.id} className="flex items-center gap-3 rounded-md border p-3 transition-colors hover:bg-muted/30">
                      <RadioGroupItem value={opt.id} id={`opt-${opt.id}`} />
                      <label htmlFor={`opt-${opt.id}`} className="flex-1 cursor-pointer text-sm">
                        <span className="mr-2 font-medium">{String.fromCharCode(65 + idx)}.</span>
                        {opt.text}
                      </label>
                    </div>
                  ))}
                </div>
              </RadioGroup>
            ) : (
              <Textarea
                value={typeof currentAnswer === 'string' ? currentAnswer : ''}
                onChange={e => saveAnswer(currentQuestion.exam_question_id, e.target.value)}
                placeholder="Tulis jawaban esai Anda di sini..."
                className="min-h-48"
              />
            )}
          </CardContent>
        </Card>

        {/* Navigation buttons */}
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            disabled={currentIdx === 0}
            onClick={() => setCurrentIdx(prev => Math.max(0, prev - 1))}
          >
            <ChevronLeft className="size-4" /> Sebelumnya
          </Button>
          {currentIdx === questions.length - 1 ? (
            <Button onClick={() => setShowSubmit(true)} disabled={submitting}>
              <Flag className="size-4" /> Kumpulkan
            </Button>
          ) : (
            <Button onClick={() => setCurrentIdx(prev => Math.min(questions.length - 1, prev + 1))}>
              Selanjutnya <ChevronRight className="size-4" />
            </Button>
          )}
        </div>
      </div>

      <AlertDialog open={showSubmit} onOpenChange={setShowSubmit}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kumpulkan Ujian?</AlertDialogTitle>
            <AlertDialogDescription>
              Anda telah menjawab {answeredCount} dari {questions.length} soal.
              {answeredCount < questions.length && ' Beberapa soal belum dijawab.'}
              Setelah dikumpulkan, Anda tidak dapat mengubah jawaban.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={() => handleSubmit(false)} disabled={submitting}>
              {submitting ? 'Mengumpulkan...' : 'Ya, Kumpulkan'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
