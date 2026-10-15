import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

/**
 * Klien Supabase terpisah (tidak menyimpan sesi) khusus untuk membuatkan akun siswa.
 * supabase.auth.signUp() di klien utama akan MENGGANTI sesi guru dengan sesi siswa baru
 * (bila konfirmasi email dimatikan), sehingga guru mendadak login sebagai siswa.
 */
export function createIsolatedClient() {
  return createClient<Database>(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'ruangajar-isolated-signup' },
  })
}

const PW_CHARS = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export function randomPassword(len = 10) {
  const buf = new Uint32Array(len)
  crypto.getRandomValues(buf)
  return Array.from(buf, n => PW_CHARS[n % PW_CHARS.length]).join('')
}

export type CreateStudentResult = { ok: true; userId: string } | { ok: false; error: string }

/** Buat akun siswa tanpa mengganggu sesi guru, lalu isi profil. */
export async function createStudentAccount(input: { email: string; password: string; fullName: string; studentNumber: string | null }): Promise<CreateStudentResult> {
  const iso = createIsolatedClient()
  const { data, error } = await iso.auth.signUp({
    email: input.email, password: input.password,
    options: { data: { full_name: input.fullName, role: 'student' } },
  })
  if (error) {
    return { ok: false, error: /already|registered/i.test(error.message) ? 'Email sudah terdaftar' : error.message }
  }
  // Supabase mengembalikan user "palsu" tanpa identitas bila email sudah terdaftar (anti-enumerasi)
  if (!data.user || (data.user.identities && data.user.identities.length === 0)) {
    return { ok: false, error: 'Email sudah terdaftar' }
  }
  // isi profil memakai sesi siswa itu sendiri bila ada (paling kecil kemungkinan ditolak RLS)
  if (data.session) {
    await iso.from('profiles').update({ full_name: input.fullName, student_number: input.studentNumber, role: 'student' }).eq('id', data.user.id)
    await iso.auth.signOut({ scope: 'local' })
  }
  return { ok: true, userId: data.user.id }
}
