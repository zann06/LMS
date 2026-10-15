/**
 * Ekspor Modul Ajar, Bahan Ajar (teks) dan Bank Soal ke PDF / PPTX.
 * Semua dibuat di browser (tanpa server). jspdf & pptxgenjs di-import dinamis
 * supaya tidak membebani bundle awal.
 */
import type { jsPDF } from 'jspdf'
import type PptxGenJS from 'pptxgenjs'
import type { ModuleContent, ReferenceItem } from '@/lib/content-types'

/* ───────────── tipe data ekspor ───────────── */

export interface ExportOption { id: string; text: string }

export interface ExportQuestion {
  question_type: 'mcq' | 'essay'
  question_text: string
  options: ExportOption[]
  points: number
  difficulty: string | null
  explanation: string | null
  correct_option_id: string | null
  rubric: string | null
}

export interface ExportMeta { teacherName?: string; date?: Date }

export interface ModuleExportData {
  title: string; subject: string; topic: string
  description: string | null; learning_objectives: string | null
  content: ModuleContent
}
export interface MaterialExportData {
  title: string; subject: string; topic: string
  description: string | null; text_content: string
  material_type?: 'text' | 'link' | 'file'
  external_url?: string | null
  references?: ReferenceItem[]
}
export interface BankExportData {
  title: string; subject: string; topic: string; description: string | null
  questions: ExportQuestion[]
}
export interface QuestionExportOptions { withKey: boolean }

/* ───────────── util ───────────── */

const C = {
  terracotta: [200, 107, 60] as [number, number, number],
  brown: [56, 44, 37] as [number, number, number],
  muted: [120, 105, 94] as [number, number, number],
  line: [233, 216, 195] as [number, number, number],
  green: [47, 125, 79] as [number, number, number],
  cream: [255, 249, 240] as [number, number, number],
}
const HEX = { terracotta: 'C86B3C', brown: '382C25', muted: '78695E', cream: 'FFF9F0', peach: 'F4D7C4', green: '2F7D4F', line: 'E9D8C3' }

const dateId = (d = new Date()) => d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })

export function slugify(s: string) {
  return (s || 'dokumen').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 60) || 'dokumen'
}

const cleanText = (s: string | null | undefined) =>
  (s ?? '').replace(/\r\n?/g, '\n').replace(/[\u200b-\u200d\u2060\ufeff]/g, '')

const letter = (i: number) => String.fromCharCode(65 + i)

/** Karakter di luar WinAnsi tidak bisa dirender font bawaan PDF (Helvetica). */
const WIN_ANSI_EXTRA = new Set('–—‘’‚“”„†‡•…‰‹›€™'.split(''))
export function needsUnicodeFont(text: string) {
  for (const ch of text) {
    const c = ch.codePointAt(0)!
    if (c > 255 && !WIN_ANSI_EXTRA.has(ch)) return true
  }
  return false
}
const LATIN_FALLBACK: Record<string, string> = {
  '≥': '>=', '≤': '<=', '≠': '!=', '≈': '~', '→': '->', '←': '<-', '✓': 'v', '√': 'akar', 'π': 'pi', '∞': 'tak hingga', '°': '°',
}
function toLatin(s: string) {
  let out = ''
  for (const ch of s) {
    const c = ch.codePointAt(0)!
    if (c <= 255 || WIN_ANSI_EXTRA.has(ch)) out += ch
    else out += LATIN_FALLBACK[ch] ?? '?'
  }
  return out
}

/** Pecah teks jadi butir; buang penanda "-", "•", "1." di awal baris. */
function toItems(text: string): string[] {
  return cleanText(text).split('\n').map(l => l.trim()).filter(Boolean)
    .map(l => l.replace(/^([-*•–]|\d+[.)])\s+/, ''))
}

/* ── teks kaya ringan: "# Judul", "## Subjudul", "- butir", "[label](url)", URL polos ── */

export interface RichBlock { kind: 'h1' | 'h2' | 'bullet' | 'para'; text: string }

