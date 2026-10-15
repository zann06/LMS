import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/auth-context'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty'
import { Plus, MoreVertical, Trash2 } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

interface ExamRow {
  id: string; title: string; status: 'draft' | 'scheduled' | 'published' | 'closed' | 'archived'
  start_at: string | null; end_at: string | null; duration_minutes: number
}

export function ExamsPage() {
  const { user } = useAuth()
  const [exams, setExams] = useState<ExamRow[]>([])
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState<Record<string, number>>({})

  useEffect(() => { if (user) loadExams() }, [user])

  async function loadExams() {
    if (!user) return
    const { data } = await supabase.from('exams').select('*').eq('teacher_id', user.id).neq('status', 'archived').order('created_at', { ascending: false })
    const rows = (data ?? []) as ExamRow[]
    setExams(rows)
    // jumlah percobaan yang menunggu nilai esai per ujian
    const p: Record<string, number> = {}
    if (rows.length > 0) {
      const { data: att } = await supabase.from('exam_attempts').select('exam_id').eq('status', 'awaiting_grading').in('exam_id', rows.map(r => r.id))
      for (const a of att ?? []) p[a.exam_id] = (p[a.exam_id] ?? 0) + 1
    }
    setPending(p)
    setLoading(false)
  }

  async function handleDelete(e: ExamRow) {
    if (!window.confirm(`Arsipkan ujian "${e.title}"? Ujian tidak lagi tampil di daftar.`)) return
    const { error } = await supabase.from('exams').update({ status: 'archived' }).eq('id', e.id)
    if (error) { toast.error('Gagal mengarsipkan ujian'); return }
    toast.success('Ujian diarsipkan')
    loadExams()
  }

  async function setStatus(e: ExamRow, status: 'published' | 'closed') {
    const { error } = await supabase.from('exams').update({ status }).eq('id', e.id)
    if (error) { toast.error('Gagal mengubah status ujian'); return }
    toast.success(status === 'published' ? 'Ujian diterbitkan' : 'Ujian ditutup')
    loadExams()
  }

  const statusLabels: Record<string, string> = { draft: 'Draf', scheduled: 'Terjadwal', published: 'Diterbitkan', closed: 'Ditutup' }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold tracking-tight">Ujian Online</h1><p className="text-sm text-muted-foreground">Kelola ujian dan jadwal</p></div>
        <Button asChild><Link to="/teacher/exams/new"><Plus className="size-4" /> Buat Ujian</Link></Button>
      </div>
      {loading ? <p className="text-muted-foreground">Memuat...</p> : exams.length === 0 ? (
        <Empty><EmptyHeader><EmptyTitle>Belum ada ujian</EmptyTitle><EmptyDescription>Buat ujian dari bank soal Anda</EmptyDescription></EmptyHeader>
          <EmptyContent><Button asChild><Link to="/teacher/exams/new"><Plus className="size-4" /> Buat Ujian</Link></Button></EmptyContent>
        </Empty>
      ) : (
        <Card><CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Judul</TableHead><TableHead>Durasi</TableHead><TableHead>Mulai</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Aksi</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {exams.map(e => (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">
                    <Link to={`/teacher/exams/${e.id}`} className="hover:text-primary">{e.title}</Link>
                  </TableCell>
                  <TableCell>{e.duration_minutes} menit</TableCell>
                  <TableCell>{e.start_at ? new Date(e.start_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : '-'}</TableCell>
                  <TableCell><Badge variant={e.status === 'published' ? 'default' : 'secondary'}>{statusLabels[e.status] ?? e.status}</Badge>{(pending[e.id] ?? 0) > 0 && <Badge variant="destructive" className="ml-1">{pending[e.id]} perlu dinilai</Badge>}</TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm"><MoreVertical className="size-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild><Link to={`/teacher/exams/${e.id}`}>Lihat hasil</Link></DropdownMenuItem>
                        {e.status === 'draft' && <DropdownMenuItem onClick={() => setStatus(e, 'published')}>Terbitkan</DropdownMenuItem>}
                        {e.status === 'published' && <DropdownMenuItem onClick={() => setStatus(e, 'closed')}>Tutup ujian</DropdownMenuItem>}
                        <DropdownMenuItem onClick={() => handleDelete(e)} variant="destructive"><Trash2 className="size-4" /> Arsipkan</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent></Card>
      )}
    </div>
  )
}

