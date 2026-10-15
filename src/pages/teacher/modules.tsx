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
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import { BookMarked, Plus, Search, MoreVertical, Trash2, Pencil, Eye, EyeOff } from 'lucide-react'
import { ExportMenu } from '@/components/export-menu'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { Json } from '@/lib/database.types'
import { emptyModuleContent, normalizeUrl, parseModuleContent, type ModuleContent, type ReferenceItem } from '@/lib/content-types'

interface ModuleRow {
  id: string; title: string; description: string | null; subject: string; topic: string
  learning_objectives: string | null; content: Json | null; status: 'draft' | 'published' | 'archived'
}
interface ClassRow { id: string; name: string }
interface RefRow { id: string; title: string; url: string }
const newRef = (r?: ReferenceItem): RefRow => ({ id: crypto.randomUUID(), title: r?.title ?? '', url: r?.url ?? '' })

const blankForm = () => ({
  title: '', description: '', subject: '', topic: '', learning_objectives: '',
  status: 'published' as 'draft' | 'published', ...emptyModuleContent,
})
type FormState = ReturnType<typeof blankForm>

const contentOf = (f: FormState, references: ReferenceItem[]): ModuleContent => ({
  grade_level: f.grade_level.trim(), duration: f.duration.trim(), prerequisites: f.prerequisites.trim(),
  opening: f.opening.trim(), main_activities: f.main_activities.trim(), closing: f.closing.trim(),
  assessment: f.assessment.trim(), media: f.media.trim(), references,
})

