# Panduan Kontribusi

Terima kasih mau berkontribusi ke RuangAjar! 🎉 Dokumen ini menjelaskan cara memulai dan standar yang kami harapkan.

## Cara Memulai

1. **Fork** repo ini, lalu clone fork Anda:
   ```bash
   git clone https://github.com/<username-anda>/LMS.git
   cd LMS
   npm install
   ```
2. Setup backend mengikuti bagian [Mulai Cepat di README](README.md#mulai-cepat) — Anda butuh project Supabase sendiri (gratis).
3. Buat branch dari `main`:
   ```bash
   git checkout -b fitur/nama-fitur   # atau: perbaiki/deskripsi-bug
   ```

## Jenis Kontribusi yang Dibutuhkan

- 🐛 Perbaikan bug
- ✨ Fitur baru (cek [Roadmap](README.md#roadmap) dulu — mungkin sudah ada rencananya)
- 📝 Dokumentasi & terjemahan
- 🧪 Pengujian & laporan bug
- 🎨 Perbaikan UI/UX & aksesibilitas
- 🖼️ Screenshot untuk README

## Sebelum Membuka Pull Request

- [ ] `npm run typecheck` lolos tanpa error
- [ ] `npm run build` lolos
- [ ] Fitur/perbaikan sudah dicoba manual di browser (`npm run dev`)
- [ ] Tidak ada kredensial/data nyata yang ikut ter-commit
- [ ] Pesan commit menjelaskan *kenapa*, bukan hanya *apa*

### Standar kode

- **TypeScript strict** — tidak boleh ada `any` baru tanpa alasan kuat.
- **Komponen & komentar** mengikuti gaya file sekitar (lihat `src/pages/teacher/` sebagai referensi).
- **Komponen UI baru** sebaiknya dari shadcn/ui (`npx shadcn@latest add <komponen>`) agar konsisten.
- **SQL migration** baru diletakkan di `supabase/migrations/` dengan format nama `YYYYMMDDHHMMSS_<deskripsi>.sql` — migration lama jangan diubah.
- **Teks antarmuka** dalam Bahasa Indonesia.

### Pesan commit

Gunakan gaya [Conventional Commits](https://www.conventionalcommits.org/id/):

```
feat(teacher): tambah filter kelas di halaman grading
fix(student): perbaiki timer ujian yang lanjut saat tab ditutup
docs: perbarui panduan deploy
```

## Melaporkan Bug

Buka [issue baru](https://github.com/zann06/LMS/issues/new/choose) dengan template **Bug Report**. Sertakan:

- Langkah reproduksi (minimal 2 langkah)
- Perilaku yang diharapkan vs yang terjadi
- Screenshot / log console bila relevan
- Browser & OS

## Mengusulkan Fitur

Buka issue dengan template **Feature Request**: jelaskan masalah yang ingin diselesaikan dan contoh kasus nyata di kelas. Fitur yang menyelesaikan masalah guru/siswa lebih diprioritaskan daripada fitur "keren tapi tidak terpakai".

## Pertanyaan?

Buka [Discussion](https://github.com/zann06/LMS/discussions) atau issue bertanda `question`.
