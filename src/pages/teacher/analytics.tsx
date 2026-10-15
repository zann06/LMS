import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/auth-context'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { TrendingUp, Users, Award } from 'lucide-react'
import { loadGradeRows, type GradeRow } from '@/lib/grade-data'
import { downloadCsv } from '@/lib/csv'

const chartConfig = { count: { label: 'Jumlah', color: 'var(--chart-1)' } } satisfies ChartConfig

interface ClassRow { id: string; name: string }
interface ItemStat { questionId: string; text: string; examTitle: string; answered: number; correct: number; p: number }

const RANGES = [
  { range: '0-20', min: 0, max: 20 }, { range: '21-40', min: 20, max: 40 }, { range: '41-60', min: 40, max: 60 },
  { range: '61-80', min: 60, max: 80 }, { range: '81-100', min: 80, max: Infinity },
]
const level = (p: number) => p >= 80 ? { label: 'Mudah', variant: 'secondary' as const } : p >= 40 ? { label: 'Sedang', variant: 'outline' as const } : { label: 'Sulit', variant: 'destructive' as const }

export function AnalyticsPage() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [rows, setRows] = useState<GradeRow[]>([])
  const [items, setItems] = useState<ItemStat[]>([])
  const [classFilter, setClassFilter] = useState('all')
  const [sourceFilter, setSourceFilter] = useState<'all' | 'Ujian' | 'Tugas'>('all')
  const [publishedFilter, setPublishedFilter] = useState<'all' | 'published'>('all')
  const [passing, setPassing] = useState('70')

  useEffect(() => { if (user) { loadData(); loadItemStats() } }, [user])

  async function loadData() {
    if (!user) return
    const { data: classData } = await supabase.from('classes').select('id, name').eq('teacher_id', user.id)
    setClasses(classData ?? [])
    setRows(await loadGradeRows((classData ?? []).map(c => c.id)))
    setLoading(false)
  }

  /** Analisis butir: persentase siswa yang menjawab benar tiap soal PG (memakai is_correct hasil penilaian server). */
  async function loadItemStats() {
    if (!user) return
    const { data: exams } = await supabase.from('exams').select('id, title').eq('teacher_id', user.id)
    if (!exams || exams.length === 0) { setItems([]); return }
    const { data: eqs } = await supabase.from('exam_questions').select('id, exam_id, question_id, question_snapshot').in('exam_id', exams.map(e => e.id))
    const mcq = (eqs ?? []).filter(q => (q.question_snapshot as { question_type?: string } | null)?.question_type === 'mcq')
    if (mcq.length === 0) { setItems([]); return }
    const answers: { exam_question_id: string; is_correct: boolean | null }[] = []
    const ids = mcq.map(q => q.id)
    for (let i = 0; i < ids.length; i += 100) {
      const { data } = await supabase.from('student_answers').select('exam_question_id, is_correct').in('exam_question_id', ids.slice(i, i + 100)).not('is_correct', 'is', null)
      answers.push(...(data ?? []))
    }
    const examTitle = new Map(exams.map(e => [e.id, e.title]))
    const byQ = new Map<string, ItemStat>()
    const eqToQ = new Map(mcq.map(q => [q.id, q]))
    for (const a of answers) {
      const eq = eqToQ.get(a.exam_question_id)
      if (!eq) continue
      const key = eq.question_id ?? eq.id
      let s = byQ.get(key)
      if (!s) { s = { questionId: key, text: (eq.question_snapshot as { question_text?: string }).question_text ?? '', examTitle: examTitle.get(eq.exam_id) ?? '', answered: 0, correct: 0, p: 0 }; byQ.set(key, s) }
      s.answered++
      if (a.is_correct) s.correct++
    }
    setItems([...byQ.values()].map(s => ({ ...s, p: Math.round((s.correct / s.answered) * 100) })).sort((a, b) => a.p - b.p))
  }

  const filtered = useMemo(() => rows.filter(r =>
    (classFilter === 'all' || r.class_id === classFilter) &&
    (sourceFilter === 'all' || r.source === sourceFilter) &&
    (publishedFilter === 'all' || r.published)), [rows, classFilter, sourceFilter, publishedFilter])

  const passScore = Number.isFinite(parseFloat(passing)) ? parseFloat(passing) : 70
  const stats = useMemo(() => {
    const s = filtered.map(r => r.percent)
    if (s.length === 0) return { avg: 0, highest: 0, lowest: 0, count: 0, tuntas: 0 }
    return {
      avg: Math.round(s.reduce((a, b) => a + b, 0) / s.length), highest: Math.round(Math.max(...s)), lowest: Math.round(Math.min(...s)),
      count: s.length, tuntas: s.filter(x => x >= passScore).length,
    }
  }, [filtered, passScore])

  const distribution = useMemo(() => RANGES.map(r => ({
    range: r.range,
    // batas bawah eksklusif (kecuali rentang pertama) supaya nilai desimal tidak lolos dari semua rentang
    count: filtered.filter(g => (r.min === 0 ? g.percent >= 0 : g.percent > r.min) && g.percent <= r.max).length,
  })), [filtered])

  const perStudent = useMemo(() => {
    const m = new Map<string, { name: string; n: number; sum: number }>()
    for (const r of filtered) {
      const e = m.get(r.student_id) ?? { name: r.student_name, n: 0, sum: 0 }
      e.n++; e.sum += r.percent; m.set(r.student_id, e)
    }
    return [...m.values()].map(e => ({ name: e.name, n: e.n, avg: Math.round(e.sum / e.n) })).sort((a, b) => b.avg - a.avg)
  }, [filtered])

  const className = new Map(classes.map(c => [c.id, c.name]))

  function exportRekap() {
    downloadCsv('rekap_nilai.csv', [
      ['Nama', 'Kelas', 'Jenis', 'Judul', 'Nilai', 'Maksimum', 'Persen', `Tuntas (>=${passScore})`, 'Status'],
      ...filtered.map(r => [r.student_name, className.get(r.class_id) ?? '', r.source, r.title, r.score, r.max_score, r.percent, r.percent >= passScore ? 'Ya' : 'Belum', r.published ? 'Diterbitkan' : 'Belum terbit']),
    ])
  }
  function exportPerStudent() {
    downloadCsv('rekap_per_siswa.csv', [['Nama', 'Jumlah Nilai', 'Rata-rata (%)'], ...perStudent.map(s => [s.name, s.n, s.avg])])
  }
  function exportItems() {
    downloadCsv('analisis_butir_soal.csv', [['Ujian', 'Soal', 'Dijawab', 'Benar', 'Benar (%)', 'Kategori'], ...items.map(i => [i.examTitle, i.text, i.answered, i.correct, i.p, level(i.p).label])])
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h1 className="text-2xl font-bold tracking-tight">Nilai & Analisis</h1><p className="text-sm text-muted-foreground">Rekap nilai ujian dan tugas, serta analisis butir soal</p></div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={exportRekap} disabled={filtered.length === 0}>Ekspor Rekap (CSV)</Button>
          <Button variant="outline" size="sm" onClick={exportPerStudent} disabled={perStudent.length === 0}>Ekspor Per Siswa</Button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <Select value={classFilter} onValueChange={setClassFilter}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Semua kelas" /></SelectTrigger>
          <SelectContent><SelectItem value="all">Semua kelas</SelectItem>{classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v as typeof sourceFilter)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">Ujian + Tugas</SelectItem><SelectItem value="Ujian">Ujian saja</SelectItem><SelectItem value="Tugas">Tugas saja</SelectItem></SelectContent>
        </Select>
        <Select value={publishedFilter} onValueChange={(v) => setPublishedFilter(v as typeof publishedFilter)}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">Semua nilai</SelectItem><SelectItem value="published">Hanya yang terbit</SelectItem></SelectContent>
        </Select>
        <div className="flex items-center gap-2"><label htmlFor="passing" className="text-sm text-muted-foreground">KKM</label><Input id="passing" type="number" min="0" max="100" value={passing} onChange={e => setPassing(e.target.value)} className="w-20" /></div>
      </div>

      {loading ? <p className="text-muted-foreground">Memuat...</p> : stats.count === 0 ? (
        <Empty><EmptyHeader><EmptyTitle>Belum ada nilai</EmptyTitle><EmptyDescription>Nilai muncul setelah ujian atau tugas dinilai (atau ubah filter di atas)</EmptyDescription></EmptyHeader></Empty>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Card><CardContent className="flex items-center gap-3 p-4"><TrendingUp className="size-5 text-primary" /><div><p className="text-2xl font-bold">{stats.avg}</p><p className="text-xs text-muted-foreground">Rata-rata (%)</p></div></CardContent></Card>
            <Card><CardContent className="flex items-center gap-3 p-4"><Award className="size-5 text-primary" /><div><p className="text-2xl font-bold">{stats.highest}</p><p className="text-xs text-muted-foreground">Tertinggi</p></div></CardContent></Card>
            <Card><CardContent className="flex items-center gap-3 p-4"><Award className="size-5 text-muted-foreground" /><div><p className="text-2xl font-bold">{stats.lowest}</p><p className="text-xs text-muted-foreground">Terendah</p></div></CardContent></Card>
            <Card><CardContent className="flex items-center gap-3 p-4"><Users className="size-5 text-primary" /><div><p className="text-2xl font-bold">{Math.round((stats.tuntas / stats.count) * 100)}%</p><p className="text-xs text-muted-foreground">Ketuntasan ({stats.tuntas}/{stats.count})</p></div></CardContent></Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Distribusi Nilai</CardTitle><CardDescription>Sebaran nilai (persen) per rentang</CardDescription></CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="min-h-[200px] w-full">
                <BarChart accessibilityLayer data={distribution}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="range" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" fill="var(--color-count)" radius={4} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Rata-rata per Siswa</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>Siswa</TableHead><TableHead>Jumlah nilai</TableHead><TableHead>Rata-rata (%)</TableHead><TableHead>Ketuntasan</TableHead></TableRow></TableHeader>
                <TableBody>{perStudent.map((s, i) => (
                  <TableRow key={i}><TableCell className="font-medium">{s.name}</TableCell><TableCell>{s.n}</TableCell><TableCell>{s.avg}</TableCell>
                    <TableCell><Badge variant={s.avg >= passScore ? 'default' : 'destructive'}>{s.avg >= passScore ? 'Tuntas' : 'Belum'}</Badge></TableCell></TableRow>
                ))}</TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-2">
          <div><CardTitle className="text-base">Analisis Butir Soal (Pilihan Ganda)</CardTitle><CardDescription>Soal diurutkan dari yang paling banyak salah. Di bawah 40% benar = sulit, di atas 80% = mudah.</CardDescription></div>
          <Button variant="outline" size="sm" onClick={exportItems} disabled={items.length === 0}>Ekspor</Button>
        </CardHeader>
        <CardContent className="p-0">
          {items.length === 0 ? <p className="p-4 text-sm text-muted-foreground">Belum ada jawaban pilihan ganda yang dinilai.</p> : (
            <Table>
              <TableHeader><TableRow><TableHead>Soal</TableHead><TableHead>Ujian</TableHead><TableHead>Dijawab</TableHead><TableHead>Benar</TableHead><TableHead>Kategori</TableHead></TableRow></TableHeader>
              <TableBody>{items.map(i => (
                <TableRow key={i.questionId}>
                  <TableCell className="max-w-md"><p className="line-clamp-2 text-sm">{i.text}</p></TableCell>
                  <TableCell className="text-sm">{i.examTitle}</TableCell>
                  <TableCell>{i.answered}</TableCell>
                  <TableCell>{i.correct} ({i.p}%)</TableCell>
                  <TableCell><Badge variant={level(i.p).variant}>{level(i.p).label}</Badge></TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
