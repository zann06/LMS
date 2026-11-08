/**
 * Konfigurasi runtime RuangAjar.
 *
 * File ini dimuat sebelum aplikasi berjalan dan BISA diedit SETELAH build —
 * tanpa kompilasi ulang. Ini jalur konfigurasi paling praktis untuk
 * GitHub Pages: fork repo → isi dua nilai di bawah → push.
 *
 * Cara mendapatkan nilainya:
 *   Supabase Dashboard → Project Settings → API
 *   - Project URL      → supabaseUrl
 *   - anon / public key → supabaseAnonKey
 *
 * Catatan keamanan: hanya anon key yang boleh di sini (bukan service_role).
 * Jika kamu tidak ingin menaruh anon key di file ini, kosongkan saja dan
 * gunakan environment variables saat build (VITE_SUPABASE_URL & 
 * VITE_SUPABASE_ANON_KEY) — misalnya lewat GitHub Actions Secrets.
 */
window.RUANGAJAR_CONFIG = {
  supabaseUrl: 'https://your-project.supabase.co',
  supabaseAnonKey: 'your-anon-key-here',
}
