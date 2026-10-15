import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/auth-context'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { ArrowLeft, UserPlus, Search, Users, FileText, BookMarked, ClipboardList, Upload, Download, Trash2 } from 'lucide-react'
import { DeleteClassDialog } from '@/components/delete-class-dialog'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Field, FieldLabel, FieldError } from '@/components/ui/field'
import { createStudentAccount, randomPassword } from '@/lib/supabase-isolated'
import { downloadCsv, parseCsv } from '@/lib/csv'
import { loadGradeRows, type GradeRow } from '@/lib/grade-data'

interface ClassData { id: string; name: string; academic_year: string; description: string | null; is_archived: boolean }
interface StudentRow { id: string; student_id: string; full_name: string; student_number: string | null; membership_status: string }
interface LinkedMaterial { id: string; title: string; subject: string; topic: string; visibility_status: string }
interface LinkedModule { id: string; title: string; subject: string; topic: string; status: string }
interface LinkedAssignment { id: string; title: string; due_at: string | null; status: string }
interface LinkedExam { id: string; title: string; status: string; start_at: string | null }
interface ImportResult { name: string; email: string; password: string; status: string; ok: boolean }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const dateShort = (d: string | null) => d ? new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'
const examStatus: Record<string, string> = { draft: 'Draf', scheduled: 'Terjadwal', published: 'Diterbitkan', closed: 'Ditutup' }
const assignStatus: Record<string, string> = { draft: 'Draf', published: 'Aktif', closed: 'Ditutup' }

