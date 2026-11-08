/**
 * Sumber konfigurasi aplikasi (Supabase URL & anon key).
 *
 * Dua jalur konfigurasi, prioritas dari atas:
 *
 * 1. `public/config.js` — di-edit SETELAH build tanpa kompilasi ulang.
 *    Praktis untuk GitHub Pages: fork → isi config.js → deploy.
 * 2. `.env` / environment variables saat build (`VITE_SUPABASE_URL`, dst).
 *    Praktis untuk Vercel / Netlify / GitHub Actions Secrets.
 *
 * Catatan keamanan: hanya anon key yang boleh ada di sini. Anon key memang
 * dirancang untuk diekspos ke browser — data tetap terlindungi oleh
 * Row Level Security (RLS) di sisi database. JANGAN pernah menaruh
 * `service_role` key di file manapun di frontend.
 */

interface RuntimeConfig {
  supabaseUrl?: string
  supabaseAnonKey?: string
}

declare global {
  interface Window {
    RUANGAJAR_CONFIG?: RuntimeConfig
  }
}

const PLACEHOLDER_PATTERN = /your-project|your-anon-key|isi-di-sini|<|…/i

const runtime = typeof window !== 'undefined' ? window.RUANGAJAR_CONFIG : undefined

function pick(runtimeValue: string | undefined, envValue: string | undefined): string {
  // Coba runtime config dulu, lalu env build-time. Placeholder dari
  // .env.example / config.js dianggap "belum diisi" dan dilewati.
  const candidates = [(runtimeValue ?? '').trim(), (envValue ?? '').trim()]
  return candidates.find((v) => v && !PLACEHOLDER_PATTERN.test(v)) ?? ''
}

const resolvedUrl = pick(runtime?.supabaseUrl, import.meta.env.VITE_SUPABASE_URL)
const resolvedAnonKey = pick(runtime?.supabaseAnonKey, import.meta.env.VITE_SUPABASE_ANON_KEY)

function fail(variable: string): never {
  throw new Error(
    [
      `[RuangAjar] ${variable} belum diisi.`,
      '',
      'Isi dengan salah satu cara berikut:',
      '  1. Edit `public/config.js` (praktis untuk GitHub Pages), atau',
      '  2. Isi `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY` di file `.env`.',
      '',
      'Nilainya ada di Supabase Dashboard → Project Settings → API.',
      'Panduan lengkap ada di README bagian "Konfigurasi".',
    ].join('\n'),
  )
}

if (!resolvedUrl) fail('Supabase URL')
if (!resolvedAnonKey) fail('Supabase anon key')

export const supabaseUrl = resolvedUrl
export const supabaseAnonKey = resolvedAnonKey