export function parseRich(text: string): RichBlock[] {
  const out: RichBlock[] = []
  for (const raw of cleanText(text).split('\n')) {
    const l = raw.trim()
    if (!l) continue
    let m: RegExpMatchArray | null
    if ((m = l.match(/^#\s+(.+)$/))) out.push({ kind: 'h1', text: m[1].trim() })
    else if ((m = l.match(/^#{2,3}\s+(.+)$/))) out.push({ kind: 'h2', text: m[1].trim() })
    else if ((m = l.match(/^([-*•–]|\d+[.)])\s+(.+)$/))) out.push({ kind: 'bullet', text: m[2].trim() })
    else out.push({ kind: 'para', text: l })
  }
  return out
}

export interface InlinePart { text: string; url?: string }

/** Pecah teks menjadi bagian biasa dan bagian tautan ([label](url) atau URL polos). */
export function splitInline(text: string): InlinePart[] {
  const parts: InlinePart[] = []
  const re = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>)]+[^\s<>).,;:!?])/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index) })
    if (m[1]) parts.push({ text: m[1], url: m[2] })
    else parts.push({ text: m[3], url: m[3] })
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push({ text: text.slice(last) })
  return parts.length ? parts : [{ text }]
}

/** Untuk PDF: tautan [label](url) ditulis "label (url)" agar URL tetap terbaca saat dicetak. */
function flattenInline(text: string) {
  return splitInline(text).map(p => (p.url && p.url !== p.text ? `${p.text} (${p.url})` : p.text)).join('')
}

