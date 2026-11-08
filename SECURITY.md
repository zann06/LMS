# Kebijakan Keamanan

## Melaporkan Kerentanan

Jika Anda menemukan kerentanan keamanan di RuangAjar, **jangan** buka issue publik.

Laporkan melalui salah satu cara:

- **GitHub Security Advisory** (disarankan): tab **Security → Report a vulnerability** di repo ini
- Email pemilik repo (lihat profil [zann06](https://github.com/zann06))

Sertakan: deskripsi kerentanan, langkah reproduksi, dampak yang mungkin terjadi, dan (bila ada) usulan perbaikan.

Kami berusaha merespons dalam **7 hari** dan akan mengabari Anda perkembangan perbaikannya.

## Lingkup

**Di dalam lingkup:**

- Aplikasi frontend di repo ini (bypass route protection, XSS, ekspor data antar-kelas)
- SQL migration di `supabase/migrations/` (kebocoran RLS, eksposur kunci jawaban, privilege escalation antar-role)
- Alur autentikasi & reset password

**Di luar lingkup:**

- Kerentanan platform Supabase itu sendiri → lapor ke [Supabase](https://supabase.com/security)
- Masalah pada instance demo publik (dianggap tidak ada data nyata di sana)
- Bailing testing pada instance milik pihak lain tanpa izin

## Catatan Desain Keamanan

- Frontend memakai **anon key** — memang dirancang publik. Perlindungan data ada di **Row Level Security** PostgreSQL, bukan kerahasiaan key frontend.
- Jika Anda menemukan cara membaca data di luar izin role **meski dengan anon key**, itu adalah bug RLS yang serius — mohon laporkan.
- `service_role` key tidak boleh pernah muncul di repo/aplikasi frontend.
