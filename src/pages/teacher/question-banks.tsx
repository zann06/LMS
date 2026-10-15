import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/auth-context'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Field, FieldLabel, FieldError } from '@/components/ui/field'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty'
import { Database, Plus, MoreVertical, Trash2 } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

interface BankRow { id: string; title: string; subject: string; topic: string; description: string | null }

export function QuestionBanksPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [banks, setBanks] = useState<BankRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ title: '', subject: '', topic: '', description: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => { if (user) loadBanks() }, [user])

  async function loadBanks() {
    if (!user) return
    const { data } = await supabase.from('question_banks').select('*').eq('teacher_id', user.id).order('created_at', { ascending: false })
    setBanks(data as BankRow[] ?? [])
    setLoading(false)
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!user || !form.title.trim()) { setErrors({ title: 'Judul wajib diisi' }); return }
    setSaving(true)
    const { data, error } = await supabase.from('question_banks').insert({
      teacher_id: user.id, title: form.title.trim(), subject: form.subject.trim(),
      topic: form.topic.trim(), description: form.description.trim() || null,
    }).select().single()
    if (error) { toast.error('Gagal membuat bank soal'); setSaving(false); return }
    setSaving(false); setShowCreate(false)
    setForm({ title: '', subject: '', topic: '', description: '' })
    toast.success('Bank soal dibuat')
    navigate(`/teacher/question-banks/${data.id}`)
  }

  async function handleDelete(b: BankRow) {
    if (!window.confirm(`Hapus bank soal "${b.title}" beserta semua soal di dalamnya?`)) return
    const { error } = await supabase.from('question_banks').delete().eq('id', b.id)
    if (error) {
      toast.error(error.code === '23503' ? 'Bank soal berisi soal yang sudah dipakai di ujian, tidak bisa dihapus' : 'Gagal menghapus bank soal')
      return
    }
    toast.success('Bank soal dihapus')
    loadBanks()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold tracking-tight">Bank Soal</h1><p className="text-sm text-muted-foreground">Kelola kumpulan soal</p></div>
        <Button onClick={() => setShowCreate(true)}><Plus className="size-4" /> Buat Bank Soal</Button>
      </div>
      {loading ? <p className="text-muted-foreground">Memuat...</p> : banks.length === 0 ? (
        <Empty><EmptyHeader><EmptyTitle>Belum ada bank soal</EmptyTitle><EmptyDescription>Buat bank soal pertama Anda</EmptyDescription></EmptyHeader>
          <EmptyContent><Button onClick={() => setShowCreate(true)}><Plus className="size-4" /> Buat Bank Soal</Button></EmptyContent>
        </Empty>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {banks.map(b => (
            <Card key={b.id} className="transition-shadow hover:shadow-md">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <Link to={`/teacher/question-banks/${b.id}`} className="flex flex-1 items-center gap-2">
                    <Database className="size-5 text-primary" />
                    <div><h3 className="font-medium leading-tight hover:text-primary">{b.title}</h3>
                      <p className="text-xs text-muted-foreground">{b.subject || 'Tanpa mapel'} {b.topic && ` - ${b.topic}`}</p>
                    </div>
                  </Link>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm"><MoreVertical className="size-4" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end"><DropdownMenuItem onClick={() => handleDelete(b)} variant="destructive"><Trash2 className="size-4" /> Hapus</DropdownMenuItem></DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {b.description && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{b.description}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Buat Bank Soal</DialogTitle><DialogDescription>Kelompokkan soal berdasarkan mata pelajaran atau topik</DialogDescription></DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <Field data-invalid={!!errors.title}><FieldLabel htmlFor="btitle">Judul</FieldLabel>
              <Input id="btitle" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Soal UTS IPA" />
              {errors.title && <FieldError>{errors.title}</FieldError>}
            </Field>
            <Field><FieldLabel htmlFor="bsubject">Mata Pelajaran</FieldLabel><Input id="bsubject" value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} placeholder="IPA" /></Field>
            <Field><FieldLabel htmlFor="btopic">Topik</FieldLabel><Input id="btopic" value={form.topic} onChange={e => setForm({ ...form, topic: e.target.value })} placeholder="Ekosistem" /></Field>
            <Field><FieldLabel htmlFor="bdesc">Deskripsi</FieldLabel><Textarea id="bdesc" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Deskripsi (opsional)" /></Field>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Batal</Button><Button type="submit" disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan'}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