/** Bagi butir menjadi beberapa kelompok (slide) agar tidak meluap. */
export function paginate(items: string[], maxChars = 520, maxItems = 7): string[][] {
  const pieces: string[] = []
  for (const it of items) {
    if (it.length <= maxChars) { pieces.push(it); continue }
    const sentences = it.split(/(?<=[.!?])\s+/)
    let cur = ''
    for (const s of sentences) {
      if (s.length > maxChars) {            // kalimat super panjang: potong per kata
        if (cur) { pieces.push(cur); cur = '' }
        let w = ''
        for (const word of s.split(' ')) {
          if (word.length > maxChars) {       // satu kata (mis. URL) lebih panjang dari batas
            if (w) { pieces.push(w); w = '' }
            for (let k = 0; k < word.length; k += maxChars) pieces.push(word.slice(k, k + maxChars))
          } else if (w && (w + ' ' + word).length > maxChars) { pieces.push(w); w = word }
          else w = w ? w + ' ' + word : word
        }
        cur = w
      } else if ((cur + ' ' + s).trim().length > maxChars) { pieces.push(cur); cur = s }
      else cur = (cur + ' ' + s).trim()
    }
    if (cur) pieces.push(cur)
  }
  const pages: string[][] = []
  let page: string[] = []; let chars = 0
  for (const p of pieces) {
    if (page.length && (chars + p.length > maxChars || page.length >= maxItems)) { pages.push(page); page = []; chars = 0 }
    page.push(p); chars += p.length
  }
  if (page.length) pages.push(page)
  return pages
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/* ───────────── PDF ───────────── */

export type FontLoader = (file: string) => Promise<string | null>   // base64 TTF atau null

const defaultFontLoader: FontLoader = async (file) => {
  try {
    const res = await fetch(`/fonts/${file}`)
    if (!res.ok) return null
    const buf = new Uint8Array(await res.arrayBuffer())
    let bin = ''
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
    return btoa(bin)
  } catch { return null }
}

class PdfBuilder {
  y = 0
  readonly M = 20
  readonly W = 210
  readonly H = 297
  unicode = false
  private family = 'helvetica'
  private hasBold = true

  constructor(readonly doc: jsPDF, private footerTitle: string) {}

  async setupFont(allText: string, loader: FontLoader) {
    if (!needsUnicodeFont(allText)) return
    const regular = await loader('DejaVuSans.ttf')
    if (!regular) return                          // fallback: Helvetica + toLatin
    this.doc.addFileToVFS('DejaVuSans.ttf', regular)
    this.doc.addFont('DejaVuSans.ttf', 'DejaVu', 'normal')
    const bold = await loader('DejaVuSans-Bold.ttf')
    if (bold) { this.doc.addFileToVFS('DejaVuSans-Bold.ttf', bold); this.doc.addFont('DejaVuSans-Bold.ttf', 'DejaVu', 'bold') }
    else this.hasBold = false
    this.family = 'DejaVu'; this.unicode = true
  }

  get maxW() { return this.W - this.M * 2 }
  private t(s: string) { return this.unicode ? s : toLatin(s) }

  private font(style: 'normal' | 'bold', size: number, color: [number, number, number]) {
    this.doc.setFont(this.family, style === 'bold' && !this.hasBold ? 'normal' : style)
    this.doc.setFontSize(size)
    this.doc.setTextColor(...color)
  }
  private lh(size: number) { return size * 0.3528 * 1.45 }

  need(h: number) {
    if (this.y + h > this.H - 18) { this.doc.addPage(); this.y = this.M }
  }

  cover(title: string, subtitle: string, meta: [string, string][]) {
    const { doc } = this
    doc.setFillColor(...C.terracotta); doc.rect(0, 0, this.W, 44, 'F')
    this.font('normal', 9, [255, 240, 225]); doc.text('RUANGAJAR', this.M, 14)
    this.font('bold', 20, [255, 255, 255])
    const lines = doc.splitTextToSize(this.t(title), this.maxW).slice(0, 3)
    doc.text(lines, this.M, 24)
    this.font('normal', 10.5, [255, 240, 225]); doc.text(this.t(subtitle), this.M, 24 + lines.length * 8 + 2)
    this.y = 54
    for (const [k, v] of meta.filter(([, v]) => v)) {
      this.font('bold', 10, C.brown); doc.text(this.t(k), this.M, this.y)
      this.font('normal', 10, C.brown)
      const vl = doc.splitTextToSize(this.t(v), this.maxW - 38)
      doc.text(vl, this.M + 38, this.y); this.y += Math.max(1, vl.length) * this.lh(10)
    }
    this.y += 3
    doc.setDrawColor(...C.line); doc.setLineWidth(0.4); doc.line(this.M, this.y, this.W - this.M, this.y)
    this.y += 8
  }

  section(title: string) {
    this.need(22)
    this.doc.setFillColor(...C.terracotta); this.doc.rect(this.M, this.y - 4.2, 1.6, 6, 'F')
    this.font('bold', 13, C.brown); this.doc.text(this.t(title), this.M + 4, this.y)
    this.y += 8
  }

  private lines(lines: string[], size: number, x: number, style: 'normal' | 'bold' = 'normal', color = C.brown) {
    this.font(style, size, color)
    for (const l of lines) {
      this.need(this.lh(size)); this.doc.text(l, x, this.y); this.y += this.lh(size)
    }
  }

  para(text: string, size = 11, x = this.M, style: 'normal' | 'bold' = 'normal', color = C.brown) {
    this.font(style, size, color)
    for (const p of cleanText(text).split('\n')) {
      if (!p.trim()) { this.y += this.lh(size) * 0.5; continue }
      this.lines(this.doc.splitTextToSize(this.t(p), this.maxW - (x - this.M)), size, x, style, color)
    }
    this.y += 2
  }

  bullets(text: string, size = 11) {
    for (const it of toItems(text)) {
      this.font('normal', size, C.brown)
      const ls = this.doc.splitTextToSize(this.t(it), this.maxW - 7)
      this.need(this.lh(size) * Math.min(ls.length, 2))
      this.doc.setFillColor(...C.terracotta); this.doc.circle(this.M + 1.6, this.y - 1.2, 0.7, 'F')
      this.lines(ls, size, this.M + 5)
      this.y += 0.8
    }
    this.y += 2
  }

  /** Baris tautan yang bisa diklik di PDF (tiap baris hasil pembungkusan ikut menjadi tautan). */
  linkLine(url: string, label?: string, x = this.M + 5, size = 10) {
    this.font('normal', size, [31, 95, 168])
    const lines = this.doc.splitTextToSize(this.t(label || url), this.maxW - (x - this.M))
    for (const l of lines) {
      this.need(this.lh(size))
      this.doc.textWithLink(l, x, this.y, { url })
      this.y += this.lh(size)
    }
  }

  /** Teks kaya: # judul, ## subjudul, - butir, tautan. */
  richText(text: string, size = 11) {
    for (const b of parseRich(text)) {
      if (b.kind === 'h1') { this.gap(2); this.section(b.text); continue }
      if (b.kind === 'h2') { this.need(14); this.para(flattenInline(b.text), size + 0.5, this.M, 'bold'); continue }
      const parts = splitInline(b.text)
      if (parts.length === 1 && parts[0].url) { this.linkLine(parts[0].url, parts[0].text, this.M, size - 0.5); this.y += 1.5; continue }
      if (b.kind === 'bullet') this.bullets(flattenInline(b.text), size)
      else this.para(flattenInline(b.text), size)
    }
  }

  references(refs: ReferenceItem[]) {
    if (!refs.length) return
    this.section('Sumber & Referensi')
    refs.forEach((r, i) => {
      this.need(16)
      this.para(`${i + 1}. ${r.title || r.url}`, 10.5, this.M, 'bold')
      this.y -= 1.5
      this.linkLine(r.url, undefined, this.M + 5, 9.5)
      this.y += 1.5
    })
  }

  gap(h = 4) { this.y += h }

  writeLine() {
    this.need(8)
    this.doc.setDrawColor(...C.line); this.doc.setLineWidth(0.3)
    this.doc.line(this.M + 8, this.y, this.W - this.M, this.y); this.y += 7
  }

  finish() {
    const n = this.doc.getNumberOfPages()
    for (let i = 1; i <= n; i++) {
      this.doc.setPage(i)
      this.font('normal', 8.5, C.muted)
      this.doc.setDrawColor(...C.line); this.doc.setLineWidth(0.3)
      this.doc.line(this.M, this.H - 13, this.W - this.M, this.H - 13)
      this.doc.text(this.t(this.footerTitle.slice(0, 70)), this.M, this.H - 8)
      this.doc.text(`Hal. ${i} / ${n}`, this.W - this.M, this.H - 8, { align: 'right' })
    }
    return this.doc
  }
}

async function newPdf(footerTitle: string, allText: string, loader: FontLoader) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const b = new PdfBuilder(doc, footerTitle)
  await b.setupFont(allText, loader)
  return b
}

