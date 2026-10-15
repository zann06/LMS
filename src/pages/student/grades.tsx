import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/auth-context'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { GraduationCap, Award, TrendingUp } from 'lucide-react'
import { loadGradeRows, type GradeRow } from '@/lib/grade-data'

const KKM = 70

export function StudentGradesPage() {
  const { user } = useAuth()
  const [grades, setGrades] = useState<(GradeRow & { class_name: string })[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (user) loadGrades() }, [user])

  async function loadGrades() {
    if (!user) return
    const { data: memberships } = await supabase.from('class_members').select('class_id').eq('student_id', user.id)
    const classIds = [...new Set((memberships ?? []).map(m => m.class_id))]
    if (classIds.length === 0) { setLoading(false); return }

    // hanya nilai yang sudah diterbitkan yang bisa dibaca siswa (dijaga RLS di database)
    const rows = (await loadGradeRows(classIds)).filter(r => r.published)
    const { data: classesData } = await supabase.from('classes').select('id, name').in('id', classIds)
    const names = new Map((classesData ?? []).map(c => [c.id, c.name]))
    setGrades(rows.map(r => ({ ...r, class_name: names.get(r.class_id) ?? '' })))
    setLoading(false)
  }

  const percents = grades.map(g => g.percent)
  const avg = percents.length ? Math.round(percents.reduce((a, b) => a + b, 0) / percents.length) : 0
  const highest = percents.length ? Math.round(Math.max(...percents)) : 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Nilai Saya</h1>
        <p className="text-sm text-muted-foreground">Riwayat nilai ujian dan tugas</p>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Memuat...</p>
      ) : grades.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Belum ada nilai</EmptyTitle>
            <EmptyDescription>Nilai akan muncul setelah ujian atau tugas dinilai dan diterbitkan</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Card><CardContent className="flex items-center gap-3 p-4"><GraduationCap className="size-5 text-primary" /><div><p className="text-2xl font-bold">{grades.length}</p><p className="text-xs text-muted-foreground">Total Nilai</p></div></CardContent></Card>
            <Card><CardContent className="flex items-center gap-3 p-4"><TrendingUp className="size-5 text-primary" /><div><p className="text-2xl font-bold">{avg}%</p><p className="text-xs text-muted-foreground">Rata-rata</p></div></CardContent></Card>
            <Card><CardContent className="flex items-center gap-3 p-4"><Award className="size-5 text-primary" /><div><p className="text-2xl font-bold">{highest}%</p><p className="text-xs text-muted-foreground">Tertinggi</p></div></CardContent></Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Riwayat Nilai</CardTitle>
              <CardDescription>Semua nilai yang sudah diterbitkan guru</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Jenis</TableHead><TableHead>Judul</TableHead><TableHead>Kelas</TableHead><TableHead>Nilai</TableHead><TableHead>%</TableHead><TableHead>Tanggal</TableHead><TableHead>Catatan guru</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {grades.map(g => (
                    <TableRow key={g.id}>
                      <TableCell><Badge variant="outline">{g.source}</Badge></TableCell>
                      <TableCell className="font-medium">{g.title}</TableCell>
                      <TableCell>{g.class_name}</TableCell>
                      <TableCell><Badge variant={g.percent >= KKM ? 'default' : 'secondary'}>{g.score} / {g.max_score}</Badge></TableCell>
                      <TableCell>{Math.round(g.percent)}%</TableCell>
                      <TableCell>{new Date(g.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</TableCell>
                      <TableCell className="max-w-xs whitespace-pre-wrap text-sm text-muted-foreground">{g.feedback || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
