import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from '@/components/ui/alert-dialog'

interface Counts { members: number; assignments: number; grades: number; exams: number; materials: number; modules: number }

/** Hapus kelas PERMANEN. Guru harus mengetik nama kelas; dampaknya ditampilkan dulu. */
export function DeleteClassDialog({ cls, onClose, onDeleted }: {
  cls: { id: string; name: string } | null
  onClose: () => void
  onDeleted: () => void
}) {
  const [counts, setCounts] = useState<Counts | null>(null)
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    setConfirmText(''); setCounts(null)
    if (!cls) return
    let cancelled = false
    ;(async () => {
      const head = { count: 'exact' as const, head: true }
      const [m, a, g, e, mat, mod] = await Promise.all([
        supabase.from('class_members').select('id', head).eq('class_id', cls.id),
        supabase.from('assignments').select('id', head).eq('class_id', cls.id),
        supabase.from('grades').select('id', head).eq('class_id', cls.id),
        supabase.from('exam_classes').select('exam_id', head).eq('class_id', cls.id),
        supabase.from('class_materials').select('material_id', head).eq('class_id', cls.id),
        supabase.from('class_modules').select('module_id', head).eq('class_id', cls.id),
      ])
      if (!cancelled) setCounts({ members: m.count ?? 0, assignments: a.count ?? 0, grades: g.count ?? 0, exams: e.count ?? 0, materials: mat.count ?? 0, modules: mod.count ?? 0 })
    })()
    return () => { cancelled = true }
  }, [cls])

  async function handleDelete() {
    if (!cls || confirmText.trim() !== cls.name.trim()) return
    setDeleting(true)
    // .select() supaya ketahuan kalau tidak ada baris yang terhapus (mis. ditolak RLS)
    const { data, error } = await supabase.from('classes').delete().eq('id', cls.id).select('id')
    setDeleting(false)
    if (error || !data || data.length === 0) {
      toast.error('Gagal menghapus kelas' + (error ? ': ' + error.message : ' (tidak ada data yang terhapus)'))
      return
    }
    toast.success(`Kelas "${cls.name}" dihapus permanen`)
    onDeleted()
  }

  const ready = !!cls && confirmText.trim() === cls.name.trim()

  return (
    <AlertDialog open={!!cls} onOpenChange={(o) => { if (!o && !deleting) onClose() }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Hapus kelas "{cls?.name}" secara permanen?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              <p>Tindakan ini <strong>tidak bisa dibatalkan</strong>. Yang ikut terhapus:</p>
              {counts ? (
                <ul className="list-disc space-y-0.5 pl-5">
                  <li>{counts.members} keanggotaan siswa (akun siswa tetap ada)</li>
                  <li>{counts.assignments} tugas beserta pengumpulan dan nilainya</li>
                  <li>{counts.grades} catatan nilai kelas ini (termasuk nilai ujian)</li>
                  <li>Tautan ke {counts.exams} ujian, {counts.materials} bahan ajar, dan {counts.modules} modul (isinya tidak terhapus)</li>
                </ul>
              ) : <p>Menghitung dampak...</p>}
              <p>Ingin menyembunyikan saja? Gunakan <em>Arsipkan</em>.</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-1">
          <label htmlFor="del-confirm" className="text-sm">Ketik <strong>{cls?.name}</strong> untuk melanjutkan</label>
          <Input id="del-confirm" value={confirmText} onChange={e => setConfirmText(e.target.value)} autoComplete="off" disabled={deleting} />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Batal</AlertDialogCancel>
          <AlertDialogAction disabled={!ready || deleting} onClick={(e) => { e.preventDefault(); handleDelete() }}>
            {deleting ? 'Menghapus...' : 'Hapus permanen'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
