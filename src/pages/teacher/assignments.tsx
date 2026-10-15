import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/auth-context'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Field, FieldLabel, FieldError } from '@/components/ui/field'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, MoreVertical, Trash2, Pencil, Lock, Unlock, Users } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { downloadCsv } from '@/lib/csv'
import { SUBMISSION_BUCKET, fileNameOf } from '@/lib/files'

interface AssignmentRow {
  id: string; title: string; instructions: string | null; due_at: string | null
  status: 'draft' | 'published' | 'closed' | 'archived'; class_id: string; max_score?: number
  submission_mode?: 'text' | 'file' | 'both'
}
interface ClassRow { id: string; name: string }
interface SubmissionRow {
  id: string; student_id: string; student_name: string; submission_text: string | null
  submitted_at: string; score: number | null; feedback: string | null; file_path: string | null
}

const statusLabel: Record<string, string> = { draft: 'Draf', published: 'Aktif', closed: 'Ditutup' }
const blankForm = () => ({ title: '', instructions: '', class_id: '', due_at: '', max_score: '100', submission_mode: 'text' as 'text' | 'file' | 'both' })
const modeLabel = { text: 'Teks', file: 'File (PDF/gambar)', both: 'Teks dan/atau file' } as const

// <input type="datetime-local"> butuh waktu lokal "YYYY-MM-DDTHH:mm"
const toLocalInput = (iso: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

export function AssignmentsPage() {
  const { user } = useAuth()
  const [assignments, setAssignments] = useState<AssignmentRow[]>([])
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [counts, setCounts] = useState<Record<string, { total: number; ungraded: number }>>({})
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<AssignmentRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [form, setForm] = useState(blankForm())

  const [selected, setSelected] = useState<AssignmentRow | null>(null)
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([])
  const [notSubmitted, setNotSubmitted] = useState<string[]>([])
  const [loadingSubs, setLoadingSubs] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)

  useEffect(() => { if (user) { loadAssignments(); loadClasses() } }, [user])

  async function loadAssignments() {
    if (!user) return
    const { data } = await supabase.from('assignments').select('*').eq('teacher_id', user.id).neq('status', 'archived').order('created_at', { ascending: false })
    const rows = (data ?? []) as AssignmentRow[]
    setAssignments(rows)
    // jumlah pengumpulan & yang belum dinilai per tugas
    const c: Record<string, { total: number; ungraded: number }> = {}
    if (rows.length > 0) {
      const { data: subs } = await supabase.from('assignment_submissions').select('assignment_id, score').in('assignment_id', rows.map(r => r.id))
      for (const s of subs ?? []) {
        c[s.assignment_id] ??= { total: 0, ungraded: 0 }
        c[s.assignment_id].total++
        if (s.score === null) c[s.assignment_id].ungraded++
      }
    }
    setCounts(c)
    setLoading(false)
  }

  async function loadClasses() {
    if (!user) return
    const { data } = await supabase.from('classes').select('id, name').eq('teacher_id', user.id).eq('is_archived', false)
    setClasses(data ?? [])
  }

  function openCreate() { setEditing(null); setForm(blankForm()); setErrors({}); setDialogOpen(true) }
  function openEdit(a: AssignmentRow) {
    setEditing(a)
    setForm({ title: a.title, instructions: a.instructions ?? '', class_id: a.class_id, due_at: toLocalInput(a.due_at), max_score: String(a.max_score ?? 100), submission_mode: a.submission_mode ?? 'text' })
    setErrors({}); setDialogOpen(true)
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (!user) return
    const next: Record<string, string> = {}
    const max = parseFloat(form.max_score)
    if (!form.title.trim()) next.title = 'Judul wajib diisi'
    if (!form.class_id) next.class_id = 'Pilih kelas'
    if (!Number.isFinite(max) || max <= 0) next.max_score = 'Nilai maksimum harus lebih dari 0'
    if (Object.keys(next).length > 0) { setErrors(next); return }

    setSaving(true)
    // kelas tidak bisa diubah setelah tugas dibuat (tipe Update tidak mengizinkan class_id)
    const payload = {
      title: form.title.trim(), instructions: form.instructions.trim() || null,
      due_at: form.due_at ? new Date(form.due_at).toISOString() : null, max_score: max,
      // kolom submission_mode butuh SQL 003; hanya dikirim bila dipakai
      ...((form.submission_mode !== 'text' || (editing && 'submission_mode' in editing)) ? { submission_mode: form.submission_mode } : {}),
    }
    const res = editing
      ? await supabase.from('assignments').update(payload).eq('id', editing.id)
      : await supabase.from('assignments').insert({ ...payload, class_id: form.class_id, teacher_id: user.id, status: 'published' })
    setSaving(false)
    if (res.error) {
      toast.error(res.error.message.includes('submission_mode') ? 'Jalankan SQL 003 dulu (fitur pengumpulan file)' : res.error.message.includes('max_score') ? 'Jalankan migrasi SQL 002 dulu (kolom nilai maksimum tugas)' : 'Gagal menyimpan tugas')
      return
    }
    setDialogOpen(false); setEditing(null)
    toast.success(editing ? 'Tugas diperbarui' : 'Tugas berhasil dibuat')
    loadAssignments()
  }

  async function setStatus(a: AssignmentRow, status: 'published' | 'closed' | 'archived') {
    if (status === 'archived' && !window.confirm(`Arsipkan tugas "${a.title}"?`)) return
    const { error } = await supabase.from('assignments').update({ status }).eq('id', a.id)
    if (error) { toast.error('Gagal mengubah status tugas'); return }
    toast.success(status === 'closed' ? 'Tugas ditutup (siswa tidak bisa mengumpulkan lagi)' : status === 'published' ? 'Tugas dibuka kembali' : 'Tugas diarsipkan')
    loadAssignments()
  }

  async function openSubmissions(a: AssignmentRow) {
    setSelected(a); setLoadingSubs(true)
    const { data } = await supabase.from('assignment_submissions').select('id, student_id, submission_text, file_path, submitted_at, score, feedback').eq('assignment_id', a.id).order('submitted_at', { ascending: false })
    const { data: members } = await supabase.from('class_members').select('student_id').eq('class_id', a.class_id).eq('membership_status', 'active')
    const ids = [...new Set([...(data ?? []).map(r => r.student_id), ...(members ?? []).map(m => m.student_id)])]
    const names = new Map<string, string>()
    if (ids.length > 0) {
      const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', ids)
      ;(profiles ?? []).forEach(p => names.set(p.id, p.full_name))
    }
    const rows = data ?? []
    setSubmissions(rows.map(r => ({ ...r, student_name: names.get(r.student_id) ?? 'Tidak dikenal' })))
    const submittedIds = new Set(rows.map(r => r.student_id))
    setNotSubmitted((members ?? []).filter(m => !submittedIds.has(m.student_id)).map(m => names.get(m.student_id) ?? 'Tidak dikenal'))
    setLoadingSubs(false)
  }

  async function handleGrade(s: SubmissionRow) {
    const max = selected?.max_score ?? 100
    if (s.score === null || !Number.isFinite(s.score)) { toast.error('Isi nilai terlebih dahulu'); return }
    if (s.score < 0 || s.score > max) { toast.error(`Nilai harus antara 0 dan ${max}`); return }
    setSavingId(s.id)
    // penilaian lewat server: memvalidasi batas nilai dan otomatis mencatat ke tabel nilai (grades)
    const { error } = await supabase.rpc('grade_assignment_submission', { p_submission_id: s.id, p_score: s.score, p_feedback: s.feedback ?? '' })
    setSavingId(null)
    if (error) { toast.error('Gagal menyimpan nilai: ' + error.message); return }
    toast.success('Nilai disimpan')
    if (selected) openSubmissions(selected)
    loadAssignments()
  }

  async function openSubmissionFile(path: string) {
    const { data, error } = await supabase.storage.from(SUBMISSION_BUCKET).createSignedUrl(path, 600)
    if (error || !data) { toast.error('Gagal membuka file'); return }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  function exportSubmissions() {
    if (!selected) return
    downloadCsv(`tugas-${selected.title.replace(/\s+/g, '-').toLowerCase()}.csv`, [
      ['Nama', 'Dikumpulkan', 'File', 'Nilai', 'Maksimum', 'Feedback'],
      ...submissions.map(s => [s.student_name, new Date(s.submitted_at).toLocaleString('id-ID'), fileNameOf(s.file_path), s.score ?? '', selected.max_score ?? 100, s.feedback ?? '']),
      ...notSubmitted.map(n => [n, 'Belum mengumpulkan', '', '', selected.max_score ?? 100, '']),
    ])
  }

  const classMap = new Map(classes.map(c => [c.id, c.name]))
  const fmt = (d: string | null) => d ? new Date(d).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold tracking-tight">Tugas</h1><p className="text-sm text-muted-foreground">Kelola tugas siswa</p></div>
        <Button onClick={openCreate} disabled={classes.length === 0}><Plus className="size-4" /> Buat Tugas</Button>
      </div>
      {classes.length === 0 && <p className="text-sm text-muted-foreground">Buat kelas terlebih dahulu sebelum membuat tugas.</p>}
      {loading ? <p className="text-muted-foreground">Memuat...</p> : assignments.length === 0 ? (
        <Empty><EmptyHeader><EmptyTitle>Belum ada tugas</EmptyTitle><EmptyDescription>Buat tugas pertama Anda</EmptyDescription></EmptyHeader>
          <EmptyContent><Button onClick={openCreate} disabled={classes.length === 0}><Plus className="size-4" /> Buat Tugas</Button></EmptyContent>
        </Empty>
      ) : (
        <Card><CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Judul</TableHead><TableHead>Kelas</TableHead><TableHead>Tenggat</TableHead><TableHead>Pengumpulan</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Aksi</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {assignments.map(a => {
                const c = counts[a.id] ?? { total: 0, ungraded: 0 }
                const overdue = a.due_at && new Date(a.due_at) < new Date()
                return (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium"><button type="button" className="text-left hover:text-primary" onClick={() => openSubmissions(a)}>{a.title}</button>
                      {a.submission_mode && a.submission_mode !== 'text' && <p className="text-xs font-normal text-muted-foreground">{modeLabel[a.submission_mode]}</p>}
                    </TableCell>
                    <TableCell>{classMap.get(a.class_id) ?? '-'}</TableCell>
                    <TableCell className={overdue ? 'text-destructive' : ''}>{fmt(a.due_at)}</TableCell>
                    <TableCell>{c.total} {c.ungraded > 0 && <Badge variant="destructive" className="ml-1">{c.ungraded} belum dinilai</Badge>}</TableCell>
                    <TableCell><Badge variant={a.status === 'published' ? 'default' : 'secondary'}>{statusLabel[a.status] ?? a.status}</Badge></TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm"><MoreVertical className="size-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openSubmissions(a)}><Users className="size-4" /> Lihat pengumpulan</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openEdit(a)}><Pencil className="size-4" /> Edit</DropdownMenuItem>
                          {a.status === 'published'
                            ? <DropdownMenuItem onClick={() => setStatus(a, 'closed')}><Lock className="size-4" /> Tutup pengumpulan</DropdownMenuItem>
                            : <DropdownMenuItem onClick={() => setStatus(a, 'published')}><Unlock className="size-4" /> Buka kembali</DropdownMenuItem>}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => setStatus(a, 'archived')} variant="destructive"><Trash2 className="size-4" /> Arsipkan</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent></Card>
      )}

      <Dialog open={!!selected} onOpenChange={open => { if (!open) { setSelected(null); setSubmissions([]); setNotSubmitted([]) } }}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Pengumpulan: {selected?.title}</DialogTitle>
            <DialogDescription>Nilai maksimum {selected?.max_score ?? 100}. Nilai otomatis masuk ke rekap nilai siswa.</DialogDescription>
          </DialogHeader>
          {loadingSubs ? <p className="text-muted-foreground">Memuat...</p> : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{submissions.length} mengumpulkan, {notSubmitted.length} belum</p>
                <Button variant="outline" size="sm" onClick={exportSubmissions}>Ekspor CSV</Button>
              </div>
              {submissions.length === 0 ? <p className="text-muted-foreground">Belum ada pengumpulan.</p> : (
                <Table>
                  <TableHeader><TableRow><TableHead>Siswa</TableHead><TableHead>Jawaban</TableHead><TableHead>Nilai</TableHead><TableHead>Feedback</TableHead><TableHead className="text-right">Aksi</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {submissions.map(s => {
                      const late = selected?.due_at && new Date(s.submitted_at) > new Date(selected.due_at)
                      return (
                        <TableRow key={s.id}>
                          <TableCell className="align-top"><p className="font-medium">{s.student_name}</p>
                            <p className="text-xs text-muted-foreground">{fmt(s.submitted_at)}</p>
                            {late && <Badge variant="destructive" className="mt-1">Terlambat</Badge>}
                          </TableCell>
                          <TableCell className="max-w-xs whitespace-pre-wrap align-top text-sm">
                            {s.submission_text || (s.file_path ? '' : '-')}
                            {s.file_path && <Button variant="outline" size="sm" className="mt-1 h-auto py-1 text-xs" onClick={() => openSubmissionFile(s.file_path!)}>Buka file: {fileNameOf(s.file_path)}</Button>}
                          </TableCell>
                          <TableCell className="align-top">
                            <Input type="number" min="0" max={selected?.max_score ?? 100} step="0.5" value={s.score ?? ''} placeholder={`/ ${selected?.max_score ?? 100}`}
                              onChange={e => { const v = e.target.value === '' ? null : parseFloat(e.target.value); setSubmissions(prev => prev.map(x => x.id === s.id ? { ...x, score: v } : x)) }}
                              className="w-24" disabled={savingId === s.id} />
                          </TableCell>
                          <TableCell className="align-top">
                            <Textarea value={s.feedback ?? ''} onChange={e => { const fb = e.target.value; setSubmissions(prev => prev.map(x => x.id === s.id ? { ...x, feedback: fb } : x)) }} className="h-20" disabled={savingId === s.id} />
                          </TableCell>
                          <TableCell className="text-right align-top">
                            <Button size="sm" onClick={() => handleGrade(s)} disabled={savingId === s.id || s.score === null}>{savingId === s.id ? 'Menyimpan...' : 'Simpan'}</Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
              {notSubmitted.length > 0 && (
                <div className="rounded-md border p-3">
                  <p className="text-sm font-medium">Belum mengumpulkan ({notSubmitted.length})</p>
                  <p className="mt-1 text-sm text-muted-foreground">{notSubmitted.join(', ')}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? 'Edit Tugas' : 'Buat Tugas Baru'}</DialogTitle><DialogDescription>Tentukan kelas, instruksi, tenggat, dan nilai maksimum</DialogDescription></DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <Field data-invalid={!!errors.title}><FieldLabel htmlFor="atitle">Judul</FieldLabel><Input id="atitle" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Judul tugas" />{errors.title && <FieldError>{errors.title}</FieldError>}</Field>
            <Field data-invalid={!!errors.class_id}><FieldLabel htmlFor="aclass">Kelas</FieldLabel>
              <Select value={form.class_id} onValueChange={(v) => setForm({ ...form, class_id: v })} disabled={!!editing}>
                <SelectTrigger id="aclass"><SelectValue placeholder="Pilih kelas" /></SelectTrigger>
                <SelectContent>{classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
              {errors.class_id && <FieldError>{errors.class_id}</FieldError>}
            </Field>
            <Field><FieldLabel htmlFor="ainstr">Instruksi</FieldLabel><Textarea id="ainstr" value={form.instructions} onChange={e => setForm({ ...form, instructions: e.target.value })} placeholder="Instruksi tugas..." className="min-h-28" /></Field>
            <Field><FieldLabel htmlFor="amode">Cara pengumpulan</FieldLabel>
              <Select value={form.submission_mode} onValueChange={(v) => setForm({ ...form, submission_mode: v as 'text' | 'file' | 'both' })}>
                <SelectTrigger id="amode"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">{modeLabel.text}</SelectItem>
                  <SelectItem value="file">{modeLabel.file}</SelectItem>
                  <SelectItem value="both">{modeLabel.both}</SelectItem>
                </SelectContent>
              </Select>
              {form.submission_mode !== 'text' && <p className="text-xs text-muted-foreground">Siswa mengunggah PDF, gambar, atau Word (maks. 10 MB per file).</p>}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field><FieldLabel htmlFor="adue">Tenggat</FieldLabel><Input id="adue" type="datetime-local" value={form.due_at} onChange={e => setForm({ ...form, due_at: e.target.value })} /></Field>
              <Field data-invalid={!!errors.max_score}><FieldLabel htmlFor="amax">Nilai Maksimum</FieldLabel><Input id="amax" type="number" min="1" value={form.max_score} onChange={e => setForm({ ...form, max_score: e.target.value })} />{errors.max_score && <FieldError>{errors.max_score}</FieldError>}</Field>
            </div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Batal</Button><Button type="submit" disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan'}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
