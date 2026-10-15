import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/auth-context'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { ExportMenu } from '@/components/export-menu'
import { RichText, plainPreview, safeUrl } from '@/components/rich-text'
import { FileText, Search, ExternalLink, FileEdit, Link2 } from 'lucide-react'
import type { Json } from '@/lib/database.types'
import { parseReferences } from '@/lib/content-types'

interface MaterialItem {
  id: string
  title: string
  description: string | null
  subject: string
  topic: string
  material_type: 'file' | 'text' | 'link'
  external_url: string | null
  text_content: string | null
  file_path: string | null
  references_json: Json | null
}

export function StudentMaterialsPage() {
  const { user } = useAuth()
  const [materials, setMaterials] = useState<MaterialItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [reading, setReading] = useState<MaterialItem | null>(null)

  useEffect(() => { if (user) loadMaterials() }, [user])

  async function loadMaterials() {
    if (!user) return
    const { data: memberships } = await supabase.from('class_members').select('class_id').eq('student_id', user.id).eq('membership_status', 'active')
    const classIds = memberships?.map(m => m.class_id) ?? []
    if (classIds.length === 0) { setLoading(false); return }

    const { data: classMaterials } = await supabase.from('class_materials').select('material_id').in('class_id', classIds)
    const materialIds = [...new Set(classMaterials?.map(cm => cm.material_id) ?? [])]
    if (materialIds.length === 0) { setLoading(false); return }

    const { data } = await supabase
      .from('materials')
      .select('id, title, description, subject, topic, material_type, external_url, text_content, file_path, references_json')
      .in('id', materialIds)
      .eq('visibility_status', 'published')
      .order('created_at', { ascending: false })

    setMaterials((data ?? []) as MaterialItem[])
    setLoading(false)
  }

  // tautan unduhan dibuat saat diklik (bukan untuk semua file sekaligus, dan tidak kedaluwarsa)
  async function openFile(m: MaterialItem) {
    if (!m.file_path) return
    const { data, error } = await supabase.storage.from('materials').createSignedUrl(m.file_path, 600)
    if (error || !data) { toast.error('Gagal membuka file'); return }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  async function runExport(m: MaterialItem, format: 'pdf' | 'pptx') {
    const { exportMaterial } = await import('@/lib/export-documents')
    await exportMaterial({
      title: m.title, subject: m.subject, topic: m.topic, description: m.description, text_content: m.text_content ?? '',
      material_type: m.material_type, external_url: safeUrl(m.external_url), references: parseReferences(m.references_json),
    }, format)
  }

  const q = search.toLowerCase()
  const filtered = materials.filter(m => m.title.toLowerCase().includes(q) || m.subject.toLowerCase().includes(q) || m.topic.toLowerCase().includes(q))

  const refsOf = (m: MaterialItem) => parseReferences(m.references_json).filter(r => safeUrl(r.url))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Bahan Ajar</h1>
        <p className="text-sm text-muted-foreground">Materi pembelajaran dari kelas Anda</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Cari judul, mapel, atau topik..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      {loading ? (
        <p className="text-muted-foreground">Memuat...</p>
      ) : filtered.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Belum ada materi</EmptyTitle>
            <EmptyDescription>Materi akan muncul saat guru menerbitkannya</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map(m => {
            const refs = refsOf(m)
            const link = safeUrl(m.external_url)
            return (
              <Card key={m.id} className="transition-shadow hover:shadow-md">
                <CardContent className="flex h-full flex-col p-4">
                  <div className="flex items-center gap-2">
                    {m.material_type === 'link' ? <Link2 className="size-5 text-primary" /> : m.material_type === 'text' ? <FileEdit className="size-5 text-primary" /> : <FileText className="size-5 text-primary" />}
                    <h3 className="font-medium leading-tight">{m.title}</h3>
                  </div>
                  {m.description && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{m.description}</p>}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {m.subject && <Badge variant="secondary">{m.subject}</Badge>}
                    {m.topic && <Badge variant="outline">{m.topic}</Badge>}
                  </div>

                  {m.material_type === 'text' && m.text_content && (
                    <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{plainPreview(m.text_content)}</p>
                  )}
                  {m.material_type === 'link' && link && (
                    <a href={link} target="_blank" rel="noopener noreferrer" className="mt-2 flex items-center gap-1 break-all text-xs text-primary hover:underline">
                      <ExternalLink className="size-3 shrink-0" /> {link}
                    </a>
                  )}
                  {refs.length > 0 && (
                    <div className="mt-3 space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">Sumber ({refs.length})</p>
                      {refs.slice(0, 3).map((r, i) => (
                        <a key={i} href={r.url} target="_blank" rel="noopener noreferrer" className="block truncate text-xs text-primary hover:underline">{r.title || r.url}</a>
                      ))}
                      {refs.length > 3 && <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => setReading(m)}>+{refs.length - 3} lainnya</button>}
                    </div>
                  )}

                  <div className="mt-auto flex flex-wrap gap-2 pt-4">
                    {m.material_type === 'file' && m.file_path && <Button variant="outline" size="sm" onClick={() => openFile(m)}><ExternalLink className="size-4" /> Buka file</Button>}
                    {m.material_type === 'text' && m.text_content && <Button variant="outline" size="sm" onClick={() => setReading(m)}>Baca materi</Button>}
                    {(m.material_type === 'text' && m.text_content) && (
                      <ExportMenu actions={[{ label: 'Unduh PDF', run: () => runExport(m, 'pdf') }, { label: 'Unduh PPT', run: () => runExport(m, 'pptx') }]} />
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog open={!!reading} onOpenChange={(o) => { if (!o) setReading(null) }}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          {reading && (
            <>
              <DialogHeader>
                <DialogTitle>{reading.title}</DialogTitle>
                <DialogDescription>{[reading.subject, reading.topic].filter(Boolean).join(' - ')}</DialogDescription>
              </DialogHeader>
              {reading.description && <p className="text-sm font-medium">{reading.description}</p>}
              <RichText text={reading.text_content ?? ''} />
              {refsOf(reading).length > 0 && (
                <div className="space-y-1 border-t pt-3">
                  <p className="text-sm font-semibold">Sumber & Referensi</p>
                  {refsOf(reading).map((r, i) => (
                    <p key={i} className="text-sm">
                      {r.title && <span className="font-medium">{r.title}: </span>}
                      <a href={r.url} target="_blank" rel="noopener noreferrer" className="break-all text-primary underline">{r.url}</a>
                    </p>
                  ))}
                </div>
              )}
              <div className="flex justify-end">
                <ExportMenu label="Unduh materi" actions={[{ label: 'Unduh PDF', run: () => runExport(reading, 'pdf') }, { label: 'Unduh PPT', run: () => runExport(reading, 'pptx') }]} />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
