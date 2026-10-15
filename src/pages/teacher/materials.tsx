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
import { Separator } from '@/components/ui/separator'
import { Checkbox } from '@/components/ui/checkbox'
import { ExportMenu } from '@/components/export-menu'
import { FileText, Plus, Search, ExternalLink, FileEdit, Link2, MoreVertical, Archive, Trash2, Eye, EyeOff, Pencil } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { Json } from '@/lib/database.types'
import { normalizeUrl, parseReferences, type ReferenceItem } from '@/lib/content-types'

const MAX_FILE_MB = 20

interface MaterialRow {
  id: string; title: string; description: string | null; subject: string; topic: string
  material_type: 'file' | 'text' | 'link'; visibility_status: 'draft' | 'published' | 'archived'
  external_url: string | null; text_content: string | null; file_path: string | null
  references_json?: Json | null
}
interface ClassRow { id: string; name: string }
interface RefRow { id: string; title: string; url: string }

const newRef = (r?: ReferenceItem): RefRow => ({ id: crypto.randomUUID(), title: r?.title ?? '', url: r?.url ?? '' })
const blankForm = () => ({
  title: '', description: '', subject: '', topic: '', material_type: 'text' as 'file' | 'text' | 'link',
  text_content: '', external_url: '', visibility_status: 'published' as 'draft' | 'published',
})

const TEXT_HINT = 'Tips format (untuk PDF/PPT): "# Judul" = slide/bagian baru, "## Subjudul", "- butir", [teks](https://tautan). Satu "# Judul" = satu slide di PPT.'

