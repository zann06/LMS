import { useEffect, useState, type FormEvent } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/auth-context'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Field, FieldLabel, FieldError } from '@/components/ui/field'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from '@/components/ui/alert-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty'
import { Separator } from '@/components/ui/separator'
import { ExportMenu } from '@/components/export-menu'
import { ArrowLeft, Plus, Trash2, Eye, Pencil } from 'lucide-react'
import type { Json } from '@/lib/database.types'
import { parseOptions, getCorrectOptionId, getRubricText, difficultyLabel, type OptionItem } from '@/lib/content-types'

interface QuestionRow {
  id: string; question_type: 'mcq' | 'essay'; question_text: string
  options_json: Json | null; explanation: string | null; points: number
  difficulty: 'easy' | 'medium' | 'hard' | null
}
interface KeyInfo { correctOptionId: string | null; rubric: string }
interface BankInfo { id: string; title: string; subject: string; topic: string; description: string | null }

const newOption = (): OptionItem => ({ id: crypto.randomUUID(), text: '' })
const blankForm = () => ({
  type: 'mcq' as 'mcq' | 'essay', text: '', options: [newOption(), newOption()], correct: '',
  points: '1', difficulty: '' as 'easy' | 'medium' | 'hard' | '', explanation: '', rubric: '',
})