export async function buildModulePdf(m: ModuleExportData, meta: ExportMeta = {}, loader: FontLoader = defaultFontLoader) {
  const c = m.content
  const all = [m.title, m.subject, m.topic, m.description, m.learning_objectives,
    c.grade_level, c.duration, c.prerequisites, c.opening, c.main_activities, c.closing, c.assessment, c.media,
    ...c.references.flatMap(r => [r.title, r.url])].join(' ')
  const b = await newPdf(`Modul Ajar — ${m.title}`, all, loader)
  b.cover(m.title, 'Modul Ajar', [
    ['Mata Pelajaran', m.subject], ['Topik', m.topic], ['Fase / Kelas', c.grade_level],
    ['Alokasi Waktu', c.duration], ['Guru', meta.teacherName ?? ''], ['Tanggal', dateId(meta.date)],
  ])
  const blocks: [string, string, boolean][] = [
    ['Deskripsi', m.description ?? '', false],
    ['Tujuan Pembelajaran', m.learning_objectives ?? '', true],
    ['Pemahaman Prasyarat', c.prerequisites, true],
    ['Kegiatan Pembuka', c.opening, true],
    ['Kegiatan Inti', c.main_activities, true],
    ['Penutup', c.closing, true],
    ['Asesmen', c.assessment, true],
    ['Media & Sumber Belajar', c.media, true],
  ]
  for (const [title, text, asList] of blocks) {
    if (!cleanText(text).trim()) continue
    b.section(title)
    asList ? b.bullets(flattenInline(text)) : b.para(flattenInline(text))
    b.gap(3)
  }
  b.references(c.references)
  return b.finish()
}

export async function buildMaterialPdf(m: MaterialExportData, meta: ExportMeta = {}, loader: FontLoader = defaultFontLoader) {
  const refs = m.references ?? []
  const b = await newPdf(`Bahan Ajar — ${m.title}`,
    [m.title, m.subject, m.topic, m.description, m.text_content, m.external_url, ...refs.flatMap(r => [r.title, r.url])].join(' '), loader)
  b.cover(m.title, 'Bahan Ajar', [
    ['Mata Pelajaran', m.subject], ['Topik', m.topic], ['Guru', meta.teacherName ?? ''], ['Tanggal', dateId(meta.date)],
  ])
  if (m.description) { b.para(m.description, 11, b.M, 'bold'); b.gap(3) }
  if (m.material_type === 'link' && m.external_url) {
    b.section('Tautan Materi')
    b.linkLine(m.external_url, undefined, b.M, 10.5)
    b.gap(3)
  }
  if (m.text_content?.trim()) b.richText(m.text_content, 11)
  b.references(refs)
  return b.finish()
}

