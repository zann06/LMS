/**
 * Build khusus GitHub Pages: set VITE_BASE_PATH=/<repo>/ lalu jalankan vite build.
 *
 * Dijalankan lewat `npm run build:pages`. Nama repo diambil otomatis dari
 * remote git origin (mis. https://github.com/zann06/LMS.git → "LMS"), dengan
 * fallback ke package.json `config.repoName`.
 *
 * Kenapa bukan `VITE_BASE_PATH=/LMS/ npm run build`? Di Windows (Git Bash),
 * MSYS mengubah nilai env yang berawalan "/" menjadi path Windows — script
 * Node ini mengeset env secara langsung sehingga aman di semua OS.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
let repoName = pkg.config?.repoName ?? ''

try {
  const url = spawnSync('git', ['remote', 'get-url', 'origin'], { cwd: root, encoding: 'utf8' }).stdout?.trim()
  const match = url?.match(/[:/]([\w.-]+?)(?:\.git)?\/?$/)
  if (match) repoName = match[1]
} catch {
  // tanpa remote git — pakai fallback dari package.json
}

if (!repoName) {
  console.error('Tidak bisa menentukan nama repo. Set "config.repoName" di package.json.')
  process.exit(1)
}

const basePath = `/${repoName}/`
console.log(`▸ build:pages — base path "${basePath}"`)

const result = spawnSync('npx', ['vite', 'build'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, VITE_BASE_PATH: basePath },
})

process.exit(result.status ?? 1)