export function MaterialsPage() {
  const { user, profile } = useAuth()
  const [materials, setMaterials] = useState<MaterialRow[]>([])
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'draft'>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<MaterialRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [form, setForm] = useState(blankForm())
  const [refs, setRefs] = useState<RefRow[]>([])
  const [selectedClasses, setSelectedClasses] = useState<string[]>([])
  const [initialShared, setInitialShared] = useState<string[]>([])
  const [file, setFile] = useState<File | null>(null)

  useEffect(() => { if (user) { loadMaterials(); loadClasses() } }, [user])

  async function loadMaterials() {
    if (!user) return
    const { data } = await supabase.from('materials').select('*').eq('teacher_id', user.id).neq('visibility_status', 'archived').order('created_at', { ascending: false })
    setMaterials((data ?? []) as MaterialRow[])
    setLoading(false)
  }

  async function loadClasses() {
    if (!user) return
    const { data } = await supabase.from('classes').select('id, name').eq('teacher_id', user.id).eq('is_archived', false)
    setClasses(data ?? [])
  }

  function openCreate() {
    setEditing(null); setForm(blankForm()); setRefs([]); setFile(null)
    setSelectedClasses([]); setInitialShared([]); setErrors({}); setDialogOpen(true)
  }

  async function openEdit(m: MaterialRow) {
    setEditing(m)
    setForm({
      title: m.title, description: m.description ?? '', subject: m.subject, topic: m.topic, material_type: m.material_type,
      text_content: m.text_content ?? '', external_url: m.external_url ?? '',
      visibility_status: m.visibility_status === 'draft' ? 'draft' : 'published',
    })
    setRefs(parseReferences(m.references_json).map(r => newRef(r)))
    setFile(null); setErrors({})
    const { data } = await supabase.from('class_materials').select('class_id').eq('material_id', m.id)
    const shared = (data ?? []).map(r => r.class_id)
    setSelectedClasses(shared); setInitialShared(shared)
    setDialogOpen(true)
  }

  const updateRef = (id: string, patch: Partial<RefRow>) => setRefs(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r))

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (!user) return
    const next: Record<string, string> = {}
    if (!form.title.trim()) next.title = 'Judul wajib diisi'
    if (form.material_type === 'text' && !form.text_content.trim()) next.text_content = 'Konten wajib diisi'
    let externalUrl: string | null = null
    if (form.material_type === 'link') {
      externalUrl = normalizeUrl(form.external_url)
      if (!externalUrl) next.external_url = 'Masukkan URL yang valid, mis. https://contoh.com/materi'
    }
    if (form.material_type === 'file') {
      if (!file && !editing?.file_path) next.file = 'File wajib diunggah'
      if (file && file.size > MAX_FILE_MB * 1024 * 1024) next.file = `Ukuran file maksimal ${MAX_FILE_MB} MB`
    }
    // sumber/referensi: baris kosong dilewati, URL dirapikan
    const cleanRefs: ReferenceItem[] = []
    for (const r of refs) {
      if (!r.title.trim() && !r.url.trim()) continue
      const url = normalizeUrl(r.url)
      if (!url) { next.refs = `URL sumber tidak valid: "${r.url || '(kosong)'}"`; break }
      cleanRefs.push({ title: r.title.trim(), url })
    }
    if (Object.keys(next).length > 0) { setErrors(next); return }

    setSaving(true)
    let uploadedPath: string | null = null
    if (form.material_type === 'file' && file) {
      // nama file dibersihkan: spasi/karakter khusus/non-ASCII membuat upload Supabase Storage gagal
      const safeName = file.name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w.\-]+/g, '_').slice(-120)
      const path = `${user.id}/${Date.now()}_${safeName}`
      const { error: uploadError } = await supabase.storage.from('materials').upload(path, file)
      if (uploadError) { toast.error('Gagal mengunggah file'); setSaving(false); return }
      uploadedPath = path
    }

    const payload = {
      title: form.title.trim(), description: form.description.trim() || null,
      subject: form.subject.trim(), topic: form.topic.trim(), material_type: form.material_type,
      text_content: form.material_type === 'text' ? form.text_content.trim() : null,
      external_url: form.material_type === 'link' ? externalUrl : null,
      file_path: form.material_type === 'file' ? (uploadedPath ?? editing?.file_path ?? null) : null,
      visibility_status: form.visibility_status,
      // kolom references_json butuh migrasi 002; hanya dikirim bila dipakai
      ...((cleanRefs.length > 0 || (editing && 'references_json' in editing)) ? { references_json: cleanRefs as unknown as Json } : {}),
    }

    let materialId = editing?.id ?? ''
    if (editing) {
      const { error } = await supabase.from('materials').update(payload).eq('id', editing.id)
      if (error) {
        if (uploadedPath) await supabase.storage.from('materials').remove([uploadedPath])
        toast.error(error.message.includes('references_json') ? 'Jalankan migrasi SQL 002 dulu agar sumber/referensi bisa disimpan' : 'Gagal menyimpan materi')
        setSaving(false); return
      }
    } else {
      const { data, error } = await supabase.from('materials').insert({ ...payload, teacher_id: user.id }).select('id').single()
      if (error || !data) {
        if (uploadedPath) await supabase.storage.from('materials').remove([uploadedPath])
        toast.error(error?.message.includes('references_json') ? 'Jalankan migrasi SQL 002 dulu agar sumber/referensi bisa disimpan' : 'Gagal membuat materi')
        setSaving(false); return
      }
      materialId = data.id
    }

    // file lama dibersihkan bila diganti / tipe materi berubah
    if (editing?.file_path && editing.file_path !== payload.file_path) await supabase.storage.from('materials').remove([editing.file_path])

    const toAdd = selectedClasses.filter(id => !initialShared.includes(id))
    const toRemove = initialShared.filter(id => !selectedClasses.includes(id))
    let shareFailed = false
    if (toAdd.length > 0) {
      const { error } = await supabase.from('class_materials').insert(toAdd.map(cid => ({ class_id: cid, material_id: materialId })))
      if (error) shareFailed = true
    }
    if (toRemove.length > 0) {
      const { error } = await supabase.from('class_materials').delete().eq('material_id', materialId).in('class_id', toRemove)
      if (error) shareFailed = true
    }

    setSaving(false); setDialogOpen(false); setEditing(null)
    if (shareFailed) toast.warning('Materi tersimpan, tetapi pembagian ke kelas gagal. Buka Edit untuk mencoba lagi.')
    else toast.success(editing ? 'Materi diperbarui' : 'Materi berhasil dibuat')
    loadMaterials()
  }

  async function handleArchive(m: MaterialRow) {
    const { error } = await supabase.from('materials').update({ visibility_status: 'archived' }).eq('id', m.id)
    if (error) { toast.error('Gagal mengarsipkan'); return }
    toast.success('Materi diarsipkan')
    loadMaterials()
  }

  async function handleToggleStatus(m: MaterialRow) {
    const next = m.visibility_status === 'published' ? 'draft' : 'published'
    const { error } = await supabase.from('materials').update({ visibility_status: next }).eq('id', m.id)
    if (error) { toast.error('Gagal mengubah status'); return }
    toast.success(next === 'published' ? 'Materi diterbitkan ke siswa' : 'Materi dijadikan draf (disembunyikan dari siswa)')
    loadMaterials()
  }

  async function handleDelete(m: MaterialRow) {
    if (!window.confirm(`Hapus materi "${m.title}"? Tindakan ini tidak bisa dibatalkan.`)) return
    const { error } = await supabase.from('materials').delete().eq('id', m.id)
    if (error) { toast.error('Gagal menghapus materi'); return }
    if (m.file_path) await supabase.storage.from('materials').remove([m.file_path])
    toast.success('Materi dihapus')
    loadMaterials()
  }

  async function openFile(m: MaterialRow) {
    if (!m.file_path) return
    const { data, error } = await supabase.storage.from('materials').createSignedUrl(m.file_path, 600)
    if (error || !data) { toast.error('Gagal membuka file'); return }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  async function runExport(m: MaterialRow, format: 'pdf' | 'pptx') {
    const { exportMaterial } = await import('@/lib/export-documents')
    await exportMaterial({
      title: m.title, subject: m.subject, topic: m.topic, description: m.description,
      text_content: m.text_content ?? '', material_type: m.material_type, external_url: m.external_url,
      references: parseReferences(m.references_json),
    }, format, { teacherName: profile?.full_name })
  }

  const q = search.toLowerCase()
  const filtered = materials.filter(m =>
    (statusFilter === 'all' || m.visibility_status === statusFilter) &&
    (m.title.toLowerCase().includes(q) || m.subject.toLowerCase().includes(q) || m.topic.toLowerCase().includes(q)))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold tracking-tight">Bahan Ajar</h1><p className="text-sm text-muted-foreground">Kelola materi, sumber belajar, dan unduh sebagai PDF atau PPT</p></div>
        <Button onClick={openCreate}><Plus className="size-4" /> Tambah Materi</Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Cari judul, mapel, atau topik..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua status</SelectItem>
            <SelectItem value="published">Terbit</SelectItem>
            <SelectItem value="draft">Draf</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? <p className="text-muted-foreground">Memuat...</p> : filtered.length === 0 ? (
        <Empty><EmptyHeader><EmptyTitle>Belum ada materi</EmptyTitle><EmptyDescription>Buat materi pertama Anda</EmptyDescription></EmptyHeader>
          <EmptyContent><Button onClick={openCreate}><Plus className="size-4" /> Tambah Materi</Button></EmptyContent>
        </Empty>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map(m => {
            const mrefs = parseReferences(m.references_json)
            const canExport = (m.material_type === 'text' && !!m.text_content) || (m.material_type === 'link' && !!m.external_url)
            return (
              <Card key={m.id} className="transition-shadow hover:shadow-md">
                <CardContent className="flex h-full flex-col p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {m.material_type === 'link' ? <Link2 className="size-5 text-primary" /> : m.material_type === 'text' ? <FileEdit className="size-5 text-primary" /> : <FileText className="size-5 text-primary" />}
                      <h3 className="font-medium leading-tight">{m.title}</h3>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm"><MoreVertical className="size-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(m)}><Pencil className="size-4" /> Edit</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleToggleStatus(m)}>
                          {m.visibility_status === 'published' ? <><EyeOff className="size-4" /> Jadikan draf</> : <><Eye className="size-4" /> Terbitkan</>}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleArchive(m)}><Archive className="size-4" /> Arsipkan</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDelete(m)} variant="destructive"><Trash2 className="size-4" /> Hapus</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  {m.description && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{m.description}</p>}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {m.subject && <Badge variant="secondary">{m.subject}</Badge>}
                    {m.topic && <Badge variant="outline">{m.topic}</Badge>}
                    <Badge variant={m.visibility_status === 'published' ? 'default' : 'secondary'}>{m.visibility_status === 'published' ? 'Terbit' : 'Draf'}</Badge>
                  </div>

                  {m.material_type === 'link' && m.external_url && (
                    <a href={m.external_url} target="_blank" rel="noopener noreferrer" className="mt-3 flex items-center gap-1 break-all text-xs text-primary hover:underline">
                      <ExternalLink className="size-3 shrink-0" /> {m.external_url}
                    </a>
                  )}
                  {mrefs.length > 0 && (
                    <div className="mt-3 space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">Sumber ({mrefs.length})</p>
                      {mrefs.slice(0, 3).map((r, i) => (
                        <a key={i} href={r.url} target="_blank" rel="noopener noreferrer" className="block truncate text-xs text-primary hover:underline">{r.title || r.url}</a>
                      ))}
                      {mrefs.length > 3 && <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => openEdit(m)}>+{mrefs.length - 3} lainnya</button>}
                    </div>
                  )}

                  <div className="mt-auto flex flex-wrap gap-2 pt-4">
                    {m.material_type === 'file' && m.file_path && (
                      <Button variant="outline" size="sm" onClick={() => openFile(m)}><ExternalLink className="size-4" /> Buka file</Button>
                    )}
                    {canExport && (
                      <ExportMenu actions={[
                        { label: 'Unduh PDF', run: () => runExport(m, 'pdf') },
                        { label: 'Unduh PPT (slide)', run: () => runExport(m, 'pptx') },
                      ]} />
                    )}
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
            <DialogTitle>{editing ? 'Edit Materi' : 'Tambah Materi Baru'}</DialogTitle>
            <DialogDescription>Pilih jenis materi, tambahkan sumber belajar, lalu bagikan ke kelas</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <Field data-invalid={!!errors.title}><FieldLabel htmlFor="mtitle">Judul</FieldLabel>
              <Input id="mtitle" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Judul materi" />
              {errors.title && <FieldError>{errors.title}</FieldError>}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field><FieldLabel htmlFor="msubject">Mata Pelajaran</FieldLabel><Input id="msubject" value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} placeholder="Matematika" /></Field>
              <Field><FieldLabel htmlFor="mtopic">Topik</FieldLabel><Input id="mtopic" value={form.topic} onChange={e => setForm({ ...form, topic: e.target.value })} placeholder="Aljabar" /></Field>
            </div>
            <Field><FieldLabel htmlFor="mtype">Jenis Materi</FieldLabel>
              <Select value={form.material_type} onValueChange={(v) => setForm({ ...form, material_type: v as 'file' | 'text' | 'link' })}>
                <SelectTrigger id="mtype"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Teks (bisa diunduh PDF/PPT)</SelectItem>
                  <SelectItem value="link">Tautan Eksternal</SelectItem>
                  <SelectItem value="file">File</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {form.material_type === 'text' && (
              <Field data-invalid={!!errors.text_content}><FieldLabel htmlFor="mcontent">Konten</FieldLabel>
                <Textarea id="mcontent" value={form.text_content} onChange={e => setForm({ ...form, text_content: e.target.value })} placeholder={'# Pengertian\nTulis materi di sini...\n\n# Contoh\n- butir satu\n- butir dua'} className="min-h-40 font-mono text-sm" />
                <p className="text-xs text-muted-foreground">{TEXT_HINT}</p>
                {errors.text_content && <FieldError>{errors.text_content}</FieldError>}
              </Field>
            )}
            {form.material_type === 'file' && (
              <Field data-invalid={!!errors.file}>
                <FieldLabel htmlFor="mfile">File{editing?.file_path ? ' (kosongkan bila tidak diganti)' : ''}</FieldLabel>
                <Input id="mfile" type="file" onChange={e => setFile(e.target.files?.[0] ?? null)} />
                {editing?.file_path && !file && <p className="text-xs text-muted-foreground">File saat ini: {editing.file_path.split('/').pop()}</p>}
                {errors.file && <FieldError>{errors.file}</FieldError>}
              </Field>
            )}
            {form.material_type === 'link' && (
              <Field data-invalid={!!errors.external_url}><FieldLabel htmlFor="murl">URL Materi</FieldLabel>
                <Input id="murl" value={form.external_url} onChange={e => setForm({ ...form, external_url: e.target.value })} placeholder="https://..." />
                {errors.external_url && <FieldError>{errors.external_url}</FieldError>}
              </Field>
            )}
            <Field><FieldLabel htmlFor="mdesc">Deskripsi</FieldLabel>
              <Textarea id="mdesc" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Deskripsi singkat (opsional)" />
            </Field>

            <Separator />
            <Field data-invalid={!!errors.refs}>
              <FieldLabel>Sumber / Referensi</FieldLabel>
              <p className="text-xs text-muted-foreground">Buku, artikel, video, atau situs yang dijadikan rujukan. Tampil sebagai tautan yang bisa diklik di PDF dan PPT.</p>
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
            <Field><FieldLabel htmlFor="mstatus">Status</FieldLabel>
              <Select value={form.visibility_status} onValueChange={(v) => setForm({ ...form, visibility_status: v as 'draft' | 'published' })}>
                <SelectTrigger id="mstatus"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="published">Terbitkan ke siswa</SelectItem>
                  <SelectItem value="draft">Simpan sebagai draf</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Bagikan ke Kelas</FieldLabel>
              <div className="space-y-2">
                {classes.length === 0 ? <p className="text-sm text-muted-foreground">Belum ada kelas. Buat kelas terlebih dahulu.</p> :
                  classes.map(c => (
                    <div key={c.id} className="flex items-center gap-2">
                      <Checkbox id={`mcls-${c.id}`} checked={selectedClasses.includes(c.id)} onCheckedChange={(checked) => {
                        setSelectedClasses(prev => checked ? [...prev, c.id] : prev.filter(id => id !== c.id))
                      }} />
                      <label htmlFor={`mcls-${c.id}`} className="text-sm">{c.name}</label>
                    </div>
                  ))}
              </div>
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Batal</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