export async function buildQuestionsPdf(
  bank: BankExportData, opt: QuestionExportOptions, meta: ExportMeta = {}, loader: FontLoader = defaultFontLoader,
) {
  const qs = bank.questions
  const all = [bank.title, bank.subject, bank.topic, ...qs.flatMap(q => [q.question_text, q.explanation, q.rubric, ...q.options.map(o => o.text)])].join(' ')
  const b = await newPdf(`${opt.withKey ? 'Soal + Kunci' : 'Lembar Soal'} — ${bank.title}`, all, loader)
  const total = qs.reduce((s, q) => s + (q.points || 0), 0)
  b.cover(bank.title, opt.withKey ? 'Lembar Soal + Kunci Jawaban (khusus guru)' : 'Lembar Soal', [
    ['Mata Pelajaran', bank.subject], ['Topik', bank.topic],
    ['Jumlah Soal', `${qs.length} soal · total ${total} poin`], ['Guru', meta.teacherName ?? ''], ['Tanggal', dateId(meta.date)],
  ])
  if (!opt.withKey) {
    b.para('Nama : ______________________________      Kelas : ________      Tanggal : ____________', 10.5)
    b.gap(4)
  }
  if (bank.description) { b.para(bank.description, 10, b.M, 'normal', C.muted); b.gap(2) }

  let no = 0
  const key: string[] = []
  const groups: [string, ExportQuestion[]][] = [
    ['A. Pilihan Ganda', qs.filter(q => q.question_type === 'mcq')],
    ['B. Esai', qs.filter(q => q.question_type === 'essay')],
  ]
  for (const [label, list] of groups) {
    if (!list.length) continue
    b.section(label)
    for (const q of list) {
      no++
      b.need(26)
      b.para(`${no}. ${cleanText(q.question_text)}  [${q.points} poin]`, 11, b.M, 'bold')
      if (q.question_type === 'mcq') {
        q.options.forEach((o, i) => {
          const isKey = opt.withKey && o.id === q.correct_option_id
          b.para(`${letter(i)}. ${cleanText(o.text)}${isKey ? '   (kunci)' : ''}`, 10.5, b.M + 7, isKey ? 'bold' : 'normal', isKey ? C.green : C.brown)
        })
        const idx = q.options.findIndex(o => o.id === q.correct_option_id)
        key.push(`${no}. ${idx >= 0 ? letter(idx) : '-'}`)
      } else if (!opt.withKey) {
        for (let i = 0; i < 4; i++) b.writeLine()
      } else {
        b.para(`Rubrik / kunci: ${q.rubric?.trim() || '(belum diisi)'}`, 10, b.M + 7, 'normal', C.muted)
        key.push(`${no}. Esai`)
      }
      if (opt.withKey && q.explanation?.trim()) b.para(`Pembahasan: ${cleanText(q.explanation)}`, 10, b.M + 7, 'normal', C.muted)
      b.gap(2)
    }
  }
  if (opt.withKey && key.length) {
    b.section('Ringkasan Kunci Jawaban')
    b.para(key.join('     '), 11)
  }
  return b.finish()
}

/* ───────────── PPTX ───────────── */

async function newPptx(title: string, author: string) {
  const mod = await import('pptxgenjs')
  const Ctor = ((mod as unknown as { default?: typeof PptxGenJS }).default ?? (mod as unknown as typeof PptxGenJS)) as typeof PptxGenJS
  const pptx = new Ctor()
  pptx.layout = 'LAYOUT_16x9'
  pptx.title = title; pptx.author = author || 'RuangAjar'; pptx.company = 'RuangAjar'
  pptx.defineSlideMaster({
    title: 'RA',
    background: { color: HEX.cream },
    objects: [
      { rect: { x: 0, y: 0, w: 10, h: 0.16, fill: { color: HEX.terracotta } } },
      { text: { text: 'RuangAjar', options: { x: 0.5, y: 5.2, w: 3, h: 0.3, fontSize: 10, color: HEX.muted, fontFace: 'Calibri' } } },
    ],
    slideNumber: { x: 9.1, y: 5.2, fontSize: 10, color: HEX.muted, fontFace: 'Calibri' },
  })
  return pptx
}

