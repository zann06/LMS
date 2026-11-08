/*
# Fix RLS Infinite Recursion (classes <-> class_members)

1. Problem
- Policy SELECT pada `classes` (sisi siswa) meng-subquery `class_members`,
  sementara policy pada `class_members` meng-subquery `classes`.
  Saat guru menjalankan query, Postgres mengevaluasi kedua arah tersebut
  berulang dan gagal dengan error:
  `42P17 infinite recursion detected in policy for relation "classes"`.

2. Fix
- Dua fungsi helper SECURITY DEFINER (bypass RLS pada tabel yang dirujuk,
  sehingga rantai evaluasi terputus):
    public.is_class_teacher(class_uuid)          — apakah user adalah guru pemilik kelas
    public.is_active_class_student(class_uuid)   — apakah user adalah siswa aktif kelas
- Semua policy pada `classes` dan `class_members` ditulis ulang memakai helper tsb.

3. Idempotent
- CREATE OR REPLACE FUNCTION + DROP POLICY IF EXISTS — aman diulang.
*/

-- ---------- Helper ----------
CREATE OR REPLACE FUNCTION public.is_class_teacher(class_uuid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.classes c
    WHERE c.id = class_uuid AND c.teacher_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_active_class_student(class_uuid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.class_members m
    WHERE m.class_id = class_uuid
      AND m.student_id = auth.uid()
      AND m.membership_status = 'active'
  );
$$;

REVOKE ALL ON FUNCTION public.is_class_teacher(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_active_class_student(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_class_teacher(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_class_student(uuid) TO anon, authenticated;

-- ---------- classes ----------
DROP POLICY IF EXISTS "classes_select_teacher" ON public.classes;
DROP POLICY IF EXISTS "classes_select_student" ON public.classes;
DROP POLICY IF EXISTS "classes_insert_teacher" ON public.classes;
DROP POLICY IF EXISTS "classes_update_teacher" ON public.classes;
DROP POLICY IF EXISTS "classes_delete_teacher" ON public.classes;
-- nama policy lama bisa berbeda; bersihkan semua policy classes lalu buat ulang
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='classes' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.classes', p.policyname);
  END LOOP;
END $$;

CREATE POLICY "classes_select_teacher" ON public.classes
  FOR SELECT USING (teacher_id = auth.uid());
CREATE POLICY "classes_select_student" ON public.classes
  FOR SELECT USING (public.is_active_class_student(id));
CREATE POLICY "classes_insert_teacher" ON public.classes
  FOR INSERT WITH CHECK (teacher_id = auth.uid());
CREATE POLICY "classes_update_teacher" ON public.classes
  FOR UPDATE USING (teacher_id = auth.uid()) WITH CHECK (teacher_id = auth.uid());
CREATE POLICY "classes_delete_teacher" ON public.classes
  FOR DELETE USING (teacher_id = auth.uid());

-- ---------- class_members ----------
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='class_members' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.class_members', p.policyname);
  END LOOP;
END $$;

CREATE POLICY "class_members_select_self" ON public.class_members
  FOR SELECT USING (student_id = auth.uid());
CREATE POLICY "class_members_select_teacher" ON public.class_members
  FOR SELECT USING (public.is_class_teacher(class_id));
CREATE POLICY "class_members_insert_teacher" ON public.class_members
  FOR INSERT WITH CHECK (public.is_class_teacher(class_id));
CREATE POLICY "class_members_update_teacher" ON public.class_members
  FOR UPDATE USING (public.is_class_teacher(class_id)) WITH CHECK (public.is_class_teacher(class_id));
CREATE POLICY "class_members_delete_teacher" ON public.class_members
  FOR DELETE USING (public.is_class_teacher(class_id));
