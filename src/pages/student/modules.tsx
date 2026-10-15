import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/auth-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { ExportMenu } from '@/components/export-menu'
import { BookMarked, Search, Target } from 'lucide-react'
import type { Json } from '@/lib/database.types'
import { parseModuleContent } from '@/lib/content-types'
import { RichText, safeUrl } from '@/components/rich-text'

interface ModuleItem {
  id: string
  title: string
  description: string | null
  subject: string
  topic: string
  learning_objectives: string | null
  content: Json | null
}

export function StudentModulesPage() {
  const { user } = useAuth()
  const [modules, setModules] = useState<ModuleItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [reading, setReading] = useState<ModuleItem | null>(null)

  useEffect(() => {
    if (user) loadModules()
  }, [user])

  async function loadModules() {
    if (!user) return

    const { data: memberships } = await supabase
      .from('class_members')
      .select('class_id')
      .eq('student_id', user.id)
      .eq('membership_status', 'active')

    const classIds = memberships?.map(m => m.class_id) ?? []
    if (classIds.length === 0) { setLoading(false); return }

    const { data: classModules } = await supabase
      .from('class_modules')
      .select('module_id')
      .in('class_id', classIds)

    const moduleIds = [...new Set(classModules?.map(cm => cm.module_id) ?? [])]
    if (moduleIds.length === 0) { setLoading(false); return }

    const { data } = await supabase
      .from('teaching_modules')
      .select('id, title, description, subject, topic, learning_objectives, content')
      .in('id', moduleIds)
      .eq('status', 'published')
      .order('created_at', { ascending: false })

    setModules(data as ModuleItem[] ?? [])
    setLoading(false)
  }

  const filtered = modules.filter(m =>
    m.title.toLowerCase().includes(search.toLowerCase()) ||
    m.subject.toLowerCase().includes(search.toLowerCase()) ||
    m.topic.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Modul Ajar</h1>
        <p className="text-sm text-muted-foreground">Modul pembelajaran dari kelas Anda</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Cari modul..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      {loading ? (
        <p className="text-muted-foreground">Memuat...</p>
      ) : filtered.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Belum ada modul</EmptyTitle>
            <EmptyDescription>Modul akan muncul saat guru menerbitkannya</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map(m => (
            <Card key={m.id} className="transition-shadow hover:shadow-md">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <BookMarked className="size-5 text-primary" />
                  <CardTitle className="text-base leading-tight">{m.title}</CardTitle>
                </div>
                <div className="flex flex-wrap gap-2">
                  {m.subject && <Badge variant="secondary">{m.subject}</Badge>}
                  {m.topic && <Badge variant="outline">{m.topic}</Badge>}
                </div>
              </CardHeader>
              <CardContent>
                {m.description && <p className="text-sm text-muted-foreground line-clamp-2">{m.description}</p>}
                <Button variant="link" size="sm" className="mt-2 h-auto p-0 text-xs" onClick={() => setReading(m)}>Baca modul lengkap</Button>
                {m.learning_objectives && (
                  <div className="mt-3 rounded-md bg-muted/30 p-3">
                    <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                      <Target className="size-3" /> Tujuan Pembelajaran
                    </p>
                    <p className="mt-1 line-clamp-4 text-sm whitespace-pre-wrap">{m.learning_objectives}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!reading} onOpenChange={(o) => { if (!o) setReading(null) }}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          {reading && (() => {
            const c = parseModuleContent(reading.content)
            const blocks: [string, string][] = [
              ['Tujuan Pembelajaran', reading.learning_objectives ?? ''], ['Pemahaman Prasyarat', c.prerequisites],
              ['Kegiatan Pembuka', c.opening], ['Kegiatan Inti', c.main_activities], ['Penutup', c.closing],
              ['Asesmen', c.assessment], ['Media & Sumber Belajar', c.media],
            ]
            return (
              <>
                <DialogHeader>
                  <DialogTitle>{reading.title}</DialogTitle>
                  <DialogDescription>{[reading.subject, reading.topic, c.grade_level, c.duration].filter(Boolean).join(' · ')}</DialogDescription>
                </DialogHeader>
                {reading.description && <p className="text-sm">{reading.description}</p>}
                {blocks.filter(([, v]) => v.trim()).map(([h, v]) => (
                  <div key={h}><p className="text-sm font-semibold">{h}</p><RichText text={v} className="text-muted-foreground" /></div>
                ))}
                {c.references.filter(r => safeUrl(r.url)).length > 0 && (
                  <div className="space-y-1 border-t pt-3">
                    <p className="text-sm font-semibold">Sumber & Referensi</p>
                    {c.references.filter(r => safeUrl(r.url)).map((r, i) => (
                      <p key={i} className="text-sm">
                        {r.title && <span className="font-medium">{r.title}: </span>}
                        <a href={r.url} target="_blank" rel="noopener noreferrer" className="break-all text-primary underline">{r.url}</a>
                      </p>
                    ))}
                  </div>
                )}
                <div className="flex justify-end">
                  <ExportMenu label="Unduh modul" actions={(['pdf', 'pptx'] as const).map(f => ({
                    label: f === 'pdf' ? 'Unduh PDF' : 'Unduh PPT',
                    run: async () => {
                      const { exportModule } = await import('@/lib/export-documents')
                      await exportModule({ title: reading.title, subject: reading.subject, topic: reading.topic, description: reading.description, learning_objectives: reading.learning_objectives, content: c }, f)
                    },
                  }))} />
                </div>
              </>
            )
          })()}
        </DialogContent>
      </Dialog>
    </div>
  )
}
