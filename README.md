# RuangAjar LMS

Learning Management System (LMS) untuk guru dan siswa. Guru mengelola kelas, materi, modul, tugas, bank soal, ujian, penilaian, dan analitik. Siswa mengakses materi, modul, tugas, ujian, dan melihat nilai.

Dibangun dengan **React 19 + TypeScript + Vite 7 + Tailwind CSS 4 + shadcn/ui**, dengan **Supabase** sebagai backend (PostgreSQL + Auth + Storage + RLS).

---

## Daftar Isi

- [Teknologi](#teknologi)
- [Fitur](#fitur)
- [Prasyarat](#prasyarat)
- [Cara Install](#cara-install)
- [Konfigurasi Environment](#konfigurasi-environment)
- [Setup Database Supabase](#setup-database-supabase)
- [Menjalankan Aplikasi](#menjalankan-aplikasi)
- [Struktur Proyek](#struktur-proyek)
- [Rute Aplikasi](#rute-aplikasi)
- [Skrip npm](#skrip-npm)
- [Keamanan](#keamanan)
- [Troubleshooting](#troubleshooting)
- [Lisensi](#lisensi)

---

## Teknologi

| Layer | Teknologi |
|---|---|
| Framework | React 19, React Router 7 |
| Bahasa | TypeScript 5.9 |
| Build | Vite 7 |
| Styling | Tailwind CSS 4, shadcn/ui, Radix UI |
| Backend | Supabase (PostgreSQL, Auth, Storage, RLS) |
| Form | React Hook Form + Zod |
| Grafik | Recharts |
| Dokumen | jsPDF, pptxgenjs, csv parser |
| Lainnya | lucide-react, sonner, date-fns, next-themes |

---

## Fitur

### Guru
- **Dashboard** — ringkasan aktivitas kelas
- **Kelas** — kelola kelas, detail kelas, tambah siswa via email
- **Materi** — unggah dan kelola materi pembelajaran
- **Modul** — susun struktur modul pembelajaran
- **Tugas** — buat tugas, atur nilai, dan alur penilaian
- **Bank Soal** — kumpulan soal yang bisa dipakai ulang untuk ujian
- **Ujian** — buat ujian, kelola soal, publish nilai
- **Penilaian (Grading)** — nilai submission siswa
- **Analitik** — statistik dan performa kelas
- **Pengaturan** — pengaturan akun guru

### Siswa
- **Dashboard** — ringkasan tugas dan ujian
- **Materi** & **Modul** — akses materi pembelajaran
- **Tugas** — kerjakan dan submit tugas
- **Ujian** — ujian dengan aturan attempt & timing
- **Nilai** — rekap nilai tugas dan ujian
- **Profil** — data akun siswa

### Umum
- Login & lupa password (Supabase Auth)
- Route protection berbasis role (guru / siswa)
- Multi-role: satu aplikasi untuk dua portal

---

## Prasyarat

- **Node.js** 20.19+ atau 22.12+ ([unduh](https://nodejs.org))
- **npm** 10+
- Akun **Supabase** — <https://supabase.com>
- (Opsional) **Supabase CLI** untuk menjalankan migration lokal
  ```bash
  npm install -g supabase
  ```

Cek versi:

```bash
node -v
npm -v
```

---

## Cara Install

```bash
git clone https://github.com/zann06/LMS.git
cd LMS
npm install
```

---

## Konfigurasi Environment

Buat file `.env` di root proyek. **Jangan pernah commit file ini** — sudah otomatis di-ignore oleh `.gitignore`.

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Isi `.env`:

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

### Cara mendapatkan nilainya

1. Buka project di <https://supabase.com/dashboard>
2. **Project Settings → API**
3. Salin **Project URL** → `VITE_SUPABASE_URL`
4. Salin **anon / public** key → `VITE_SUPABASE_ANON_KEY`

> **Penting**
> - Hanya gunakan **anon / public key**. **Jangan pernah** menaruh `service_role` key di kode frontend — key ini melewati RLS dan bisa membocorkan seluruh database.
> - Setelah mengubah `.env`, restart dev server (`npm run dev`) agar Vite memuat ulang environment.

---

## Setup Database Supabase

Schema database disimpan di `supabase/migrations/`.

### Cara A — Supabase SQL Editor (paling mudah)

Buka project di dashboard, lalu jalankan file di bawah ini **berurutan** lewat **SQL Editor → New query → Run**:

1. `supabase/migrations/20261006144215_001_initial_schema.sql` — schema, tabel, RLS, trigger
2. `supabase/migrations/20261007074229_repair_auth_profile_trigger.sql` — perbaikan trigger pembuatan profil
3. `supabase/migrations/20261007080001_private_answer_keys.sql` — mengunci kunci jawaban
4. `supabase/migrations/002_teacher_tools.sql` — fitur guru (analytics, penilaian, RPC)

### Cara B — Supabase CLI (lokal)

```bash
supabase login
supabase link --project-ref <project-ref>
supabase db push
```

### Akun demo guru (opsional)

Dua migration membuat akun demo `guru@ruangajar.com`. **Password tidak disimpan di repo ini.** Migration membaca password dari session variable `app.demo_teacher_password`, dan akan dilewati (*no-op*) jika variable tersebut belum di-set.

Jalankan di SQL Editor, **dalam satu sesi**:

```sql
SET app.demo_teacher_password = 'password-anda-yang-kuat';
```

Kemudian jalankan salah satu dari:
- `supabase/migrations/20261007073725_create_test_teacher_account.sql`
- `supabase/migrations/20261007074029_repair_test_teacher_auth_account.sql`

> Jangan pernah menjalankan akun demo ini di project produksi, dan jangan pernah commit password asli.

---

## Menjalankan Aplikasi

```bash
npm run dev      # server pengembangan, biasanya http://localhost:5173
npm run build    # type-check + build produksi ke dist/
npm run preview  # preview hasil build
npm run typecheck# cek TypeScript tanpa emit
```

Output build produksi ada di folder `dist/`, bisa di-deploy ke **Vercel**, **Netlify**, **Cloudflare Pages**, atau hosting statis lainnya.

---

## Struktur Proyek

```
.
├── public/                  # Aset statik (font, svg)
├── src/
│   ├── components/
│   │   └── ui/              # Komponen shadcn/ui
│   ├── contexts/
│   │   └── auth-context.tsx # State autentikasi & role
│   ├── hooks/
│   │   └── use-mobile.ts    # Media query untuk breakpoint
│   ├── lib/
│   │   ├── supabase.ts          # Klien Supabase
│   │   ├── supabase-isolated.ts # Klien dengan context auth terpisah
│   │   ├── database.types.ts    # Tipe TypeScript dari schema
│   │   ├── content-types.ts     # Tipe konten materi
│   │   ├── csv.ts               # Parser & ekspor CSV
│   │   ├── export-documents.ts  # Ekspor PDF / PPTX
│   │   ├── grade-data.ts        # Perhitungan nilai
│   │   └── utils.ts             # Helper `cn()`
│   ├── pages/
│   │   ├── login.tsx
│   │   ├── forgot-password.tsx
│   │   ├── student/         # Portal siswa
│   │   └── teacher/         # Portal guru
│   ├── App.tsx              # Routing
│   ├── main.tsx             # Entry point
│   └── index.css            # Token tema & style global
├── supabase/
│   └── migrations/          # Skema PostgreSQL (SQL)
├── .env.example             # Template konfigurasi
└── vite.config.ts
```

---

## Rute Aplikasi

### Publik
| Rute | Keterangan |
|---|---|
| `/login` | Halaman masuk |
| `/forgot-password` | Reset password |

### Guru — `/teacher/*`
| Rute | Halaman |
|---|---|
| `/teacher/dashboard` | Dashboard guru |
| `/teacher/classes` | Daftar kelas |
| `/teacher/classes/:classId` | Detail kelas |
| `/teacher/materials` | Kelola materi |
| `/teacher/modules` | Kelola modul |
| `/teacher/assignments` | Kelola tugas |
| `/teacher/question-banks` | Bank soal |
| `/teacher/question-banks/:bankId` | Detail bank soal |
| `/teacher/exams` | Daftar ujian |
| `/teacher/exams/new` | Buat ujian |
| `/teacher/exams/:examId` | Detail ujian |
| `/teacher/grading` | Penilaian |
| `/teacher/analytics` | Analitik |
| `/teacher/settings` | Pengaturan |

### Siswa — `/student/*`
| Rute | Halaman |
|---|---|
| `/student/dashboard` | Dashboard siswa |
| `/student/materials` | Materi |
| `/student/modules` | Modul |
| `/student/assignments` | Tugas |
| `/student/exams` | Ujian |
| `/student/exam-attempts/:attemptId` | Mengerjakan ujian |
| `/student/grades` | Nilai |
| `/student/profile` | Profil |

Semua rute `/teacher` dan `/student` dilindungi `ProtectedRoute` — rute `/teacher` mewajibkan role guru.

---

## Skrip npm

| Perintah | Fungsi |
|---|---|
| `npm run dev` | Menjalankan dev server dengan HMR |
| `npm run build` | Type-check lalu build produksi ke `dist/` |
| `npm run preview` | Menjalankan preview server hasil build |
| `npm run typecheck` | Cek TypeScript tanpa build |

---

## Keamanan

### Yang sudah dilakukan di repo ini

- **`.env` tidak pernah di-commit.** Aturan `.env`, `.env.*`, dan `*.env` ada di `.gitignore`, dengan pengecualian hanya untuk `.env.example` yang isinya placeholder.
- **Folder Supabase lokal di-ignore.** Hanya `supabase/migrations/` (file `.sql` schema) yang di-commit. `supabase/.temp/`, `.branches/`, dan `config.toml.local` dikecualikan karena berisi data container lokal, port, dan log.
- **Tidak ada password hardcoded.** Akun demo guru membaca password dari session variable `app.demo_teacher_password` saat runtime, bukan disimpan di dalam kode.
- **`service_role` key tidak ada di repo.** Aplikasi hanya memakai anon key, dan akses data dilindungi **Row Level Security (RLS)** di sisi database.
- **`node_modules/` dan `dist/` di-ignore.**

### Checklist sebelum deploy

- [ ] Pastikan repo **private** selama masih tahap pengembangan.
- [ ] Cek **Settings → Secrets** di repo: hapus `VITE_SUPABASE_URL` & `VITE_SUPABASE_ANON_KEY` bila tidak dipakai.
- [ ] Aktifkan **Settings → Secret scanning** dan **Push protection** di repo.
- [ ] Verifikasi bahwa `.env` benar-benar tidak ikut ter-*commit* sebelum melakukan push pertama:
  ```bash
  git ls-files | Select-String "\.env"
  # Seharusnya HANYA outputting .env.example
  ```
- [ ] Kalau `service_role` key pernah bocor (ter-*commit* atau terkirim), **rotasi key tersebut di dashboard Supabase** — menghapus file dari riwayat commit saja tidak cukup.
- [ ] Ganti/hapus akun demo sebelum production.
- [ ] Pastikan RLS policy di Supabase sudah sesuai untuk data produksi.

### Kalau kredensial terlanjur ter-*commit*

Menghapus file tidak cukup, karena masih ada di riwayat Git. Yang perlu dilakukan:

```bash
git rm --cached .env
git commit --amend
```

Untuk histogram yang sudah ter-*push*, bersihkan dengan `git filter-repo` atau **BFG Repo Cleaner**, lalu **rotasi semua kredensial terkait**.

---

## Troubleshooting

| Gejala | Penyebab & Solusi |
|---|---|
| `Invalid API key` saat login | `VITE_SUPABASE_ANON_KEY` salah / belum diisi. Isi ulang di `.env`, lalu restart `npm run dev`. |
| `Failed to fetch` / CORS | `VITE_SUPABASE_URL` salah, atau project Supabase sedang paused. Cek dashboard. |
| Tabel tidak ditemukan / `relation does not exist` | Migration belum dijalankan. Jalankan file di `supabase/migrations/` lewat SQL Editor. |
| Login berhasil lalu langsung ke `/login` | Trigger `handle_new_user()` belum aktif. Jalankan `20261007074229_repair_auth_profile_trigger.sql`. |
| Role pengguna tidak sesuai portal | Role diambil dari `profiles.role`. Pastikan nilainya `teacher` atau `student`. |
| Error TypeScript saat build | Jalankan `npm run typecheck` untuk melihat detail error. |
| Perubahan `.env` tidak terbaca | Environment Vite hanya dimuat saat start — restart dev server. |

---

## Lisensi

Proyek ini bersifat privat. Seluruh hak cipta dilindungi.

© 2026 RuangAjar