function titleSlide(pptx: PptxGenJS, title: string, subtitle: string, lines: string[]) {
  const s = pptx.addSlide()
  s.background = { color: HEX.terracotta }
  s.addText('RUANGAJAR', { x: 0.6, y: 0.5, w: 5, h: 0.3, fontSize: 12, color: HEX.peach, bold: true, charSpacing: 4, fontFace: 'Calibri' })
  s.addText(title, { x: 0.6, y: 1.3, w: 8.8, h: 1.7, fontSize: title.length > 60 ? 28 : 36, bold: true, color: 'FFFFFF', fontFace: 'Calibri', valign: 'middle', fit: 'shrink' })
  s.addText(subtitle, { x: 0.6, y: 3.05, w: 8.8, h: 0.5, fontSize: 18, color: HEX.peach, fontFace: 'Calibri' })
  const meta = lines.filter(Boolean).join('   •   ')
  if (meta) s.addText(meta, { x: 0.6, y: 4.6, w: 8.8, h: 0.5, fontSize: 13, color: 'FFFFFF', fontFace: 'Calibri', fit: 'shrink' })
  return s
}

function headingOf(s: PptxGenJS.Slide, text: string, tag?: string) {
  s.addText(text, { x: 0.5, y: 0.35, w: tag ? 6.2 : 9, h: 0.7, fontSize: 26, bold: true, color: HEX.brown, fontFace: 'Calibri', valign: 'middle', fit: 'shrink' })
  if (tag) s.addText(tag, { x: 6.5, y: 0.4, w: 3.0, h: 0.5, fontSize: 12, bold: true, color: HEX.terracotta, align: 'right', fontFace: 'Calibri' })
  s.addShape('rect', { x: 0.5, y: 1.08, w: 1.2, h: 0.05, fill: { color: HEX.terracotta }, line: { color: HEX.terracotta, width: 0 } })
}

const LINK_BLUE = '1F5FA8'

/** Ubah teks (dengan tautan) menjadi potongan teks PowerPoint; tautan dibuat bisa diklik. */
function richRuns(text: string, base: Record<string, unknown> = {}): PptxGenJS.TextProps[] {
  return splitInline(text).map(p => p.url
    ? { text: p.text, options: { ...base, color: LINK_BLUE, underline: { style: 'sng' }, hyperlink: { url: p.url, tooltip: p.url } } }
    : { text: p.text, options: { ...base } }) as PptxGenJS.TextProps[]
}

interface SlideItem { text: string; bullet: boolean; bold: boolean }

function pageItems(items: SlideItem[], maxChars = 520, maxItems = 7): SlideItem[][] {
  const pieces: SlideItem[] = []
  for (const it of items) {
    for (const part of paginate([it.text], maxChars).flat()) pieces.push({ ...it, text: part })
  }
  const pages: SlideItem[][] = []
  let page: SlideItem[] = []; let chars = 0
  for (const p of pieces) {
    if (page.length && (chars + p.text.length > maxChars || page.length >= maxItems)) { pages.push(page); page = []; chars = 0 }
    page.push(p); chars += p.text.length
  }
  if (page.length) pages.push(page)
  return pages
}

function itemSlides(pptx: PptxGenJS, heading: string, items: SlideItem[], notes?: string) {
  const pages = pageItems(items)
  pages.forEach((its, i) => {
    const s = pptx.addSlide({ masterName: 'RA' })
    headingOf(s, pages.length > 1 ? `${heading} (${i + 1}/${pages.length})` : heading)
    const size = its.reduce((a, b) => a + b.text.length, 0) > 380 ? 16 : 19
    const runs: PptxGenJS.TextProps[] = []
    its.forEach(it => {
      const rs = richRuns(it.text, { bold: it.bold })
      rs.forEach((r, k) => {
        const o = { ...(r.options ?? {}) } as PptxGenJS.TextPropsOptions
        if (k === 0) { o.bullet = it.bullet ? { indent: 18 } : false; o.paraSpaceAfter = 8 }
        if (k === rs.length - 1) o.breakLine = true
        runs.push({ text: r.text, options: o })
      })
    })
    s.addText(runs, { x: 0.6, y: 1.35, w: 8.8, h: 3.7, fontSize: size, color: HEX.brown, fontFace: 'Calibri', valign: 'top', fit: 'shrink' })
    if (notes) s.addNotes(notes)
  })
}

/** Daftar butir (satu baris = satu butir). */
function bulletSlides(pptx: PptxGenJS, heading: string, text: string, notes?: string) {
  itemSlides(pptx, heading, toItems(text).map(t => ({ text: t, bullet: true, bold: false })), notes)
}

/** Teks kaya: tiap "# Judul" memulai slide baru dengan judul itu. */
function richSlides(pptx: PptxGenJS, defaultHeading: string, text: string) {
  let heading = defaultHeading
  let items: SlideItem[] = []
  const flush = () => { if (items.length) itemSlides(pptx, heading, items); items = [] }
  for (const b of parseRich(text)) {
    if (b.kind === 'h1') { flush(); heading = b.text; continue }
    items.push({ text: b.text, bullet: b.kind === 'bullet', bold: b.kind === 'h2' })
  }
  flush()
}

