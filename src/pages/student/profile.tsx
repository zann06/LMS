import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/auth-context'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldLabel } from '@/components/ui/field'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { BookOpen, FileText, FileCheck, User } from 'lucide-react'

export function StudentProfilePage() {
  const { user, profile } = useAuth()
  const [fullName, setFullName] = useState('')
  const [studentNumber, setStudentNumber] = useState('')
  const [saving, setSaving] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPw, setChangingPw] = useState(false)
  const [stats, setStats] = useState({ classes: 0, materials: 0, exams: 0 })

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name ?? '')
      setStudentNumber(profile.student_number ?? '')
    }
    if (user) loadStats()
  }, [profile, user])

  async function loadStats() {
    if (!user) return

    const { data: memberships } = await supabase
      .from('class_members')
      .select('class_id')
      .eq('student_id', user.id)
      .eq('membership_status', 'active')

    const classIds = memberships?.map(m => m.class_id) ?? []
    setStats(prev => ({ ...prev, classes: classIds.length }))

    if (classIds.length > 0) {
      const [{ data: cm }, { data: ec }] = await Promise.all([
        supabase.from('class_materials').select('material_id').in('class_id', classIds),
        supabase.from('exam_classes').select('exam_id').in('class_id', classIds),
      ])
      const matIds = [...new Set(cm?.map(m => m.material_id) ?? [])]
      const examIds = [...new Set(ec?.map(e => e.exam_id) ?? [])]
      // hitung hanya yang terbit (tautan kelas juga mencakup draf)
      const [mat, exm] = await Promise.all([
        matIds.length ? supabase.from('materials').select('id', { count: 'exact', head: true }).in('id', matIds).eq('visibility_status', 'published') : Promise.resolve({ count: 0 }),
        examIds.length ? supabase.from('exams').select('id', { count: 'exact', head: true }).in('id', examIds).eq('status', 'published') : Promise.resolve({ count: 0 }),
      ])
      setStats(prev => ({ ...prev, materials: mat.count ?? 0, exams: exm.count ?? 0 }))
    }
  }

  async function handleSave() {
    if (!user) return
    setSaving(true)
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: fullName.trim(),
        student_number: studentNumber.trim() || null,
      })
      .eq('id', user.id)

    if (error) {
      toast.error('Gagal menyimpan profil')
    } else {
      toast.success('Profil berhasil diperbarui')
    }
    setSaving(false)
  }

  /** Siswa yang akunnya dibuatkan guru memakai kata sandi sementara; mereka harus bisa menggantinya sendiri. */
  async function handleChangePassword() {
    if (newPassword.length < 6) { toast.error('Kata sandi minimal 6 karakter'); return }
    if (newPassword !== confirmPassword) { toast.error('Konfirmasi kata sandi tidak sama'); return }
    setChangingPw(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setChangingPw(false)
    if (error) { toast.error('Gagal mengganti kata sandi: ' + error.message); return }
    setNewPassword(''); setConfirmPassword('')
    toast.success('Kata sandi berhasil diganti')
  }

  const initials = fullName?.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() ?? 'S'

  const statCards = [
    { label: 'Kelas Aktif', value: stats.classes, icon: BookOpen },
    { label: 'Bahan Ajar', value: stats.materials, icon: FileText },
    { label: 'Ujian', value: stats.exams, icon: FileCheck },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Profil</h1>
        <p className="text-sm text-muted-foreground">Kelola informasi akun Anda</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <Avatar size="lg">
              <AvatarFallback className="bg-primary text-primary-foreground">{initials}</AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className="text-base">{profile?.full_name || 'Siswa'}</CardTitle>
              <CardDescription>{user?.email}</CardDescription>
              <Badge variant="secondary" className="mt-1">Siswa</Badge>
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-3 gap-3">
        {statCards.map(s => (
          <Card key={s.label}>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
                <s.icon className="size-5" />
              </div>
              <div>
                <p className="text-2xl font-bold">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Edit Profil</CardTitle>
          <CardDescription>Perbarui nama dan NIS Anda</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field>
            <FieldLabel htmlFor="fullname">Nama Lengkap</FieldLabel>
            <Input id="fullname" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Nama lengkap" />
          </Field>
          <Field>
            <FieldLabel htmlFor="sn">NIS (Nomor Induk Siswa)</FieldLabel>
            <Input id="sn" value={studentNumber} onChange={e => setStudentNumber(e.target.value)} placeholder="NIS" />
          </Field>
          <Button onClick={handleSave} disabled={saving}>
            <User className="size-4" />
            {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ganti Kata Sandi</CardTitle>
          <CardDescription>Disarankan mengganti kata sandi sementara dari guru</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field>
            <FieldLabel htmlFor="newpw">Kata sandi baru</FieldLabel>
            <Input id="newpw" type="password" autoComplete="new-password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Min. 6 karakter" />
          </Field>
          <Field>
            <FieldLabel htmlFor="confpw">Ulangi kata sandi baru</FieldLabel>
            <Input id="confpw" type="password" autoComplete="new-password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
          </Field>
          <Button onClick={handleChangePassword} disabled={changingPw || !newPassword}>
            {changingPw ? 'Menyimpan...' : 'Ganti Kata Sandi'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
