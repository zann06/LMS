# RuangAjar — paket V2 (sisi guru)

Pasang di ATAS paket sebelumnya (V1 + 001_exam_grading.sql sudah terpasang).

1. Supabase SQL Editor: jalankan `supabase/002_teacher_tools.sql` (aman diulang). WAJIB sebelum deploy.
2. Timpa file di `src/` dengan isi folder ini (17 file, daftar di bawah).
3. Tidak ada paket npm baru.
4. `npm run build`.

File: lib/{content-types,export-documents,csv,supabase-isolated,grade-data,database.types}.ts
      pages/teacher/{analytics,assignments,class-detail,classes,dashboard,exams,exam-detail,grading,materials,modules,settings}.tsx
(`database.types.ts` buatan tangan: kalau kamu sudah mengubahnya sendiri, tambahkan saja kolom
 materials.references_json, assignments.max_score, dan 4 fungsi baru di bagian Functions.)
