import type { Json } from '@/lib/database.types'

export interface OptionItem { id: string; text: string }

/** Sumber / referensi belajar (judul + tautan). */
export interface ReferenceItem { title: string; url: string }

export function parseReferences(raw: Json | null | undefined): ReferenceItem[] {
  if (!Array.isArray(raw)) return []
  const out: ReferenceItem[] = []
  for (const r of raw) {
    if (r && typeof r === 'object' && !Array.isArray(r)) {
      const o = r as Record<string, Json | undefined>
      if (typeof o.url === 'string' && o.url.trim()) out.push({ title: typeof o.title === 'string' ? o.title : '', url: o.url.trim() })
    }
  }
  return out
}

/** Pastikan URL memakai http(s); kembalikan null kalau tidak valid. */
export function normalizeUrl(raw: string): string | null {
  const s = raw.trim()
  if (!s) return null
  const withProto = /^https?:\/\//i.test(s) ? s : `https://${s}`
  try { const u = new URL(withProto); return u.hostname.includes('.') ? u.toString() : null } catch { return null }
}

/** Isi modul ajar, disimpan di kolom teaching_modules.content (jsonb). */
export interface ModuleContent {
  grade_level: string   // Fase / Kelas
  duration: string      // Alokasi waktu
  prerequisites: string // Pemahaman prasyarat
  opening: string       // Kegiatan pembuka
  main_activities: string // Kegiatan inti
  closing: string       // Penutup
  assessment: string    // Asesmen
  media: string         // Media & sumber belajar
  references: ReferenceItem[] // Sumber / referensi (judul + tautan)
}

export const emptyModuleContent: ModuleContent = {
  grade_level: '', duration: '', prerequisites: '',
  opening: '', main_activities: '', closing: '', assessment: '', media: '', references: [],
}

export function parseModuleContent(raw: Json | null | undefined): ModuleContent {
  const out = { ...emptyModuleContent }
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const k of Object.keys(out) as (keyof ModuleContent)[]) {
      if (k === 'references') continue
      const v = (raw as Record<string, Json | undefined>)[k]
      if (typeof v === 'string') (out as Record<string, unknown>)[k] = v
    }
    out.references = parseReferences((raw as Record<string, Json | undefined>).references)
  }
  return out
}

export function parseOptions(raw: Json | null | undefined): OptionItem[] {
  if (!Array.isArray(raw)) return []
  const out: OptionItem[] = []
  for (const o of raw) {
    if (o && typeof o === 'object' && !Array.isArray(o)) {
      const r = o as Record<string, Json | undefined>
      if (typeof r.id === 'string' && typeof r.text === 'string') out.push({ id: r.id, text: r.text })
    }
  }
  return out
}

export function getCorrectOptionId(raw: Json | null | undefined): string | null {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const v = (raw as Record<string, Json | undefined>).correct_option_id
    if (typeof v === 'string') return v
  }
  return null
}

export function getRubricText(raw: Json | null | undefined): string {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const v = (raw as Record<string, Json | undefined>).rubric
    if (typeof v === 'string') return v
  }
  return ''
}

export const difficultyLabel: Record<string, string> = { easy: 'Mudah', medium: 'Sedang', hard: 'Sulit' }
