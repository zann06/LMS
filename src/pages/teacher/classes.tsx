import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/auth-context'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Field, FieldLabel, FieldError } from '@/components/ui/field'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty'
import { Users, Plus, Archive, ArchiveRestore, MoreVertical, Download, Trash2 } from 'lucide-react'
import { DeleteClassDialog } from '@/components/delete-class-dialog'
import { downloadCsv } from '@/lib/csv'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface ClassRow {
  id: string
  name: string
  academic_year: string
  description: string | null
  is_archived: boolean
}

export function ClassesPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({})
  const [showArchived, setShowArchived] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ClassRow | null>(null)

  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [form, setForm] = useState({ name: '', academic_year: '', description: '' })

  useEffect(() => {
    if (user) loadClasses()
  }, [user])

  async function loadClasses() {
    if (!user) return
    const { data } = await supabase
      .from('classes')
      .select('*')
      .eq('teacher_id', user.id)
      .order('created_at', { ascending: false })

    setClasses(data ?? [])

    // satu query untuk semua kelas (sebelumnya satu query per kelas)
    const counts: Record<string, number> = {}
    const ids = (data ?? []).map(c => c.id)
    if (ids.length > 0) {
      const { data: members } = await supabase.from('class_members').select('class_id').eq('membership_status', 'active').in('class_id', ids)
      for (const m of members ?? []) counts[m.class_id] = (counts[m.class_id] ?? 0) + 1
    }
    setMemberCounts(counts)
    setLoading(false)
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!user) return
    const newErrors: Record<string, string> = {}
    if (!form.name.trim()) newErrors.name = 'Nama kelas wajib diisi'
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return }

    setSaving(true)
    const { data, error } = await supabase
      .from('classes')
      .insert({ teacher_id: user.id, name: form.name.trim(), academic_year: form.academic_year.trim(), description: form.description.trim() || null })
      .select()
      .single()

    setSaving(false)
    if (error) { toast.error('Gagal membuat kelas'); return }

    toast.success('Kelas berhasil dibuat')
    setErrors({})
    setShowCreate(false)
    setForm({ name: '', academic_year: '', description: '' })
    navigate(`/teacher/classes/${data.id}`)
  }

  async function handleArchive(cls: ClassRow) {
    const archive = !cls.is_archived
    if (archive && !window.confirm(`Arsipkan kelas "${cls.name}"? Kelas tidak muncul di pilihan tugas/ujian, tetapi data tetap tersimpan.`)) return
    const { error } = await supabase.from('classes').update({ is_archived: archive }).eq('id', cls.id)
    if (error) { toast.error(archive ? 'Gagal mengarsipkan kelas' : 'Gagal memulihkan kelas'); return }
    toast.success(archive ? 'Kelas diarsipkan' : 'Kelas dipulihkan')
    loadClasses()
  }

  /** Ekspor daftar siswa SEMUA kelas yang tampil (data nyata, bukan contoh). */
  async function exportAllStudents() {
    if (classes.length === 0) { toast.error('Belum ada kelas'); return }
    setExporting(true)
    const { data: members } = await supabase.from('class_members').select('class_id, student_id, membership_status').in('class_id', classes.map(c => c.id))
    const ids = [...new Set((members ?? []).map(m => m.student_id))]
    const names = new Map<string, { full_name: string; student_number: string | null }>()
    for (let i = 0; i < ids.length; i += 100) {
      const { data: profiles } = await supabase.from('profiles').select('id, full_name, student_number').in('id', ids.slice(i, i + 100))
      ;(profiles ?? []).forEach(p => names.set(p.id, p))
    }
    const className = new Map(classes.map(c => [c.id, c.name]))
    downloadCsv('daftar-siswa.csv', [
      ['Nama', 'NIS', 'Kelas', 'Status'],
      ...(members ?? []).map(m => [names.get(m.student_id)?.full_name ?? 'Tidak dikenal', names.get(m.student_id)?.student_number ?? '', className.get(m.class_id) ?? '', m.membership_status === 'active' ? 'Aktif' : 'Nonaktif']),
    ])
    setExporting(false)
  }

  const visible = classes.filter(c => showArchived || !c.is_archived)
  const archivedCount = classes.filter(c => c.is_archived).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Kelas Saya</h1>
          <p className="text-sm text-muted-foreground">Kelola kelas dan siswa Anda</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="size-4" /> Buat Kelas
        </Button>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-3">{[1, 2, 3].map(i => <Card key={i}><CardContent className="h-32 animate-pulse bg-muted/30" /></Card>)}</div>
      ) : visible.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Belum ada kelas</EmptyTitle>
            <EmptyDescription>Buat kelas pertama Anda untuk mulai mengelola siswa</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => setShowCreate(true)}><Plus className="size-4" /> Buat Kelas</Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {visible.map((cls) => (
            <Card key={cls.id} className="transition-shadow hover:shadow-md">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <Link to={`/teacher/classes/${cls.id}`} className="flex-1">
                    <CardTitle className="text-lg hover:text-primary">{cls.name}</CardTitle>
                    {cls.academic_year && <p className="text-sm text-muted-foreground">{cls.academic_year}</p>}
                  </Link>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm"><MoreVertical className="size-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleArchive(cls)}>
                        {cls.is_archived ? <><ArchiveRestore className="size-4" /> Pulihkan</> : <><Archive className="size-4" /> Arsipkan</>}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setDeleteTarget(cls)} variant="destructive">
                        <Trash2 className="size-4" /> Hapus permanen
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent>
                {cls.description && <p className="mb-3 line-clamp-2 text-sm text-muted-foreground">{cls.description}</p>}
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="size-4" />
                  <span>{memberCounts[cls.id] ?? 0} siswa</span>
                  {cls.is_archived && <span className="rounded bg-muted px-2 py-0.5 text-xs">Arsip</span>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={exportAllStudents} disabled={exporting || classes.length === 0}>
          <Download className="mr-1 size-4" /> {exporting ? 'Menyiapkan...' : 'Ekspor Daftar Siswa'}
        </Button>
        {archivedCount > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setShowArchived(v => !v)}>
            {showArchived ? 'Sembunyikan kelas arsip' : `Tampilkan ${archivedCount} kelas arsip`}
          </Button>
        )}
        <p className="text-xs text-muted-foreground">Impor siswa dari CSV ada di halaman tiap kelas (tab Siswa).</p>
      </div>

      <DeleteClassDialog cls={deleteTarget} onClose={() => setDeleteTarget(null)} onDeleted={() => { setDeleteTarget(null); loadClasses() }} />

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Buat Kelas Baru</DialogTitle>
            <DialogDescription>Tambahkan kelas baru untuk mengelola siswa</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <Field data-invalid={!!errors.name}>
              <FieldLabel htmlFor="name">Nama Kelas</FieldLabel>
              <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Kelas A" />
              {errors.name && <FieldError>{errors.name}</FieldError>}
            </Field>
            <Field>
              <FieldLabel htmlFor="year">Tahun Ajaran</FieldLabel>
              <Input id="year" value={form.academic_year} onChange={(e) => setForm({ ...form, academic_year: e.target.value })} placeholder="2026/2027" />
            </Field>
            <Field>
              <FieldLabel htmlFor="desc">Deskripsi</FieldLabel>
              <Textarea id="desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Deskripsi kelas (opsional)" />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Batal</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
