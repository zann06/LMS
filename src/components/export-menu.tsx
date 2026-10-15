import { useState } from 'react'
import { toast } from 'sonner'
import { Download, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

export interface ExportAction { label: string; run: () => Promise<void> }

/** Tombol "Unduh" dengan pilihan format. Aksi dibuat oleh halaman pemanggil. */
export function ExportMenu({ actions, label = 'Unduh', size = 'sm', variant = 'outline' }: {
  actions: ExportAction[]
  label?: string
  size?: 'sm' | 'default'
  variant?: 'outline' | 'ghost' | 'default'
}) {
  const [busy, setBusy] = useState(false)

  async function run(a: ExportAction) {
    if (busy) return
    setBusy(true)
    try {
      await a.run()
      toast.success('File siap, cek folder unduhan')
    } catch (e) {
      console.error(e)
      toast.error('Gagal membuat file')
    } finally {
      setBusy(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={size} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {actions.map(a => <DropdownMenuItem key={a.label} onClick={() => run(a)}>{a.label}</DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
