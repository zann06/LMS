/*
# Tambah Policy INSERT yang Hilang

1. Problem
- `exam_attempts`, `student_answers`, dan `grades` tidak memiliki policy
  INSERT sama sekali (hanya SELECT/UPDATE/DELETE). Dengan RLS aktif,
  operasi inti aplikasi gagal pada instalasi baru:
    - siswa menekan "Mulai Ujian" (insert exam_attempts) → ditolak
    - siswa menyimpan jawaban (insert student_answers) → ditolak
    - guru menerbitkan nilai (insert grades) → ditolak

2. Fix
- Tambahkan policy INSERT yang selaras dengan policy SELECT/UPDATE existing.

3. Idempotent — DROP IF EXISTS lalu buat ulang.
*/

-- exam_attempts: siswa memulai percobaan ujian pada kelas yang diikuti
DROP POLICY IF EXISTS "exam_attempts_insert_student" ON public.exam_attempts;
CREATE POLICY "exam_attempts_insert_student" ON public.exam_attempts
  FOR INSERT WITH CHECK (
    student_id = auth.uid()
    AND status = 'in_progress'
    AND public.is_active_exam_student(exam_id)
  );

-- student_answers: siswa mengisi jawaban pada percobaannya sendiri yang sedang berjalan
DROP POLICY IF EXISTS "student_answers_insert_student" ON public.student_answers;
CREATE POLICY "student_answers_insert_student" ON public.student_answers
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.exam_attempts ea
      WHERE ea.id = student_answers.attempt_id
        AND ea.student_id = auth.uid()
        AND ea.status = 'in_progress'
    )
  );

-- grades: guru menerbitkan nilai untuk kelas miliknya
DROP POLICY IF EXISTS "grades_insert_teacher" ON public.grades;
CREATE POLICY "grades_insert_teacher" ON public.grades
  FOR INSERT WITH CHECK (
    graded_by = auth.uid()
    AND public.is_class_teacher(class_id)
  );