function referenceSlides(pptx: PptxGenJS, refs: ReferenceItem[]) {
  for (let i = 0; i < refs.length; i += 5) {
    const part = refs.slice(i, i + 5)
    const s = pptx.addSlide({ masterName: 'RA' })
    headingOf(s, refs.length > 5 ? `Sumber & Referensi (${i / 5 + 1}/${Math.ceil(refs.length / 5)})` : 'Sumber & Referensi')
    const runs: PptxGenJS.TextProps[] = []
    part.forEach((r, k) => {
      runs.push({ text: `${i + k + 1}. ${r.title || r.url}`, options: { bold: true, breakLine: true, fontSize: 16, color: HEX.brown } })
      runs.push({ text: r.url, options: { breakLine: true, fontSize: 13, color: LINK_BLUE, underline: { style: 'sng' }, hyperlink: { url: r.url, tooltip: r.url }, paraSpaceAfter: 10 } })
    })
    s.addText(runs, { x: 0.6, y: 1.35, w: 8.8, h: 3.7, fontFace: 'Calibri', valign: 'top', fit: 'shrink' })
  }
}

async function savePptx(pptx: PptxGenJS, filename: string) {
  await pptx.writeFile({ fileName: filename })
}

export async function buildModulePptx(m: ModuleExportData, meta: ExportMeta = {}) {
  const c = m.content
  const pptx = await newPptx(m.title, meta.teacherName ?? '')
  titleSlide(pptx, m.title, 'Modul Ajar', [m.subject, m.topic, c.grade_level, meta.teacherName ?? ''])
  const idItems = [
    m.subject && `Mata pelajaran: ${m.subject}`, m.topic && `Topik: ${m.topic}`,
    c.grade_level && `Fase / kelas: ${c.grade_level}`, c.duration && `Alokasi waktu: ${c.duration}`,
  ].filter(Boolean) as string[]
  if (idItems.length) bulletSlides(pptx, 'Identitas Modul', idItems.join('\n'))
  const blocks: [string, string][] = [
    ['Deskripsi', m.description ?? ''], ['Tujuan Pembelajaran', m.learning_objectives ?? ''],
    ['Pemahaman Prasyarat', c.prerequisites], ['Kegiatan Pembuka', c.opening], ['Kegiatan Inti', c.main_activities],
    ['Penutup', c.closing], ['Asesmen', c.assessment], ['Media & Sumber Belajar', c.media],
  ]
  for (const [h, t] of blocks) if (cleanText(t).trim()) bulletSlides(pptx, h, t)
  referenceSlides(pptx, c.references)
  return pptx
}

export async function buildMaterialPptx(m: MaterialExportData, meta: ExportMeta = {}) {
  const pptx = await newPptx(m.title, meta.teacherName ?? '')
  titleSlide(pptx, m.title, 'Bahan Ajar', [m.subject, m.topic, meta.teacherName ?? ''])
  if (m.description) bulletSlides(pptx, 'Ringkasan', m.description)
  if (m.material_type === 'link' && m.external_url) referenceSlides(pptx, [{ title: 'Tautan materi', url: m.external_url }])
  if (m.text_content?.trim()) richSlides(pptx, 'Materi', m.text_content)
  referenceSlides(pptx, m.references ?? [])
  return pptx
}

