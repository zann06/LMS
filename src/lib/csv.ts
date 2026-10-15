/** Util CSV: aman dibuka di Excel (BOM UTF-8), kutip ganda di-escape, dan sel diawali = + - @ dinetralkan. */

const DANGEROUS = /^[=+\-@\t\r]/

export function csvCell(v: string | number | boolean | null | undefined): string {
  let s = v === null || v === undefined ? '' : String(v)
  if (typeof v === 'string' && DANGEROUS.test(s)) s = `'${s}`   // cegah formula injection di Excel/Sheets
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(rows: (string | number | boolean | null | undefined)[][]): string {
  return '\ufeff' + rows.map(r => r.map(csvCell).join(',')).join('\r\n')
}

export function downloadCsv(filename: string, rows: (string | number | boolean | null | undefined)[][]) {
  const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/** Parser CSV sederhana: pembatas , atau ; (otomatis), tanda kutip, BOM. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\ufeff/, '')
  const first = src.split(/\r?\n/, 1)[0] ?? ''
  const delim = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ';' : ','
  const rows: string[][] = []
  let row: string[] = []; let cell = ''; let inQuotes = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (inQuotes) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++ }
      else if (c === '"') inQuotes = false
      else cell += c
    } else if (c === '"') inQuotes = true
    else if (c === delim) { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(cell); cell = ''
      if (row.some(x => x.trim() !== '')) rows.push(row)
      row = []
    } else cell += c
  }
  row.push(cell)
  if (row.some(x => x.trim() !== '')) rows.push(row)
  return rows.map(r => r.map(x => x.trim()))
}