export function QuestionBankDetailPage() {
  const { bankId } = useParams()
  const { user, profile } = useAuth()
  const [bank, setBank] = useState<BankInfo | null>(null)
  const [questions, setQuestions] = useState<QuestionRow[]>([])
  const [keys, setKeys] = useState<Record<string, KeyInfo>>({})
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [preview, setPreview] = useState<QuestionRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<QuestionRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(blankForm())
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => { if (bankId) { loadBank(); loadQuestions() } }, [bankId])

  async function loadBank() {
    if (!bankId) return
    const { data } = await supabase.from('question_banks').select('id, title, subject, topic, description').eq('id', bankId).maybeSingle()
    setBank(data)
  }

  async function loadQuestions() {
    if (!bankId) return
    const { data } = await supabase.from('questions').select('*').eq('question_bank_id', bankId).order('created_at', { ascending: true })
    const rows = (data ?? []) as QuestionRow[]
    setQuestions(rows)

    // kunci jawaban & rubrik ada di tabel terpisah (tidak terbaca siswa)
    const map: Record<string, KeyInfo> = {}
    if (rows.length > 0) {
      const { data: keyRows } = await supabase.from('question_answer_keys').select('question_id, answer_key_json, rubric_json').in('question_id', rows.map(r => r.id))
      for (const k of keyRows ?? []) {
        map[k.question_id] = { correctOptionId: getCorrectOptionId(k.answer_key_json), rubric: getRubricText(k.rubric_json) }
      }
    }
    setKeys(map)
    setLoading(false)
  }

  function openCreate() { setEditingId(null); setForm(blankForm()); setErrors({}); setDialogOpen(true) }

  function openEdit(q: QuestionRow) {
    const k = keys[q.id]
    const opts = parseOptions(q.options_json)
    setEditingId(q.id)
    setForm({
      type: q.question_type, text: q.question_text,
      options: opts.length >= 2 ? opts : [newOption(), newOption()],
      correct: k?.correctOptionId ?? '', points: String(q.points), difficulty: q.difficulty ?? '',
      explanation: q.explanation ?? '', rubric: k?.rubric ?? '',
    })
    setErrors({}); setDialogOpen(true)
  }

  function setOptionText(id: string, text: string) {
    setForm(f => ({ ...f, options: f.options.map(o => o.id === id ? { ...o, text } : o) }))
  }
  function addOption() {
    setForm(f => f.options.length >= 5 ? f : { ...f, options: [...f.options, newOption()] })
  }
  function removeOption(id: string) {
    setForm(f => f.options.length <= 2 ? f : { ...f, options: f.options.filter(o => o.id !== id), correct: f.correct === id ? '' : f.correct })
  }

  async function saveKey(questionId: string, f: typeof form) {
    if (!user) return new Error('no user')
    const row = f.type === 'mcq'
      ? { answer_key_json: { correct_option_id: f.correct } as Json, rubric_json: null }
      : { answer_key_json: {} as Json, rubric_json: { rubric: f.rubric.trim() } as Json }
    const { data: updated, error } = await supabase.from('question_answer_keys').update(row).eq('question_id', questionId).select('id')
    if (error) return error
    if (!updated || updated.length === 0) {
      const { error: insErr } = await supabase.from('question_answer_keys').insert({ question_id: questionId, teacher_id: user.id, ...row })
      if (insErr) return insErr
    }
    return null
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (!user || !bankId) return
    const next: Record<string, string> = {}
    const points = parseFloat(form.points)
    if (!form.text.trim()) next.question = 'Pertanyaan wajib diisi'
    if (!Number.isFinite(points) || points <= 0) next.points = 'Poin harus lebih dari 0'
    if (form.type === 'mcq') {
      const texts = form.options.map(o => o.text.trim().toLowerCase())
      if (texts.some(t => !t)) next.options = 'Semua opsi harus diisi'
      else if (new Set(texts).size !== texts.length) next.options = 'Isi opsi tidak boleh sama'
      if (!form.correct) next.correct = 'Pilih jawaban yang benar'
    }
    if (Object.keys(next).length > 0) { setErrors(next); return }

    setSaving(true)
    const base = {
      question_text: form.text.trim(), points,
      difficulty: form.difficulty || null, explanation: form.explanation.trim() || null,
      options_json: form.type === 'mcq' ? (form.options.map(o => ({ id: o.id, text: o.text.trim() })) as Json) : null,
    }

    if (editingId) {
      const { error } = await supabase.from('questions').update(base).eq('id', editingId)
      if (error) { toast.error('Gagal menyimpan soal'); setSaving(false); return }
      const keyErr = await saveKey(editingId, form)
      if (keyErr) { toast.error('Soal tersimpan, tetapi kunci jawaban gagal disimpan. Coba simpan ulang.'); setSaving(false); return }
    } else {
      const { data: inserted, error } = await supabase.from('questions')
        .insert({ ...base, question_bank_id: bankId, teacher_id: user.id, question_type: form.type })
        .select('id').single()
      if (error || !inserted) { toast.error('Gagal membuat soal'); setSaving(false); return }
      const keyErr = await saveKey(inserted.id, form)
      if (keyErr) {
        // jangan biarkan soal tanpa kunci: batalkan
        await supabase.from('questions').delete().eq('id', inserted.id)
        toast.error('Gagal menyimpan kunci jawaban, soal dibatalkan. Coba lagi.')
        setSaving(false); return
      }
    }

    setSaving(false); setDialogOpen(false); setEditingId(null)
    toast.success(editingId ? 'Soal diperbarui' : 'Soal berhasil dibuat')
    loadQuestions()
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    const { error } = await supabase.from('questions').delete().eq('id', deleteTarget.id)
    setDeleteTarget(null)
    if (error) {
      toast.error(error.code === '23503' ? 'Soal sudah dipakai di ujian, tidak bisa dihapus' : 'Gagal menghapus soal')
      return
    }
    toast.success('Soal dihapus')
    loadQuestions()
  }

  async function runExport(format: 'pdf' | 'pptx', withKey: boolean) {
    if (!bank) return
    const { exportQuestionBank } = await import('@/lib/export-documents')
    await exportQuestionBank({
      title: bank.title, subject: bank.subject, topic: bank.topic, description: bank.description,
      questions: questions.map(q => ({
        question_type: q.question_type, question_text: q.question_text, options: parseOptions(q.options_json),
        points: q.points, difficulty: q.difficulty, explanation: q.explanation,
        correct_option_id: keys[q.id]?.correctOptionId ?? null, rubric: keys[q.id]?.rubric ?? null,
      })),
    }, format, { withKey }, { teacherName: profile?.full_name })
  }

  const previewKey = preview ? keys[preview.id] : undefined

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2"><Link to="/teacher/question-banks"><ArrowLeft className="size-4" /> Kembali</Link></Button>
        <h1 className="text-2xl font-bold tracking-tight">{bank?.title || 'Bank Soal'}</h1>
        <p className="text-sm text-muted-foreground">{[bank?.subject, bank?.topic].filter(Boolean).join(' - ')}</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{questions.length} soal · {questions.reduce((s, q) => s + q.points, 0)} poin</p>
        <div className="flex gap-2">
          {questions.length > 0 && (
            <ExportMenu actions={[
              { label: 'PDF · lembar soal siswa', run: () => runExport('pdf', false) },
              { label: 'PDF · soal + kunci (guru)', run: () => runExport('pdf', true) },
              { label: 'PPT · slide soal', run: () => runExport('pptx', false) },
              { label: 'PPT · slide soal + kunci', run: () => runExport('pptx', true) },
            ]} />
          )}
          <Button onClick={openCreate}><Plus className="size-4" /> Tambah Soal</Button>
        </div>
      </div>

      {loading ? <p className="text-muted-foreground">Memuat...</p> : questions.length === 0 ? (
        <Empty><EmptyHeader><EmptyTitle>Belum ada soal</EmptyTitle><EmptyDescription>Tambahkan soal pilihan ganda atau esai</EmptyDescription></EmptyHeader>
          <EmptyContent><Button onClick={openCreate}><Plus className="size-4" /> Tambah Soal</Button></EmptyContent>
        </Empty>
      ) : (
        <div className="space-y-3">
          {questions.map((q, i) => {
            const opts = parseOptions(q.options_json)
            const k = keys[q.id]
            return (
              <Card key={q.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-muted-foreground">#{i + 1}</span>
                        <Badge variant={q.question_type === 'mcq' ? 'default' : 'secondary'}>{q.question_type === 'mcq' ? 'Pilihan Ganda' : 'Esai'}</Badge>
                        <Badge variant="outline">{q.points} poin</Badge>
                        {q.difficulty && <Badge variant="outline">{difficultyLabel[q.difficulty]}</Badge>}
                        {q.question_type === 'mcq' && !k?.correctOptionId && <Badge variant="destructive">Kunci belum ada</Badge>}
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm">{q.question_text}</p>
                      {q.question_type === 'mcq' && opts.length > 0 && (
                        <ul className="mt-2 space-y-1 text-sm">
                          {opts.map((o, idx) => (
                            <li key={o.id} className={o.id === k?.correctOptionId ? 'font-medium text-primary' : 'text-muted-foreground'}>
                              {String.fromCharCode(65 + idx)}. {o.text}{o.id === k?.correctOptionId && ' ✓'}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon-sm" title="Preview" onClick={() => setPreview(q)}><Eye className="size-4" /></Button>
                      <Button variant="ghost" size="icon-sm" title="Edit" onClick={() => openEdit(q)}><Pencil className="size-4" /></Button>
                      <Button variant="ghost" size="icon-sm" title="Hapus" onClick={() => setDeleteTarget(q)}><Trash2 className="size-4" /></Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Soal' : 'Tambah Soal'}</DialogTitle>
            <DialogDescription>
              {editingId ? 'Perubahan tidak mengubah ujian yang sudah dibuat (soal disalin ke ujian saat ujian dibuat).' : 'Buat soal pilihan ganda atau esai'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <Field><FieldLabel>Jenis Soal</FieldLabel>
              <RadioGroup value={form.type} onValueChange={(v) => !editingId && setForm({ ...form, type: v as 'mcq' | 'essay' })} className="flex gap-4">
                <div className="flex items-center gap-2"><RadioGroupItem value="mcq" id="r-mcq" disabled={!!editingId} /><label htmlFor="r-mcq" className="text-sm">Pilihan Ganda</label></div>
                <div className="flex items-center gap-2"><RadioGroupItem value="essay" id="r-essay" disabled={!!editingId} /><label htmlFor="r-essay" className="text-sm">Esai</label></div>
              </RadioGroup>
            </Field>
            <Field data-invalid={!!errors.question}><FieldLabel htmlFor="qtext">Pertanyaan</FieldLabel>
              <Textarea id="qtext" value={form.text} onChange={e => setForm({ ...form, text: e.target.value })} placeholder="Tulis pertanyaan..." className="min-h-24" />
              {errors.question && <FieldError>{errors.question}</FieldError>}
            </Field>
            {form.type === 'mcq' && (
              <Field data-invalid={!!errors.options || !!errors.correct}>
                <FieldLabel>Opsi Jawaban <span className="font-normal text-muted-foreground">(pilih bulatan untuk jawaban benar)</span></FieldLabel>
                <RadioGroup value={form.correct} onValueChange={(v) => setForm(f => ({ ...f, correct: v }))} className="space-y-2">
                  {form.options.map((opt, i) => (
                    <div key={opt.id} className="flex items-center gap-2">
                      <RadioGroupItem value={opt.id} id={`opt-${opt.id}`} />
                      <Input value={opt.text} onChange={e => setOptionText(opt.id, e.target.value)} placeholder={`Opsi ${String.fromCharCode(65 + i)}`} className="flex-1" />
                      {form.options.length > 2 && <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeOption(opt.id)}><Trash2 className="size-3" /></Button>}
                    </div>
                  ))}
                </RadioGroup>
                {form.options.length < 5 && <Button type="button" variant="outline" size="sm" onClick={addOption} className="mt-2"><Plus className="size-3" /> Tambah Opsi</Button>}
                {errors.options && <FieldError>{errors.options}</FieldError>}
                {errors.correct && <FieldError>{errors.correct}</FieldError>}
              </Field>
            )}
            {form.type === 'essay' && (
              <Field><FieldLabel htmlFor="qrubric">Rubrik Penilaian</FieldLabel>
                <Textarea id="qrubric" value={form.rubric} onChange={e => setForm({ ...form, rubric: e.target.value })} placeholder="Panduan penilaian untuk guru..." className="min-h-24" />
              </Field>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field data-invalid={!!errors.points}><FieldLabel htmlFor="qpoints">Poin</FieldLabel>
                <Input id="qpoints" type="number" step="0.5" min="0.5" value={form.points} onChange={e => setForm({ ...form, points: e.target.value })} />
                {errors.points && <FieldError>{errors.points}</FieldError>}
              </Field>
              <Field><FieldLabel htmlFor="qdiff">Tingkat Kesulitan</FieldLabel>
                <Select value={form.difficulty} onValueChange={(v) => setForm({ ...form, difficulty: v as 'easy' | 'medium' | 'hard' })}>
                  <SelectTrigger id="qdiff"><SelectValue placeholder="Pilih..." /></SelectTrigger>
                  <SelectContent><SelectItem value="easy">Mudah</SelectItem><SelectItem value="medium">Sedang</SelectItem><SelectItem value="hard">Sulit</SelectItem></SelectContent>
                </Select>
              </Field>
            </div>
            <Field><FieldLabel htmlFor="qexp">Pembahasan (opsional)</FieldLabel><Textarea id="qexp" value={form.explanation} onChange={e => setForm({ ...form, explanation: e.target.value })} placeholder="Pembahasan jawaban..." /></Field>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Batal</Button><Button type="submit" disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan'}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!preview} onOpenChange={(o) => { if (!o) setPreview(null) }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Preview Soal</DialogTitle><DialogDescription>Tampilan untuk siswa, lalu catatan khusus guru di bawahnya</DialogDescription></DialogHeader>
          {preview && (
            <div className="space-y-3">
              <Badge variant={preview.question_type === 'mcq' ? 'default' : 'secondary'}>{preview.question_type === 'mcq' ? 'Pilihan Ganda' : 'Esai'}</Badge>
              <p className="whitespace-pre-wrap text-sm font-medium">{preview.question_text}</p>
              {preview.question_type === 'mcq' && parseOptions(preview.options_json).map((opt, i) => (
                <div key={opt.id} className="flex items-center gap-2 rounded-md border p-2">
                  <span className="size-6 rounded-full bg-muted text-center text-xs leading-6">{String.fromCharCode(65 + i)}</span>
                  <span className="text-sm">{opt.text}</span>
                </div>
              ))}
              {preview.question_type === 'essay' && <Textarea placeholder="Jawaban siswa..." disabled className="min-h-24" />}
              <Separator />
              <div className="space-y-1 text-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Khusus guru</p>
                {preview.question_type === 'mcq' && (() => {
                  const idx = parseOptions(preview.options_json).findIndex(o => o.id === previewKey?.correctOptionId)
                  return <p>Kunci: <strong>{idx >= 0 ? String.fromCharCode(65 + idx) : 'belum diatur'}</strong></p>
                })()}
                {preview.question_type === 'essay' && <p>Rubrik: {previewKey?.rubric || <span className="text-muted-foreground">belum diisi</span>}</p>}
                {preview.explanation && <p>Pembahasan: {preview.explanation}</p>}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus soal ini?</AlertDialogTitle>
            <AlertDialogDescription>Soal dan kunci jawabannya akan dihapus permanen dari bank soal.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Ya, hapus</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