export function ModulesPage() {
  const { user, profile } = useAuth()
  const [modules, setModules] = useState<ModuleRow[]>([])
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ModuleRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<FormState>(blankForm())
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [selectedClasses, setSelectedClasses] = useState<string[]>([])
  const [initialShared, setInitialShared] = useState<string[]>([])
  const [refs, setRefs] = useState<RefRow[]>([])

  useEffect(() => { if (user) { loadModules(); loadClasses() } }, [user])

  async function loadModules() {
    if (!user) return
    const { data } = await supabase.from('teaching_modules').select('*').eq('teacher_id', user.id).neq('status', 'archived').order('created_at', { ascending: false })
    setModules((data ?? []) as ModuleRow[])
    setLoading(false)
  }

  async function loadClasses() {
    if (!user) return
    const { data } = await supabase.from('classes').select('id, name').eq('teacher_id', user.id).eq('is_archived', false)
    setClasses(data ?? [])
  }

  function openCreate() {
    setEditing(null); setForm(blankForm()); setRefs([]); setSelectedClasses([]); setInitialShared([]); setErrors({}); setDialogOpen(true)
  }

  async function openEdit(m: ModuleRow) {
    const c = parseModuleContent(m.content)
    setEditing(m)
    setForm({
      title: m.title, description: m.description ?? '', subject: m.subject, topic: m.topic,
      learning_objectives: m.learning_objectives ?? '', status: m.status === 'draft' ? 'draft' : 'published', ...c,
    })
    setRefs(c.references.map(r => newRef(r)))
    const { data } = await supabase.from('class_modules').select('class_id').eq('module_id', m.id)
    const shared = (data ?? []).map(r => r.class_id)
    setSelectedClasses(shared); setInitialShared(shared)
    setErrors({}); setDialogOpen(true)
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (!user) return
    if (!form.title.trim()) { setErrors({ title: 'Judul wajib diisi' }); return }
    const cleanRefs: ReferenceItem[] = []
    for (const r of refs) {
      if (!r.title.trim() && !r.url.trim()) continue
      const url = normalizeUrl(r.url)
      if (!url) { setErrors({ refs: `URL sumber tidak valid: "${r.url || '(kosong)'}"` }); return }
      cleanRefs.push({ title: r.title.trim(), url })
    }
    setSaving(true)

    const payload = {
      title: form.title.trim(), description: form.description.trim() || null,
      subject: form.subject.trim(), topic: form.topic.trim(),
      learning_objectives: form.learning_objectives.trim() || null,
      content: contentOf(form, cleanRefs) as unknown as Json, status: form.status,
    }

    let moduleId = editing?.id ?? ''
    if (editing) {
      const { error } = await supabase.from('teaching_modules').update(payload).eq('id', editing.id)
      if (error) { toast.error('Gagal menyimpan modul'); setSaving(false); return }
    } else {
      const { data, error } = await supabase.from('teaching_modules').insert({ ...payload, teacher_id: user.id }).select('id').single()
      if (error || !data) { toast.error('Gagal membuat modul'); setSaving(false); return }
      moduleId = data.id
    }

    // sinkronkan kelas: hanya tambah/hapus selisihnya
    const toAdd = selectedClasses.filter(id => !initialShared.includes(id))
    const toRemove = initialShared.filter(id => !selectedClasses.includes(id))
    let shareFailed = false
    if (toAdd.length > 0) {
      const { error } = await supabase.from('class_modules').insert(toAdd.map(cid => ({ class_id: cid, module_id: moduleId })))
      if (error) shareFailed = true
    }
    if (toRemove.length > 0) {
      const { error } = await supabase.from('class_modules').delete().eq('module_id', moduleId).in('class_id', toRemove)
      if (error) shareFailed = true
    }

    setSaving(false); setDialogOpen(false); setEditing(null)
    if (shareFailed) toast.warning('Modul tersimpan, tetapi pembagian ke kelas gagal. Buka Edit untuk mencoba lagi.')
    else toast.success(editing ? 'Modul diperbarui' : 'Modul berhasil dibuat')
    loadModules()
  }

  async function handleArchive(m: ModuleRow) {
    const { error } = await supabase.from('teaching_modules').update({ status: 'archived' }).eq('id', m.id)
    if (error) { toast.error('Gagal mengarsipkan modul'); return }
    toast.success('Modul diarsipkan')
    loadModules()
  }

  async function handleToggleStatus(m: ModuleRow) {
    const next = m.status === 'published' ? 'draft' : 'published'
    const { error } = await supabase.from('teaching_modules').update({ status: next }).eq('id', m.id)
    if (error) { toast.error('Gagal mengubah status'); return }
    toast.success(next === 'published' ? 'Modul diterbitkan ke siswa' : 'Modul dijadikan draf (disembunyikan dari siswa)')
    loadModules()
  }

  async function runExport(m: ModuleRow, format: 'pdf' | 'pptx') {
    const { exportModule } = await import('@/lib/export-documents')
    await exportModule({
      title: m.title, subject: m.subject, topic: m.topic, description: m.description,
      learning_objectives: m.learning_objectives, content: parseModuleContent(m.content),
    }, format, { teacherName: profile?.full_name })
  }

  const updateRef = (id: string, patch: Partial<RefRow>) => setRefs(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r))
  const set = (k: keyof FormState) => (e: { target: { value: string } }) => setForm(f => ({ ...f, [k]: e.target.value }))
  const filtered = modules.filter(m => m.title.toLowerCase().includes(search.toLowerCase()) || m.subject.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold tracking-tight">Modul Ajar</h1><p className="text-sm text-muted-foreground">Kelola modul pembelajaran, unduh sebagai PDF atau PPT</p></div>
        <Button onClick={openCreate}><Plus className="size-4" /> Buat Modul</Button>
      </div>
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Cari modul..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>
      {loading ? <p className="text-muted-foreground">Memuat...</p> : filtered.length === 0 ? (
        <Empty><EmptyHeader><EmptyTitle>Belum ada modul</EmptyTitle><EmptyDescription>Buat modul pembelajaran pertama Anda</EmptyDescription></EmptyHeader>
          <EmptyContent><Button onClick={openCreate}><Plus className="size-4" /> Buat Modul</Button></EmptyContent>
        </Empty>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map(m => {
            const c = parseModuleContent(m.content)
            return (
              <Card key={m.id} className="transition-shadow hover:shadow-md">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2"><BookMarked className="size-5 text-primary" /><h3 className="font-medium leading-tight">{m.title}</h3></div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm"><MoreVertical className="size-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(m)}><Pencil className="size-4" /> Edit</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleToggleStatus(m)}>
                          {m.status === 'published' ? <><EyeOff className="size-4" /> Jadikan draf</> : <><Eye className="size-4" /> Terbitkan</>}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleArchive(m)} variant="destructive"><Trash2 className="size-4" /> Arsipkan</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  {m.description && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{m.description}</p>}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {m.subject && <Badge variant="secondary">{m.subject}</Badge>}
                    {m.topic && <Badge variant="outline">{m.topic}</Badge>}
                    {c.grade_level && <Badge variant="outline">{c.grade_level}</Badge>}
                    {c.duration && <Badge variant="outline">{c.duration}</Badge>}
                    <Badge variant={m.status === 'published' ? 'default' : 'secondary'}>{m.status === 'published' ? 'Terbit' : 'Draf'}</Badge>
                  </div>
                  {c.references.length > 0 && (
                    <div className="mt-3 space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">Sumber ({c.references.length})</p>
                      {c.references.slice(0, 3).map((r, i) => (
                        <a key={i} href={r.url} target="_blank" rel="noopener noreferrer" className="block truncate text-xs text-primary hover:underline">{r.title || r.url}</a>
                      ))}
                      {c.references.length > 3 && <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => openEdit(m)}>+{c.references.length - 3} lainnya</button>}
                    </div>
                  )}
                  <div className="mt-4 flex gap-2">
                    <ExportMenu actions={[
                      { label: 'Unduh PDF', run: () => runExport(m, 'pdf') },
                      { label: 'Unduh PPT (slide)', run: () => runExport(m, 'pptx') },
                    ]} />
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Modul' : 'Buat Modul Baru'}</DialogTitle>
            <DialogDescription>Isi seperlunya. Bagian yang kosong tidak ikut tercetak di PDF/PPT. Untuk daftar, tulis satu butir per baris. Tautan: [teks](https://...) atau tempel URL langsung.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <Field data-invalid={!!errors.title}><FieldLabel htmlFor="modtitle">Judul</FieldLabel><Input id="modtitle" value={form.title} onChange={set('title')} placeholder="Judul modul" />{errors.title && <FieldError>{errors.title}</FieldError>}</Field>
            <div className="grid grid-cols-2 gap-3">
              <Field><FieldLabel htmlFor="modsubject">Mata Pelajaran</FieldLabel><Input id="modsubject" value={form.subject} onChange={set('subject')} placeholder="IPA" /></Field>
              <Field><FieldLabel htmlFor="modtopic">Topik</FieldLabel><Input id="modtopic" value={form.topic} onChange={set('topic')} placeholder="Ekosistem" /></Field>
              <Field><FieldLabel htmlFor="modgrade">Fase / Kelas</FieldLabel><Input id="modgrade" value={form.grade_level} onChange={set('grade_level')} placeholder="Fase D / Kelas VII" /></Field>
              <Field><FieldLabel htmlFor="moddur">Alokasi Waktu</FieldLabel><Input id="moddur" value={form.duration} onChange={set('duration')} placeholder="3 x 40 menit" /></Field>
            </div>
            <Field><FieldLabel htmlFor="moddesc">Deskripsi</FieldLabel><Textarea id="moddesc" value={form.description} onChange={set('description')} placeholder="Ringkasan modul" /></Field>
            <Field><FieldLabel htmlFor="modobj">Tujuan Pembelajaran</FieldLabel><Textarea id="modobj" value={form.learning_objectives} onChange={set('learning_objectives')} placeholder={'Siswa mampu...\nSiswa mampu...'} className="min-h-24" /></Field>
            <Separator />
            <Field><FieldLabel htmlFor="modpre">Pemahaman Prasyarat</FieldLabel><Textarea id="modpre" value={form.prerequisites} onChange={set('prerequisites')} /></Field>
            <Field><FieldLabel htmlFor="modopen">Kegiatan Pembuka</FieldLabel><Textarea id="modopen" value={form.opening} onChange={set('opening')} placeholder="Apersepsi, motivasi, ..." /></Field>
            <Field><FieldLabel htmlFor="modmain">Kegiatan Inti</FieldLabel><Textarea id="modmain" value={form.main_activities} onChange={set('main_activities')} className="min-h-28" /></Field>
            <Field><FieldLabel htmlFor="modclose">Penutup</FieldLabel><Textarea id="modclose" value={form.closing} onChange={set('closing')} placeholder="Refleksi, kesimpulan, tindak lanjut" /></Field>
            <Field><FieldLabel htmlFor="modassess">Asesmen</FieldLabel><Textarea id="modassess" value={form.assessment} onChange={set('assessment')} placeholder="Observasi, kuis, portofolio" /></Field>
            <Field><FieldLabel htmlFor="modmedia">Media & Sumber Belajar</FieldLabel><Textarea id="modmedia" value={form.media} onChange={set('media')} /></Field>
            <Separator />
            <Field data-invalid={!!errors.refs}>
              <FieldLabel>Sumber / Referensi</FieldLabel>
              <p className="text-xs text-muted-foreground">Buku, artikel, video, atau situs rujukan. Tampil sebagai tautan yang bisa diklik di PDF dan PPT.</p>
              <div className="space-y-2">
                {refs.map(r => (
                  <div key={r.id} className="flex items-center gap-2">
                    <Input value={r.title} onChange={e => updateRef(r.id, { title: e.target.value })} placeholder="Judul sumber (opsional)" className="w-2/5" />
                    <Input value={r.url} onChange={e => updateRef(r.id, { url: e.target.value })} placeholder="https://..." className="flex-1" />
                    <Button type="button" variant="ghost" size="icon-sm" onClick={() => setRefs(rs => rs.filter(x => x.id !== r.id))}><Trash2 className="size-3" /></Button>
                  </div>
                ))}
              </div>
              <Button type="button" variant="outline" size="sm" className="mt-1" onClick={() => setRefs(rs => [...rs, newRef()])}><Plus className="size-3" /> Tambah sumber</Button>
              {errors.refs && <FieldError>{errors.refs}</FieldError>}
            </Field>
            <Separator />
            <Field><FieldLabel htmlFor="modstatus">Status</FieldLabel>
              <Select value={form.status} onValueChange={(v) => setForm(f => ({ ...f, status: v as 'draft' | 'published' }))}>
                <SelectTrigger id="modstatus"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="published">Terbitkan ke siswa</SelectItem>
                  <SelectItem value="draft">Simpan sebagai draf</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field><FieldLabel>Bagikan ke Kelas</FieldLabel>
              <div className="space-y-2">
                {classes.length === 0 ? <p className="text-sm text-muted-foreground">Belum ada kelas.</p> :
                  classes.map(c => (
                    <div key={c.id} className="flex items-center gap-2">
                      <Checkbox id={`cls-${c.id}`} checked={selectedClasses.includes(c.id)} onCheckedChange={(checked) => {
                        setSelectedClasses(prev => checked ? [...prev, c.id] : prev.filter(id => id !== c.id))
                      }} /><label htmlFor={`cls-${c.id}`} className="text-sm">{c.name}</label>
                    </div>
                  ))}
              </div>
            </Field>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Batal</Button><Button type="submit" disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan'}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
