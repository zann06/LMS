/*
# Fix RLS Infinite Recursion (exams <-> exam_classes)

1. Problem
- Sama seperti classes <-> class_members: policy `exams` (sisi siswa)
  meng-subquery `exam_classes` + `class_members`, sementara policy
  `exam_classes` meng-subquery `exams` → 42P17 infinite recursion.

2. Fix
- Helper SECURITY DEFINER:
    public.is_exam_teacher(exam_uuid)
    public.is_active_exam_student(exam_uuid)
- Policy `exams`, `exam_classes`, dan `exam_questions` ditulis ulang.

3. Idempotent — aman diulang.
*/

-- ---------- Helper ----------
CREATE OR REPLACE FUNCTION public.is_exam_teacher(exam_uuid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.exams e
    WHERE e.id = exam_uuid AND e.teacher_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_active_exam_student(exam_uuid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.exam_classes ec
    JOIN public.class_members cm ON cm.class_id = ec.class_id
    JOIN public.classes c ON c.id = ec.class_id
    WHERE ec.exam_id = exam_uuid
      AND cm.student_id = auth.uid()
      AND cm.membership_status = 'active'
      AND c.is_archived = false
  );
$$;

REVOKE ALL ON FUNCTION public.is_exam_teacher(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_active_exam_student(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_exam_teacher(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_exam_student(uuid) TO anon, authenticated;

-- ---------- exams ----------
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='exams' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.exams', p.policyname);
  END LOOP;
END $$;

CREATE POLICY "exams_select_teacher" ON public.exams
  FOR SELECT USING (teacher_id = auth.uid());
CREATE POLICY "exams_select_student" ON public.exams
  FOR SELECT USING (status IN ('published','closed') AND public.is_active_exam_student(id));
CREATE POLICY "exams_insert_teacher" ON public.exams
  FOR INSERT WITH CHECK (teacher_id = auth.uid());
CREATE POLICY "exams_update_teacher" ON public.exams
  FOR UPDATE USING (teacher_id = auth.uid()) WITH CHECK (teacher_id = auth.uid());
CREATE POLICY "exams_delete_teacher" ON public.exams
  FOR DELETE USING (teacher_id = auth.uid());

-- ---------- exam_classes ----------
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='exam_classes' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.exam_classes', p.policyname);
  END LOOP;
END $$;

CREATE POLICY "exam_classes_select_teacher" ON public.exam_classes
  FOR SELECT USING (public.is_exam_teacher(exam_id));
CREATE POLICY "exam_classes_select_student" ON public.exam_classes
  FOR SELECT USING (public.is_active_exam_student(exam_id));
CREATE POLICY "exam_classes_insert_teacher" ON public.exam_classes
  FOR INSERT WITH CHECK (public.is_exam_teacher(exam_id));
CREATE POLICY "exam_classes_delete_teacher" ON public.exam_classes
  FOR DELETE USING (public.is_exam_teacher(exam_id));

-- ---------- exam_questions ----------
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='exam_questions' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.exam_questions', p.policyname);
  END LOOP;
END $$;

CREATE POLICY "exam_questions_select_teacher" ON public.exam_questions
  FOR SELECT USING (public.is_exam_teacher(exam_id));
CREATE POLICY "exam_questions_select_student" ON public.exam_questions
  FOR SELECT USING (public.is_active_exam_student(exam_id));
CREATE POLICY "exam_questions_insert_teacher" ON public.exam_questions
  FOR INSERT WITH CHECK (public.is_exam_teacher(exam_id));
CREATE POLICY "exam_questions_update_teacher" ON public.exam_questions
  FOR UPDATE USING (public.is_exam_teacher(exam_id)) WITH CHECK (public.is_exam_teacher(exam_id));
CREATE POLICY "exam_questions_delete_teacher" ON public.exam_questions
  FOR DELETE USING (public.is_exam_teacher(exam_id));
