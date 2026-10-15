import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/auth-context'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { ClipboardList, Clock, CheckCircle, AlertCircle, Paperclip } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { SUBMISSION_ACCEPT, SUBMISSION_BUCKET, MAX_SUBMISSION_MB, safeFileName, validateSubmissionFile, fileNameOf } from '@/lib/files'

interface AssignmentItem {
  id: string
  title: string
  instructions: string | null
  due_at: string | null
  status: string
  class_name: string
  max_score: number
  submission_mode: 'text' | 'file' | 'both'
}

interface SubmissionInfo {
  id: string
  submission_text: string | null
  file_path: string | null
  submitted_at: string
  score: number | null
  feedback: string | null
}

export function StudentAssignmentsPage() {
  const { user } = useAuth()
  const [assignments, setAssignments] = useState<(AssignmentItem & { submission?: SubmissionInfo })[]>([])
  const [loading, setLoading] = useState(true)
  const [submitId, setSubmitId] = useState<string | null>(null)
  const [submitText, setSubmitText] = useState('')
  const [saving, setSaving] = useState(false)
  const [submitFile, setSubmitFile] = useState<File | null>(null)

  useEffect(() => {
    if (user) loadAssignments()
  }, [user])

  async function loadAssignments() {
    if (!user) return

    const { data: memberships } = await supabase
      .from('class_members')
      .select('class_id')
      .eq('student_id', user.id)
      .eq('membership_status', 'active')

    const classIds = memberships?.map(m => m.class_id) ?? []
    if (classIds.length === 0) { setLoading(false); return }

    const { data: classesData } = await supabase
      .from('classes')
      .select('id, name')
      .in('id', classIds)

    const classNameMap = new Map<string, string>()
    ;(classesData ?? []).forEach(c => classNameMap.set(c.id, c.name))

    const { data: assignData } = await supabase
      .from('assignments')
      .select('*')   // '*' agar tetap jalan walau kolom submission_mode (SQL 003) belum ada
      .in('class_id', classIds)
      .in('status', ['published', 'closed'])
      .order('created_at', { ascending: false })

    if (!assignData || assignData.length === 0) { setLoading(false); return }

    const { data: subs } = await supabase
      .from('assignment_submissions')
      .select('id, assignment_id, submission_text, file_path, submitted_at, score, feedback')
      .eq('student_id', user.id)

    const subMap = new Map<string, SubmissionInfo>()
    ;(subs ?? []).forEach(s => subMap.set(s.assignment_id, s))

    const combined = assignData.map(a => ({
      id: a.id,
      title: a.title,
      instructions: a.instructions,
      due_at: a.due_at,
      status: a.status,
      max_score: Number(a.max_score ?? 100),
      submission_mode: ((a as { submission_mode?: 'text' | 'file' | 'both' }).submission_mode ?? 'text'),
      class_name: classNameMap.get(a.class_id) ?? '',
      submission: subMap.get(a.id),
    }))

    setAssignments(combined)
    setLoading(false)
  }

  function openSubmit(assignId: string) {
    // tampilkan jawaban sebelumnya supaya bisa diperbarui, bukan mulai dari kosong
    const existing = assignments.find(a => a.id === assignId)?.submission
    setSubmitText(existing?.submission_text ?? '')
    setSubmitFile(null)
    setSubmitId(assignId)
  }

  async function openSavedFile(path: string) {
    const { data, error } = await supabase.storage.from(SUBMISSION_BUCKET).createSignedUrl(path, 600)
    if (error || !data) { toast.error('Gagal membuka file'); return }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  async function handleSubmit() {
    if (!user || !submitId) return
    const assignment = assignments.find(a => a.id === submitId)
    if (!assignment) return
    const existing = assignment.submission
    const mode = assignment.submission_mode
    const text = submitText.trim()
    const hasFile = !!submitFile || !!existing?.file_path

    if (mode === 'text' && !text) { toast.error('Tulis jawaban terlebih dahulu'); return }
    if (mode === 'file' && !hasFile) { toast.error('Pilih file yang akan dikumpulkan'); return }
    if (mode === 'both' && !text && !hasFile) { toast.error('Tulis jawaban atau pilih file'); return }
    if (submitFile) {
      const problem = validateSubmissionFile(submitFile)
      if (problem) { toast.error(problem); return }
    }

    setSaving(true)
    // 1) unggah file (folder = id siswa; aturan akses dijaga policy storage)
    let newPath: string | null = null
    if (submitFile && mode !== 'text') {
      newPath = `${user.id}/${submitId}/${Date.now()}_${safeFileName(submitFile.name)}`
      const { error: upErr } = await supabase.storage.from(SUBMISSION_BUCKET).upload(newPath, submitFile, { contentType: submitFile.type || undefined })
      if (upErr) { toast.error('Gagal mengunggah file: ' + upErr.message); setSaving(false); return }
    }
    const filePath = mode === 'text' ? null : (newPath ?? existing?.file_path ?? null)

    // 2) simpan pengumpulan
    const payload = { submission_text: text || null, file_path: filePath }
    const { error } = existing
      ? await supabase.from('assignment_submissions').update(payload).eq('id', existing.id)
      : await supabase.from('assignment_submissions').insert({ ...payload, assignment_id: submitId, student_id: user.id })   // waktu kumpul diisi server
    if (error) {
      if (newPath) await supabase.storage.from(SUBMISSION_BUCKET).remove([newPath])   // jangan tinggalkan file yatim
      toast.error('Gagal mengumpulkan: ' + error.message)
      setSaving(false)
      return
    }

    // 3) file lama yang diganti dibersihkan
    if (newPath && existing?.file_path && existing.file_path !== newPath) {
      await supabase.storage.from(SUBMISSION_BUCKET).remove([existing.file_path])
    }

    setSaving(false)
    setSubmitId(null)
    setSubmitText('')
    setSubmitFile(null)
    toast.success('Tugas berhasil dikumpulkan')
    loadAssignments()
  }

  function getStatus(a: AssignmentItem & { submission?: SubmissionInfo }) {
    if (a.submission) {
      if (a.submission.score !== null) return { label: 'Dinilai', variant: 'default' as const, icon: CheckCircle }
      return { label: 'Dikumpulkan', variant: 'secondary' as const, icon: CheckCircle }
    }
    if (a.status === 'closed') return { label: 'Ditutup', variant: 'secondary' as const, icon: AlertCircle }
    if (a.due_at && new Date(a.due_at) < new Date()) {
      return { label: 'Lewat tenggat', variant: 'destructive' as const, icon: AlertCircle }
    }
    return { label: 'Belum dikumpulkan', variant: 'outline' as const, icon: Clock }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Tugas</h1>
        <p className="text-sm text-muted-foreground">Daftar tugas dari kelas Anda</p>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Memuat...</p>
      ) : assignments.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Belum ada tugas</EmptyTitle>
            <EmptyDescription>Tugas akan muncul saat guru menerbitkannya</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-3">
          {assignments.map(a => {
            const status = getStatus(a)
            return (
              <Card key={a.id} className="transition-shadow hover:shadow-md">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <ClipboardList className="size-5 text-primary" />
                      <div>
                        <CardTitle className="text-base leading-tight">{a.title}</CardTitle>
                        <p className="text-xs text-muted-foreground">{a.class_name}</p>
                      </div>
                    </div>
                    <Badge variant={status.variant}>
                      <status.icon className="size-3" />
                      {status.label}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {a.instructions && <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-3">{a.instructions}</p>}
                  {a.due_at && (
                    <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="size-3" />
                      Batas waktu: {new Date(a.due_at).toLocaleString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  )}
                  {a.submission_mode !== 'text' && (
                    <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                      <Paperclip className="size-3" /> {a.submission_mode === 'file' ? 'Dikumpulkan sebagai file (PDF/gambar)' : 'Boleh teks dan/atau file'}
                    </p>
                  )}
                  {a.submission?.file_path && (
                    <button type="button" className="mt-2 flex items-center gap-1 text-xs text-primary hover:underline" onClick={() => openSavedFile(a.submission!.file_path!)}>
                      <Paperclip className="size-3" /> File terkumpul: {fileNameOf(a.submission.file_path)}
                    </button>
                  )}
                  {a.submission?.score !== null && a.submission?.score !== undefined && (
                    <div className="mt-3 rounded-md bg-muted/30 p-3">
                      <p className="text-sm font-medium">Nilai: {a.submission.score} / {a.max_score}</p>
                      {a.submission.feedback && <p className="mt-1 text-sm text-muted-foreground">{a.submission.feedback}</p>}
                    </div>
                  )}
                  <Button
                    size="sm"
                    variant={a.submission ? 'outline' : 'default'}
                    className="mt-3"
                    onClick={() => openSubmit(a.id)}
                    disabled={(a.submission?.score !== null && a.submission?.score !== undefined) || a.status === 'closed'}
                  >
                    {a.submission ? 'Perbarui Jawaban' : 'Kumpulkan'}
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog open={!!submitId} onOpenChange={(o) => { if (!o) setSubmitId(null) }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Kumpulkan Tugas</DialogTitle>
            <DialogDescription>
              Kumpulkan jawaban sesuai petunjuk tugas.
              {(() => { const d = assignments.find(a => a.id === submitId)?.due_at; return d && new Date(d) < new Date() ? ' Tenggat sudah lewat, pengumpulan akan ditandai terlambat.' : '' })()}
            </DialogDescription>
          </DialogHeader>
          {(() => {
            const cur = assignments.find(x => x.id === submitId)
            const mode = cur?.submission_mode ?? 'text'
            return (
              <div className="space-y-4">
                {mode !== 'file' && (
                  <Textarea
                    value={submitText}
                    onChange={e => setSubmitText(e.target.value)}
                    placeholder={mode === 'both' ? 'Jawaban teks (opsional jika mengunggah file)...' : 'Tulis jawaban tugas di sini...'}
                    className="min-h-40"
                  />
                )}
                {mode !== 'text' && (
                  <div className="space-y-2">
                    <label htmlFor="subfile" className="text-sm font-medium">File jawaban {mode === 'file' ? '' : '(opsional)'}</label>
                    <Input id="subfile" type="file" accept={SUBMISSION_ACCEPT} onChange={e => setSubmitFile(e.target.files?.[0] ?? null)} />
                    <p className="text-xs text-muted-foreground">PDF, gambar (JPG/PNG/WEBP), atau Word. Maks. {MAX_SUBMISSION_MB} MB. Beberapa foto? Gabungkan dulu menjadi satu PDF.</p>
                    {cur?.submission?.file_path && !submitFile && (
                      <p className="text-xs text-muted-foreground">File saat ini: {fileNameOf(cur.submission.file_path)}. Pilih file baru untuk menggantinya.</p>
                    )}
                    {submitFile && <p className="text-xs text-muted-foreground">Dipilih: {submitFile.name} ({(submitFile.size / 1024 / 1024).toFixed(2)} MB)</p>}
                  </div>
                )}
              </div>
            )
          })()}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSubmitId(null)}>Batal</Button>
            <Button onClick={handleSubmit} disabled={saving}>{saving ? 'Mengumpulkan...' : 'Kumpulkan'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