export function ClassDetailPage() {
  const { classId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [showDelete, setShowDelete] = useState(false)
  const [cls, setCls] = useState<ClassData | null>(null)
  const [students, setStudents] = useState<StudentRow[]>([])
  const [materials, setMaterials] = useState<LinkedMaterial[]>([])
  const [modules, setModules] = useState<LinkedModule[]>([])
  const [assignments, setAssignments] = useState<LinkedAssignment[]>([])
  const [exams, setExams] = useState<LinkedExam[]>([])
  const [grades, setGrades] = useState<GradeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const [showAddStudent, setShowAddStudent] = useState(false)
  const [studentEmail, setStudentEmail] = useState('')
  const [studentName, setStudentName] = useState('')
  const [studentNumber, setStudentNumber] = useState('')
  const [studentPassword, setStudentPassword] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [emailTaken, setEmailTaken] = useState(false)

  const [showImport, setShowImport] = useState(false)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [importResults, setImportResults] = useState<ImportResult[] | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (classId) { loadAll() }
  }, [classId])

  async function loadAll() {
    await Promise.all([loadClass(), loadStudents(), loadLinked()])
    setLoading(false)
  }

  async function loadClass() {
    const { data } = await supabase.from('classes').select('*').eq('id', classId!).maybeSingle()
    setCls(data as ClassData | null)
  }

  async function loadStudents() {
    if (!classId) return
    const { data: members } = await supabase.from('class_members').select('id, student_id, membership_status').eq('class_id', classId)
    if (!members || members.length === 0) { setStudents([]); return }
    const { data: profiles } = await supabase.from('profiles').select('id, full_name, student_number').in('id', members.map(m => m.student_id))
    setStudents(members.map(m => {
      const p = profiles?.find(pr => pr.id === m.student_id)
      return { id: m.id, student_id: m.student_id, full_name: p?.full_name ?? 'Tidak dikenal', student_number: p?.student_number ?? null, membership_status: m.membership_status }
    }))
  }

  /** Bahan ajar, modul, tugas, ujian, dan nilai yang terhubung ke kelas ini. */
  async function loadLinked() {
    if (!classId) return
    const [cm, cmod, asg, ec, gr] = await Promise.all([
      supabase.from('class_materials').select('material_id').eq('class_id', classId),
      supabase.from('class_modules').select('module_id').eq('class_id', classId),
      supabase.from('assignments').select('id, title, due_at, status').eq('class_id', classId).neq('status', 'archived').order('created_at', { ascending: false }),
      supabase.from('exam_classes').select('exam_id').eq('class_id', classId),
      loadGradeRows([classId]),
    ])
    const matIds = (cm.data ?? []).map(x => x.material_id)
    const modIds = (cmod.data ?? []).map(x => x.module_id)
    const examIds = (ec.data ?? []).map(x => x.exam_id)
    const [mats, mods, exs] = await Promise.all([
      matIds.length ? supabase.from('materials').select('id, title, subject, topic, visibility_status').in('id', matIds).neq('visibility_status', 'archived') : Promise.resolve({ data: [] }),
      modIds.length ? supabase.from('teaching_modules').select('id, title, subject, topic, status').in('id', modIds).neq('status', 'archived') : Promise.resolve({ data: [] }),
      examIds.length ? supabase.from('exams').select('id, title, status, start_at').in('id', examIds).neq('status', 'archived') : Promise.resolve({ data: [] }),
    ])
    setMaterials((mats.data ?? []) as LinkedMaterial[])
    setModules((mods.data ?? []) as LinkedModule[])
    setAssignments((asg.data ?? []) as LinkedAssignment[])
    setExams((exs.data ?? []) as LinkedExam[])
    setGrades(gr)
  }

  async function enrol(studentId: string) {
    const { error } = await supabase.from('class_members').insert({ class_id: classId!, student_id: studentId })
    return !error
  }

  async function handleAddStudent(e: FormEvent) {
    e.preventDefault()
    if (!user || !classId) return
    setAddError(null); setEmailTaken(false)
    if (!studentName.trim()) { setAddError('Nama wajib diisi'); return }
    if (!EMAIL_RE.test(studentEmail.trim())) { setAddError('Format email tidak valid'); return }
    if (studentPassword.length < 6) { setAddError('Kata sandi minimal 6 karakter'); return }

    setAdding(true)
    // akun dibuat lewat klien terpisah supaya sesi guru tidak tertimpa sesi siswa
    const res = await createStudentAccount({ email: studentEmail.trim(), password: studentPassword, fullName: studentName.trim(), studentNumber: studentNumber.trim() || null })
    if (!res.ok) {
      setAdding(false)
      if (res.error === 'Email sudah terdaftar') { setEmailTaken(true); setAddError('Email sudah terdaftar.') }
      else setAddError('Gagal membuat akun siswa: ' + res.error)
      return
    }
    const ok = await enrol(res.userId)
    setAdding(false)
    if (!ok) { toast.warning('Akun dibuat, tetapi gagal dimasukkan ke kelas. Coba tambahkan lagi dengan email yang sama.'); return }
    closeAdd()
    toast.success('Siswa berhasil ditambahkan')
    loadStudents()
  }

  async function addExisting() {
    if (!classId) return
    setAdding(true)
    const { error } = await supabase.rpc('add_student_to_class_by_email', { p_class_id: classId, p_email: studentEmail.trim() })
    setAdding(false)
    if (error) { setAddError(error.message); return }
    closeAdd()
    toast.success('Siswa yang sudah punya akun ditambahkan ke kelas')
    loadStudents()
  }

  function closeAdd() {
    setShowAddStudent(false); setAddError(null); setEmailTaken(false)
    setStudentEmail(''); setStudentName(''); setStudentNumber(''); setStudentPassword('')
  }

  async function toggleMembership(student: StudentRow) {
    const newStatus = student.membership_status === 'active' ? 'inactive' : 'active'
    const { error } = await supabase.from('class_members').update({ membership_status: newStatus }).eq('id', student.id)
    if (error) { toast.error('Gagal mengubah status siswa'); return }
    toast.success(newStatus === 'active' ? 'Siswa diaktifkan' : 'Siswa dinonaktifkan')
    loadStudents()
  }

  async function removeStudent(s: StudentRow) {
    if (!window.confirm(`Keluarkan ${s.full_name} dari kelas ini? Akun siswa tidak dihapus dan nilai yang sudah ada tetap tersimpan.`)) return
    const { data, error } = await supabase.from('class_members').delete().eq('id', s.id).select('id')
    if (error || !data || data.length === 0) { toast.error('Gagal mengeluarkan siswa'); return }
    toast.success('Siswa dikeluarkan dari kelas')
    loadStudents()
  }

  function exportStudents() {
    downloadCsv(`siswa-${(cls?.name ?? 'kelas').replace(/\s+/g, '-').toLowerCase()}.csv`, [
      ['Nama', 'NIS', 'Status'],
      ...students.map(s => [s.full_name, s.student_number ?? '', s.membership_status === 'active' ? 'Aktif' : 'Nonaktif']),
    ])
  }

  function downloadTemplate() {
    downloadCsv('template-siswa.csv', [['Nama', 'NIS', 'Email', 'Password (opsional)'], ['Siswa Satu', '1001', 'siswa1@email.com', ''], ['Siswa Dua', '1002', 'siswa2@email.com', '']])
  }

  async function handleImportFile(file: File | undefined) {
    if (!file || !classId) return
    const rows = parseCsv(await file.text())
    if (rows.length < 2) { toast.error('File kosong atau hanya berisi header'); return }
    const head = rows[0].map(h => h.toLowerCase())
    const col = (...names: string[]) => head.findIndex(h => names.some(n => h.startsWith(n)))
    const iName = col('nama', 'name'), iNis = col('nis', 'nisn'), iEmail = col('email'), iPass = col('password', 'kata sandi')
    if (iName < 0 || iEmail < 0) { toast.error('Header wajib memuat kolom "Nama" dan "Email". Unduh template untuk contoh.'); return }
    if (rows.length - 1 > 200) { toast.error('Maksimal 200 siswa per impor'); return }

    setImporting(true); setImportResults(null)
    const body = rows.slice(1)
    setProgress({ done: 0, total: body.length })
    const seen = new Set<string>()
    const results: ImportResult[] = []
    for (let i = 0; i < body.length; i++) {
      const r = body[i]
      const name = r[iName] ?? '', email = (r[iEmail] ?? '').toLowerCase(), nis = iNis >= 0 ? (r[iNis] || null) : null
      const password = (iPass >= 0 && r[iPass]) ? r[iPass] : randomPassword()
      let status = 'Berhasil'; let ok = true
      if (!name) { status = 'Nama kosong'; ok = false }
      else if (!EMAIL_RE.test(email)) { status = 'Email tidak valid'; ok = false }
      else if (seen.has(email)) { status = 'Email ganda di file'; ok = false }
      else if (password.length < 6) { status = 'Password minimal 6 karakter'; ok = false }
      else {
        seen.add(email)
        const res = await createStudentAccount({ email, password, fullName: name, studentNumber: nis })
        if (!res.ok) {
          // akun sudah ada: masukkan saja ke kelas ini
          if (res.error === 'Email sudah terdaftar') {
            const { error } = await supabase.rpc('add_student_to_class_by_email', { p_class_id: classId, p_email: email })
            status = error ? `Sudah terdaftar, gagal masuk kelas: ${error.message}` : 'Akun sudah ada, dimasukkan ke kelas'
            ok = !error
          } else { status = res.error; ok = false }
        } else if (!(await enrol(res.userId))) { status = 'Akun dibuat, gagal masuk kelas'; ok = false }
        await sleep(400)   // jaga batas laju (rate limit) pendaftaran Supabase
      }
      results.push({ name, email, password: ok && status === 'Berhasil' ? password : '', status, ok })
      setProgress({ done: i + 1, total: body.length })
    }
    setImporting(false); setImportResults(results)
    if (fileRef.current) fileRef.current.value = ''
    loadStudents()
  }

  const q = search.toLowerCase()
  const filteredStudents = students.filter(s => s.full_name.toLowerCase().includes(q) || (s.student_number ?? '').toLowerCase().includes(q))

  const stats = [
    { label: 'Siswa Aktif', value: students.filter(s => s.membership_status === 'active').length, icon: Users },
    { label: 'Bahan Ajar', value: materials.length, icon: FileText },
    { label: 'Modul', value: modules.length, icon: BookMarked },
    { label: 'Tugas', value: assignments.length, icon: ClipboardList },
  ]

  if (loading) return <div className="flex items-center justify-center py-12"><p className="text-muted-foreground">Memuat...</p></div>
  if (!cls) return <div className="py-12 text-center"><p className="text-muted-foreground">Kelas tidak ditemukan</p></div>

  const emptyTab = (title: string, desc: string) => <Empty><EmptyHeader><EmptyTitle>{title}</EmptyTitle><EmptyDescription>{desc}</EmptyDescription></EmptyHeader></Empty>

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2"><Link to="/teacher/classes"><ArrowLeft className="size-4" /> Kembali</Link></Button>
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{cls.name}</h1>
            {cls.academic_year && <p className="text-sm text-muted-foreground">{cls.academic_year}</p>}
            {cls.is_archived && <Badge variant="secondary" className="mt-1">Diarsipkan</Badge>}
          </div>
          <Button variant="outline" size="sm" className="text-destructive" onClick={() => setShowDelete(true)}><Trash2 className="size-4" /> Hapus kelas</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map(s => (
          <Card key={s.label}>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-primary"><s.icon className="size-5" /></div>
              <div><p className="text-2xl font-bold">{s.value}</p><p className="text-xs text-muted-foreground">{s.label}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">Ringkasan</TabsTrigger>
          <TabsTrigger value="students">Siswa</TabsTrigger>
          <TabsTrigger value="materials">Bahan Ajar</TabsTrigger>
          <TabsTrigger value="modules">Modul</TabsTrigger>
          <TabsTrigger value="assignments">Tugas</TabsTrigger>
          <TabsTrigger value="exams">Ujian</TabsTrigger>
          <TabsTrigger value="grades">Nilai</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card><CardHeader><CardTitle className="text-base">Deskripsi Kelas</CardTitle></CardHeader>
            <CardContent><p className="text-sm text-muted-foreground">{cls.description || 'Belum ada deskripsi'}</p></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="students">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="relative max-w-sm flex-1">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Cari siswa..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={exportStudents} disabled={students.length === 0}><Download className="size-4" /> Ekspor</Button>
                <Button variant="outline" size="sm" onClick={() => { setImportResults(null); setShowImport(true) }}><Upload className="size-4" /> Impor CSV</Button>
                <Button onClick={() => setShowAddStudent(true)}><UserPlus className="size-4" /> Tambah Siswa</Button>
              </div>
            </div>

            {filteredStudents.length === 0 ? emptyTab('Belum ada siswa', 'Tambahkan siswa satu per satu atau impor dari CSV') : (
              <Card><CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow><TableHead>Nama</TableHead><TableHead>NIS</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Aksi</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {filteredStudents.map(s => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.full_name}</TableCell>
                        <TableCell>{s.student_number || '-'}</TableCell>
                        <TableCell><Badge variant={s.membership_status === 'active' ? 'default' : 'secondary'}>{s.membership_status === 'active' ? 'Aktif' : 'Nonaktif'}</Badge></TableCell>
                        <TableCell className="space-x-1 text-right whitespace-nowrap">
                          <Button variant="ghost" size="sm" onClick={() => toggleMembership(s)}>{s.membership_status === 'active' ? 'Nonaktifkan' : 'Aktifkan'}</Button>
                          <Button variant="ghost" size="sm" className="text-destructive" onClick={() => removeStudent(s)}>Keluarkan</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent></Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="materials">
          {materials.length === 0 ? emptyTab('Belum ada bahan ajar', 'Bagikan materi ke kelas ini dari halaman Bahan Ajar (Tambah / Edit)') : (
            <Card><CardContent className="p-0"><Table>
              <TableHeader><TableRow><TableHead>Judul</TableHead><TableHead>Mapel</TableHead><TableHead>Topik</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>{materials.map(m => (
                <TableRow key={m.id}><TableCell className="font-medium"><Link to="/teacher/materials" className="hover:text-primary">{m.title}</Link></TableCell><TableCell>{m.subject || '-'}</TableCell><TableCell>{m.topic || '-'}</TableCell>
                  <TableCell><Badge variant={m.visibility_status === 'published' ? 'default' : 'secondary'}>{m.visibility_status === 'published' ? 'Terbit' : 'Draf'}</Badge></TableCell></TableRow>
              ))}</TableBody>
            </Table></CardContent></Card>
          )}
        </TabsContent>

        <TabsContent value="modules">
          {modules.length === 0 ? emptyTab('Belum ada modul', 'Bagikan modul ke kelas ini dari halaman Modul Ajar (Buat / Edit)') : (
            <Card><CardContent className="p-0"><Table>
              <TableHeader><TableRow><TableHead>Judul</TableHead><TableHead>Mapel</TableHead><TableHead>Topik</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>{modules.map(m => (
                <TableRow key={m.id}><TableCell className="font-medium"><Link to="/teacher/modules" className="hover:text-primary">{m.title}</Link></TableCell><TableCell>{m.subject || '-'}</TableCell><TableCell>{m.topic || '-'}</TableCell>
                  <TableCell><Badge variant={m.status === 'published' ? 'default' : 'secondary'}>{m.status === 'published' ? 'Terbit' : 'Draf'}</Badge></TableCell></TableRow>
              ))}</TableBody>
            </Table></CardContent></Card>
          )}
        </TabsContent>

        <TabsContent value="assignments">
          {assignments.length === 0 ? emptyTab('Belum ada tugas', 'Buat tugas untuk kelas ini dari halaman Tugas') : (
            <Card><CardContent className="p-0"><Table>
              <TableHeader><TableRow><TableHead>Judul</TableHead><TableHead>Tenggat</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>{assignments.map(a => (
                <TableRow key={a.id}><TableCell className="font-medium"><Link to="/teacher/assignments" className="hover:text-primary">{a.title}</Link></TableCell><TableCell>{dateShort(a.due_at)}</TableCell>
                  <TableCell><Badge variant={a.status === 'published' ? 'default' : 'secondary'}>{assignStatus[a.status] ?? a.status}</Badge></TableCell></TableRow>
              ))}</TableBody>
            </Table></CardContent></Card>
          )}
        </TabsContent>

        <TabsContent value="exams">
          {exams.length === 0 ? emptyTab('Belum ada ujian', 'Pilih kelas ini saat membuat ujian di halaman Ujian Online') : (
            <Card><CardContent className="p-0"><Table>
              <TableHeader><TableRow><TableHead>Judul</TableHead><TableHead>Mulai</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>{exams.map(x => (
                <TableRow key={x.id}><TableCell className="font-medium"><Link to={`/teacher/exams/${x.id}`} className="hover:text-primary">{x.title}</Link></TableCell><TableCell>{dateShort(x.start_at)}</TableCell>
                  <TableCell><Badge variant={x.status === 'published' ? 'default' : 'secondary'}>{examStatus[x.status] ?? x.status}</Badge></TableCell></TableRow>
              ))}</TableBody>
            </Table></CardContent></Card>
          )}
        </TabsContent>

        <TabsContent value="grades">
          {grades.length === 0 ? emptyTab('Belum ada nilai', 'Nilai muncul setelah ujian atau tugas dinilai') : (
            <div className="space-y-3">
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={() => downloadCsv(`nilai-${cls.name.replace(/\s+/g, '-').toLowerCase()}.csv`, [
                  ['Nama', 'Jenis', 'Judul', 'Nilai', 'Maksimum', 'Persen', 'Status'],
                  ...grades.map(g => [g.student_name, g.source, g.title, g.score, g.max_score, g.percent, g.published ? 'Terbit' : 'Belum terbit']),
                ])}><Download className="size-4" /> Ekspor CSV</Button>
              </div>
              <Card><CardContent className="p-0"><Table>
                <TableHeader><TableRow><TableHead>Siswa</TableHead><TableHead>Jenis</TableHead><TableHead>Judul</TableHead><TableHead>Nilai</TableHead><TableHead>%</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>{grades.map(g => (
                  <TableRow key={g.id}><TableCell className="font-medium">{g.student_name}</TableCell><TableCell>{g.source}</TableCell><TableCell>{g.title}</TableCell>
                    <TableCell>{g.score}/{g.max_score}</TableCell><TableCell>{g.percent}</TableCell>
                    <TableCell><Badge variant={g.published ? 'default' : 'secondary'}>{g.published ? 'Terbit' : 'Belum terbit'}</Badge></TableCell></TableRow>
                ))}</TableBody>
              </Table></CardContent></Card>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <DeleteClassDialog cls={showDelete ? { id: cls.id, name: cls.name } : null} onClose={() => setShowDelete(false)} onDeleted={() => navigate('/teacher/classes')} />

      <Dialog open={showAddStudent} onOpenChange={(o) => { if (!o) closeAdd(); else setShowAddStudent(true) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Tambah Siswa Baru</DialogTitle><DialogDescription>Buat akun siswa dan masukkan ke kelas ini</DialogDescription></DialogHeader>
          <form onSubmit={handleAddStudent} className="space-y-4">
            <Field><FieldLabel htmlFor="sname">Nama Lengkap</FieldLabel><Input id="sname" value={studentName} onChange={e => setStudentName(e.target.value)} placeholder="Nama siswa" /></Field>
            <Field><FieldLabel htmlFor="semail">Email</FieldLabel><Input id="semail" type="email" value={studentEmail} onChange={e => setStudentEmail(e.target.value)} placeholder="siswa@email.com" required /></Field>
            <Field><FieldLabel htmlFor="snum">NIS (opsional)</FieldLabel><Input id="snum" value={studentNumber} onChange={e => setStudentNumber(e.target.value)} placeholder="Nomor Induk Siswa" /></Field>
            <Field data-invalid={!!addError}>
              <FieldLabel htmlFor="spass">Kata Sandi Sementara</FieldLabel>
              <div className="flex gap-2">
                <Input id="spass" type="text" value={studentPassword} onChange={e => setStudentPassword(e.target.value)} placeholder="Min. 6 karakter" required />
                <Button type="button" variant="outline" onClick={() => setStudentPassword(randomPassword())}>Acak</Button>
              </div>
              {addError && <FieldError>{addError}</FieldError>}
              {emailTaken && <Button type="button" variant="outline" size="sm" className="mt-2" onClick={addExisting} disabled={adding}>Tambahkan akun yang sudah ada ke kelas ini</Button>}
            </Field>
            <DialogFooter><Button type="button" variant="outline" onClick={closeAdd}>Batal</Button><Button type="submit" disabled={adding}>{adding ? 'Menambahkan...' : 'Tambah'}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showImport} onOpenChange={(o) => { if (!importing) setShowImport(o) }}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>Impor Siswa dari CSV</DialogTitle>
            <DialogDescription>Kolom: Nama, NIS, Email, Password (opsional, kosong = dibuat otomatis). Maksimal 200 baris.</DialogDescription>
          </DialogHeader>
          {!importResults ? (
            <div className="space-y-3">
              <Button type="button" variant="outline" size="sm" onClick={downloadTemplate}><Download className="size-4" /> Unduh template</Button>
              <Input ref={fileRef} type="file" accept=".csv,text/csv" disabled={importing} onChange={e => handleImportFile(e.target.files?.[0])} />
              {importing && <p className="text-sm text-muted-foreground">Memproses {progress.done} / {progress.total}... jangan tutup halaman ini.</p>}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm">{importResults.filter(r => r.ok).length} berhasil, {importResults.filter(r => !r.ok).length} gagal.</p>
              <p className="text-xs text-destructive">Simpan file kredensial sekarang. Kata sandi sementara tidak bisa ditampilkan lagi.</p>
              <Button size="sm" onClick={() => downloadCsv('kredensial-siswa.csv', [['Nama', 'Email', 'Password', 'Status'], ...importResults.map(r => [r.name, r.email, r.password, r.status])])}><Download className="size-4" /> Unduh kredensial (CSV)</Button>
              <Table>
                <TableHeader><TableRow><TableHead>Nama</TableHead><TableHead>Email</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>{importResults.map((r, i) => (
                  <TableRow key={i}><TableCell>{r.name || '-'}</TableCell><TableCell>{r.email || '-'}</TableCell><TableCell className={r.ok ? '' : 'text-destructive'}>{r.status}</TableCell></TableRow>
                ))}</TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
