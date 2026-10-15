import { parseRich, splitInline } from '@/lib/export-documents'

const safe = (u: string) => /^https?:\/\//i.test(u)

function Inline({ text }: { text: string }) {
  return (
    <>
      {splitInline(text).map((p, i) => p.url && safe(p.url)
        ? <a key={i} href={p.url} target="_blank" rel="noopener noreferrer" className="text-primary underline break-all">{p.text}</a>
        : <span key={i}>{p.text}</span>)}
    </>
  )
}

/** Tampilkan teks materi berformat ringan: # judul, ## subjudul, - butir, tautan. */
export function RichText({ text, className }: { text: string; className?: string }) {
  const blocks = parseRich(text)
  const out: React.ReactNode[] = []
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]
    if (b.kind === 'bullet') {
      const items = [b]
      while (blocks[i + 1]?.kind === 'bullet') items.push(blocks[++i])
      out.push(<ul key={i} className="list-disc space-y-1 pl-5">{items.map((it, k) => <li key={k}><Inline text={it.text} /></li>)}</ul>)
    } else if (b.kind === 'h1') out.push(<h3 key={i} className="mt-4 text-base font-semibold first:mt-0">{b.text}</h3>)
    else if (b.kind === 'h2') out.push(<h4 key={i} className="mt-2 text-sm font-semibold">{b.text}</h4>)
    else out.push(<p key={i}><Inline text={b.text} /></p>)
  }
  return <div className={`space-y-2 text-sm leading-relaxed ${className ?? ''}`}>{out}</div>
}

/** Cuplikan polos untuk kartu (tanpa tanda # atau -). */
export function plainPreview(text: string | null | undefined): string {
  return parseRich(text ?? '').map(b => splitInline(b.text).map(p => p.text).join('')).join(' ')
}

/** Hanya izinkan tautan http(s) (data lama bisa berisi skema berbahaya). */
export const safeUrl = (u: string | null | undefined) => (u && safe(u) ? u : null)
