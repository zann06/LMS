import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/auth-context'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldLabel } from '@/components/ui/field'
import { User, Database } from 'lucide-react'

export function SettingsPage() {
  const { user, profile } = useAuth()
  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [saving, setSaving] = useState(false)
  const [stats, setStats] = useState({ classes: 0, students: 0, materials: 0, exams: 0 })

  useEffect(() => {
    setFullName(profile?.full_name ?? '')
    if (user) loadStats()
  }, [user, profile])

  async function loadStats() {
    if (!user) return
    const [c, m, e] = await Promise.all([
      supabase.from('classes').select('id', { count: 'exact', head: true }).eq('teacher_id', user.id),
      supabase.from('materials').select('id', { count: 'exact', head: true }).eq('teacher_id', user.id),
      supabase.from('exams').select('id', { count: 'exact', head: true }).eq('teacher_id', user.id),
    ])
    setStats({ classes: c.count ?? 0, students: 0, materials: m.count ?? 0, exams: e.count ?? 0 })
  }

  async function handleSave() {
    if (!user) return
    setSaving(true)
    const { error } = await supabase.from('profiles').update({ full_name: fullName.trim() }).eq('id', user.id)
    if (error) { toast.error('Gagal menyimpan'); setSaving(false); return }
    setSaving(false)
    toast.success('Profil diperbarui')
  }

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold tracking-tight">Pengaturan</h1><p className="text-sm text-muted-foreground">Kelola profil dan preferensi</p></div>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><User className="size-4" /> Profil</CardTitle><CardDescription>Perbarui informasi profil Anda</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <Field><FieldLabel htmlFor="fname">Nama Lengkap</FieldLabel><Input id="fname" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Nama guru" /></Field>
          <Field><FieldLabel>Email</FieldLabel><Input value={user?.email ?? ''} disabled /></Field>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan Perubahan'}</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Database className="size-4" /> Statistik Akun</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center"><p className="text-2xl font-bold">{stats.classes}</p><p className="text-xs text-muted-foreground">Kelas</p></div>
            <div className="text-center"><p className="text-2xl font-bold">{stats.materials}</p><p className="text-xs text-muted-foreground">Materi</p></div>
            <div className="text-center"><p className="text-2xl font-bold">{stats.exams}</p><p className="text-xs text-muted-foreground">Ujian</p></div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
