import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/auth-context'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Field, FieldLabel, FieldError } from '@/components/ui/field'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Save } from 'lucide-react'
import type { Json } from '@/lib/database.types'

interface QuestionBankRow { id: string; title: string; subject: string; topic: string }
interface QuestionRow {
  id: string; question_type: 'mcq' | 'essay'; question_text: string
  options_json: Json | null; points: number; difficulty: string | null
}
interface ClassRow { id: string; name: string }

export function ExamCreatePage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [banks, setBanks] = useState<QuestionBankRow[]>([])
  const [selectedBankId, setSelectedBankId] = useState('')
  const [bankQuestions, setBankQuestions] = useState<QuestionRow[]>([])
  // semua soal yang pernah dimuat, supaya pilihan dari beberapa bank tidak hilang saat pindah bank
  const [questionPool, setQuestionPool] = useState<Record<string, QuestionRow>>({})
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([])
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    title: '', instructions: '', duration_minutes: '60',
    start_at: '', end_at: '', max_attempts: '1',
  })
  const [shuffleQuestions, setShuffleQuestions] = useState(false)
  const [shuffleOptions, setShuffleOptions] = useState(false)
  const [showScore, setShowScore] = useState(false)
  const [showExplanations, setShowExplanations] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (user) { loadBanks(); loadClasses() }
  }, [user])

  async function loadBanks() {
    if (!user) return
    const { data } = await supabase.from('question_banks').select('id, title, subject, topic').eq('teacher_id', user.id).order('created_at', { ascending: false })
    setBanks(data as QuestionBankRow[] ?? [])
  }

  async function loadClasses() {
    if (!user) return
    const { data } = await supabase.from('classes').select('id, name').eq('teacher_id', user.id).eq('is_archived', false)
    setClasses(data ?? [])
  }

  async function loadBankQuestions(bankId: string) {
    setSelectedBankId(bankId)
    // kunci jawaban ada di question_answer_keys, bukan di tabel questions
    const { data, error } = await supabase.from('questions').select('id, question_type, question_text, options_json, points, difficulty').eq('question_bank_id', bankId).order('created_at', { ascending: true })
    if (error) { toast.error('Gagal memuat soal dari bank'); return }
    const rows = (data ?? []) as QuestionRow[]
    setBankQuestions(rows)
    setQuestionPool(prev => ({ ...prev, ...Object.fromEntries(rows.map(r => [r.id, r])) }))
  }

  function toggleAllInBank() {
    const ids = bankQuestions.map(q => q.id)
    const allSelected = ids.length > 0 && ids.every(id => selectedQuestionIds.includes(id))
    setSelectedQuestionIds(prev => allSelected ? prev.filter(id => !ids.includes(id)) : [...prev, ...ids.filter(id => !prev.includes(id))])
  }

  function toggleQuestion(id: string) {
    setSelectedQuestionIds(prev => prev.includes(id) ? prev.filter(q => q !== id) : [...prev, id])
  }

  async function handleSave(publish: boolean) {
    if (!user) return
    const newErrors: Record<string, string> = {}
    if (!form.title.trim()) newErrors.title = 'Judul wajib diisi'
    if (selectedQuestionIds.length === 0) newErrors.questions = 'Pilih minimal 1 soal'
    if (selectedClassIds.length === 0) newErrors.classes = 'Pilih minimal 1 kelas'
    if (!(parseInt(form.duration_minutes) > 0)) newErrors.duration = 'Durasi harus lebih dari 0 menit'
    if (!(parseInt(form.max_attempts) >= 1)) newErrors.attempts = 'Minimal 1 percobaan'
    if (form.start_at && form.end_at && new Date(form.end_at) <= new Date(form.start_at)) newErrors.end = 'Waktu selesai harus setelah waktu mulai'
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return }

    setSaving(true)
    const examData = {
      teacher_id: user.id,
      title: form.title.trim(),
      instructions: form.instructions.trim() || null,
      duration_minutes: parseInt(form.duration_minutes) || 60,
      start_at: form.start_at ? new Date(form.start_at).toISOString() : null,
      end_at: form.end_at ? new Date(form.end_at).toISOString() : null,
      max_attempts: parseInt(form.max_attempts) || 1,
      shuffle_questions: shuffleQuestions,
      shuffle_options: shuffleOptions,
      show_score_after_submit: showScore,
      show_explanations_after_submit: showExplanations,
      status: (publish ? 'published' : 'draft') as 'published' | 'draft',
    }

    const { data: exam, error: examError } = await supabase.from('exams').insert(examData).select().single()
    if (examError || !exam) { toast.error('Gagal membuat ujian'); setSaving(false); return }

    // urutan soal = urutan klik; soal dari beberapa bank ikut tersimpan
    const selectedQuestions = selectedQuestionIds.map(id => questionPool[id]).filter((q): q is QuestionRow => !!q)
    const snapshots = selectedQuestions.map((q, i) => ({
      exam_id: exam.id,
      question_id: q.id,
      position: i,
      points_override: q.points,
      question_snapshot: {
        question_type: q.question_type,
        question_text: q.question_text,
        options_json: q.options_json,
        points: q.points,
      } as unknown as Json,
    }))

    const { error: classErr } = await supabase.from('exam_classes').insert(selectedClassIds.map(cid => ({ exam_id: exam.id, class_id: cid })))
    const { error: qErr } = await supabase.from('exam_questions').insert(snapshots)
    if (classErr || qErr) {
      // batalkan ujian setengah jadi supaya tidak ada ujian tanpa soal/kelas
      await supabase.from('exams').delete().eq('id', exam.id)
      toast.error('Gagal menyimpan soal/kelas ujian, ujian dibatalkan. Coba lagi.')
      setSaving(false)
      return
    }

    setSaving(false)
    toast.success(publish ? 'Ujian diterbitkan' : 'Ujian disimpan sebagai draf')
    navigate('/teacher/exams')
  }

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2"><Link to="/teacher/exams"><ArrowLeft className="size-4" /> Kembali</Link></Button>
        <h1 className="text-2xl font-bold tracking-tight">Buat Ujian</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Informasi Ujian</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Field data-invalid={!!errors.title}><FieldLabel htmlFor="etitle">Judul</FieldLabel>
              <Input id="etitle" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="UTS IPA Bab 1" />
              {errors.title && <FieldError>{errors.title}</FieldError>}
            </Field>
            <Field><FieldLabel htmlFor="einstr">Instruksi</FieldLabel>
              <Textarea id="einstr" value={form.instructions} onChange={e => setForm({ ...form, instructions: e.target.value })} placeholder="Instruksi untuk siswa..." className="min-h-24" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field data-invalid={!!errors.duration}><FieldLabel htmlFor="edur">Durasi (menit)</FieldLabel><Input id="edur" type="number" min="1" value={form.duration_minutes} onChange={e => setForm({ ...form, duration_minutes: e.target.value })} />{errors.duration && <FieldError>{errors.duration}</FieldError>}</Field>
              <Field data-invalid={!!errors.attempts}><FieldLabel htmlFor="eatt">Maks. Percobaan</FieldLabel><Input id="eatt" type="number" min="1" value={form.max_attempts} onChange={e => setForm({ ...form, max_attempts: e.target.value })} />{errors.attempts && <FieldError>{errors.attempts}</FieldError>}</Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field><FieldLabel htmlFor="estart">Mulai</FieldLabel><Input id="estart" type="datetime-local" value={form.start_at} onChange={e => setForm({ ...form, start_at: e.target.value })} /></Field>
              <Field data-invalid={!!errors.end}><FieldLabel htmlFor="eend">Selesai</FieldLabel><Input id="eend" type="datetime-local" value={form.end_at} onChange={e => setForm({ ...form, end_at: e.target.value })} />{errors.end && <FieldError>{errors.end}</FieldError>}</Field>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between"><label className="text-sm">Acak soal</label><Switch checked={shuffleQuestions} onCheckedChange={setShuffleQuestions} /></div>
              <div className="flex items-center justify-between"><label className="text-sm">Acak opsi</label><Switch checked={shuffleOptions} onCheckedChange={setShuffleOptions} /></div>
              <div className="flex items-center justify-between"><label className="text-sm">Tampilkan nilai setelah kumpul</label><Switch checked={showScore} onCheckedChange={setShowScore} /></div>
              <div className="flex items-center justify-between"><label className="text-sm">Tampilkan pembahasan</label><Switch checked={showExplanations} onCheckedChange={setShowExplanations} /></div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Pilih Soal dari Bank</CardTitle>
              <CardDescription>{selectedQuestionIds.length} soal dipilih</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {banks.length === 0 ? <p className="text-sm text-muted-foreground">Buat bank soal terlebih dahulu.</p> : (
                <>
                  <div className="flex flex-wrap gap-2">
                    {banks.map(b => (
                      <Button key={b.id} variant={selectedBankId === b.id ? 'default' : 'outline'} size="sm" onClick={() => loadBankQuestions(b.id)}>{b.title}</Button>
                    ))}
                  </div>
                  {bankQuestions.length > 0 && (
                    <Button type="button" variant="ghost" size="sm" onClick={toggleAllInBank}>
                      {bankQuestions.every(q => selectedQuestionIds.includes(q.id)) ? 'Batal pilih semua di bank ini' : 'Pilih semua di bank ini'}
                    </Button>
                  )}
                  {bankQuestions.length > 0 && (
                    <div className="max-h-64 space-y-2 overflow-y-auto">
                      {bankQuestions.map((q) => (
                        <div key={q.id} className="flex items-start gap-2 rounded-md border p-2">
                          <Checkbox checked={selectedQuestionIds.includes(q.id)} onCheckedChange={() => toggleQuestion(q.id)} />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <Badge variant={q.question_type === 'mcq' ? 'default' : 'secondary'} className="text-xs">{q.question_type === 'mcq' ? 'PG' : 'Esai'}</Badge>
                              <span className="text-xs text-muted-foreground">{q.points} poin</span>
                            </div>
                            <p className="mt-1 text-sm line-clamp-2">{q.question_text}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {errors.questions && <FieldError>{errors.questions}</FieldError>}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Kelas Peserta</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {classes.length === 0 ? <p className="text-sm text-muted-foreground">Buat kelas terlebih dahulu.</p> : (
                classes.map(c => (
                  <div key={c.id} className="flex items-center gap-2">
                    <Checkbox checked={selectedClassIds.includes(c.id)} onCheckedChange={(checked) => {
                      if (checked) setSelectedClassIds([...selectedClassIds, c.id])
                      else setSelectedClassIds(selectedClassIds.filter(id => id !== c.id))
                    }} />
                    <span className="text-sm">{c.name}</span>
                  </div>
                ))
              )}
              {errors.classes && <FieldError>{errors.classes}</FieldError>}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" onClick={() => handleSave(false)} disabled={saving}><Save className="size-4" /> Simpan Draf</Button>
        <Button onClick={() => handleSave(true)} disabled={saving}>Terbitkan Ujian</Button>
      </div>
    </div>
  )
}