export async function buildQuestionsPptx(bank: BankExportData, opt: QuestionExportOptions, meta: ExportMeta = {}) {
  const pptx = await newPptx(bank.title, meta.teacherName ?? '')
  const total = bank.questions.reduce((s, q) => s + (q.points || 0), 0)
  titleSlide(pptx, bank.title, opt.withKey ? 'Soal + Kunci Jawaban' : 'Latihan Soal',
    [bank.subject, bank.topic, `${bank.questions.length} soal · ${total} poin`])
  const ordered = [...bank.questions.filter(q => q.question_type === 'mcq'), ...bank.questions.filter(q => q.question_type === 'essay')]
  const key: string[] = []
  ordered.forEach((q, i) => {
    const no = i + 1
    const s = pptx.addSlide({ masterName: 'RA' })
    headingOf(s, `Soal ${no}`, `${q.question_type === 'mcq' ? 'Pilihan Ganda' : 'Esai'} · ${q.points} poin`)
    const qt = cleanText(q.question_text)
    const optChars = q.options.reduce((a, o) => a + o.text.length, 0)
    const qSize = qt.length > 650 ? 14 : qt.length > 380 ? 17 : 21
    if (q.question_type === 'mcq') {
      const qh = qt.length > 380 ? 2.0 : qt.length > 160 ? 1.5 : 1.0
      s.addText(qt, { x: 0.6, y: 1.3, w: 8.8, h: qh, fontSize: qSize, color: HEX.brown, fontFace: 'Calibri', valign: 'top', fit: 'shrink' })
      const oy = 1.3 + qh + 0.1
      s.addText(q.options.map((o, idx) => {
        const isKey = opt.withKey && o.id === q.correct_option_id
        return { text: `${letter(idx)}.  ${o.text}${isKey ? '   ✓' : ''}`,
          options: { breakLine: true, paraSpaceAfter: 6, bold: isKey, color: isKey ? HEX.green : HEX.brown } }
      }), { x: 0.8, y: oy, w: 8.6, h: 5.05 - oy, fontSize: optChars > 320 || qt.length > 380 ? 14 : 18, fontFace: 'Calibri', valign: 'top', fit: 'shrink' })
      const idx = q.options.findIndex(o => o.id === q.correct_option_id)
      key.push(`${no}. ${idx >= 0 ? letter(idx) : '-'}`)
    } else {
      s.addText(qt, { x: 0.6, y: 1.3, w: 8.8, h: opt.withKey && q.rubric ? 2.0 : 3.6, fontSize: qSize, color: HEX.brown, fontFace: 'Calibri', valign: 'top', fit: 'shrink' })
      if (opt.withKey) {
        s.addText(`Rubrik / kunci: ${q.rubric?.trim() || '(belum diisi)'}`, { x: 0.6, y: 3.4, w: 8.8, h: 1.6, fontSize: 14, color: HEX.green, fontFace: 'Calibri', valign: 'top', fit: 'shrink' })
        key.push(`${no}. Esai`)
      }
    }
    if (opt.withKey && q.explanation?.trim()) s.addNotes(`Pembahasan: ${cleanText(q.explanation)}`)
  })
  if (opt.withKey && key.length) {
    for (let i = 0; i < key.length; i += 30) {
      const part = key.slice(i, i + 30)
      const rows: string[] = []
      for (let r = 0; r < part.length; r += 5) rows.push(part.slice(r, r + 5).join('      '))
      const s = pptx.addSlide({ masterName: 'RA' })
      headingOf(s, key.length > 30 ? `Kunci Jawaban (${i / 30 + 1})` : 'Kunci Jawaban')
      s.addText(rows.map(t => ({ text: t, options: { breakLine: true, paraSpaceAfter: 10 } })),
        { x: 0.8, y: 1.4, w: 8.4, h: 3.6, fontSize: 22, color: HEX.brown, fontFace: 'Calibri', valign: 'top', fit: 'shrink' })
    }
  }
  return pptx
}

/* ───────────── fungsi publik: bangun + unduh ───────────── */

export type ExportFormat = 'pdf' | 'pptx'

export async function exportModule(m: ModuleExportData, format: ExportFormat, meta: ExportMeta = {}) {
  const name = `modul-${slugify(m.title)}`
  if (format === 'pdf') (await buildModulePdf(m, meta)).save(`${name}.pdf`)
  else await savePptx(await buildModulePptx(m, meta), `${name}.pptx`)
}

export async function exportMaterial(m: MaterialExportData, format: ExportFormat, meta: ExportMeta = {}) {
  const name = `materi-${slugify(m.title)}`
  if (format === 'pdf') (await buildMaterialPdf(m, meta)).save(`${name}.pdf`)
  else await savePptx(await buildMaterialPptx(m, meta), `${name}.pptx`)
}

export async function exportQuestionBank(bank: BankExportData, format: ExportFormat, opt: QuestionExportOptions, meta: ExportMeta = {}) {
  const name = `${opt.withKey ? 'soal-kunci' : 'soal'}-${slugify(bank.title)}`
  if (format === 'pdf') (await buildQuestionsPdf(bank, opt, meta)).save(`${name}.pdf`)
  else await savePptx(await buildQuestionsPptx(bank, opt, meta), `${name}.pptx`)
}

export { download as _download }
