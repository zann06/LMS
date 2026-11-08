-- ====================================================================
-- RuangAjar — Setup Database All-in-One
-- Jalankan SEKALI di Supabase SQL Editor untuk project BARU.
-- Semua statement idempoten (aman diulang). Susunan:
--   1. initial schema (tabel, RLS, trigger)
--   2. repair auth profile trigger
--   3. private answer keys
--   4. teacher tools
--   5. lock signup role ke student
--   6. fix RLS infinite recursion (classes <-> class_members)
--   7. fix RLS infinite recursion (exams <-> exam_classes)
--   8. tambah policy INSERT yang hilang (attempt, jawaban, nilai)
--   9. fungsi _finalize_attempt (dipanggil submit_exam_attempt)
-- Dihasilkan dari file di supabase/migrations/ (urutan terverifikasi).
-- ====================================================================

-- ============ 1/4: initial schema ============
/*
# RuangAjar Initial Schema

Creates complete database for the RuangAjar LMS platform including:
- User profiles with roles (teacher/student)
- Teacher account management (admin-controlled)
- Classes and class memberships
- Materials and teaching modules with class sharing
- Assignments and submissions
- Question banks and questions with private answer keys
- Exams with scheduling, attempts, and student answers
- Grades and audit logs

All tables have RLS enabled with separate policies per CRUD operation.
Teachers manage their own data only. Students access only their class data.
Answer keys are never exposed to students through RLS.
*/

-- =============================================
-- TEACHER ACCOUNTS (must exist before profile policies)
-- =============================================
CREATE TABLE IF NOT EXISTS teacher_accounts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  account_status text NOT NULL DEFAULT 'active' CHECK (account_status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE teacher_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "teacher_accounts_select_self" ON teacher_accounts;
CREATE POLICY "teacher_accounts_select_self" ON teacher_accounts FOR SELECT
TO authenticated USING (auth.uid() = user_id);

-- Only service role (migration/admin) can insert teacher_accounts

-- =============================================
-- PROFILES
-- =============================================
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  student_number text,
  avatar_url text,
  role text NOT NULL DEFAULT 'student' CHECK (role IN ('teacher', 'student')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
CREATE POLICY "profiles_select_own" ON profiles FOR SELECT
TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT
TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE
TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_delete_own" ON profiles;
CREATE POLICY "profiles_delete_own" ON profiles FOR DELETE
TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_teacher_view_all" ON profiles;
CREATE POLICY "profiles_teacher_view_all" ON profiles FOR SELECT
TO authenticated USING (
  EXISTS (SELECT 1 FROM teacher_accounts WHERE user_id = auth.uid() AND account_status = 'active')
);

-- =============================================
-- CLASSES
-- =============================================
CREATE TABLE IF NOT EXISTS classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  academic_year text NOT NULL DEFAULT '',
  description text,
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS classes_teacher_id_idx ON classes(teacher_id);

ALTER TABLE classes ENABLE ROW LEVEL SECURITY;

-- =============================================
-- CLASS MEMBERS (needed for class policies)
-- =============================================
CREATE TABLE IF NOT EXISTS class_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  membership_status text NOT NULL DEFAULT 'active' CHECK (membership_status IN ('active', 'inactive')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  UNIQUE (class_id, student_id)
);

CREATE INDEX IF NOT EXISTS class_members_class_id_idx ON class_members(class_id);
CREATE INDEX IF NOT EXISTS class_members_student_id_idx ON class_members(student_id);

ALTER TABLE class_members ENABLE ROW LEVEL SECURITY;

-- Class policies (now class_members exists)
DROP POLICY IF EXISTS "classes_teacher_select" ON classes;
CREATE POLICY "classes_teacher_select" ON classes FOR SELECT
TO authenticated USING (teacher_id = auth.uid());

DROP POLICY IF EXISTS "classes_student_select" ON classes;
CREATE POLICY "classes_student_select" ON classes FOR SELECT
TO authenticated USING (
  EXISTS (
    SELECT 1 FROM class_members
    WHERE class_members.class_id = classes.id
    AND class_members.student_id = auth.uid()
    AND class_members.membership_status = 'active'
  )
);

DROP POLICY IF EXISTS "classes_teacher_insert" ON classes;
CREATE POLICY "classes_teacher_insert" ON classes FOR INSERT
TO authenticated WITH CHECK (
  teacher_id = auth.uid()
  AND EXISTS (SELECT 1 FROM teacher_accounts WHERE user_id = auth.uid() AND account_status = 'active')
);

DROP POLICY IF EXISTS "classes_teacher_update" ON classes;
CREATE POLICY "classes_teacher_update" ON classes FOR UPDATE
TO authenticated USING (teacher_id = auth.uid()) WITH CHECK (teacher_id = auth.uid());

DROP POLICY IF EXISTS "classes_teacher_delete" ON classes;
CREATE POLICY "classes_teacher_delete" ON classes FOR DELETE
TO authenticated USING (teacher_id = auth.uid());

-- Class member policies
DROP POLICY IF EXISTS "class_members_teacher_select" ON class_members;
CREATE POLICY "class_members_teacher_select" ON class_members FOR SELECT
TO authenticated USING (
  EXISTS (SELECT 1 FROM classes WHERE classes.id = class_members.class_id AND classes.teacher_id = auth.uid())
);

DROP POLICY IF EXISTS "class_members_student_select" ON class_members;
CREATE POLICY "class_members_student_select" ON class_members FOR SELECT
TO authenticated USING (student_id = auth.uid());

DROP POLICY IF EXISTS "class_members_teacher_insert" ON class_members;
CREATE POLICY "class_members_teacher_insert" ON class_members FOR INSERT
TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM classes WHERE classes.id = class_members.class_id AND classes.teacher_id = auth.uid())
);

DROP POLICY IF EXISTS "class_members_teacher_update" ON class_members;
CREATE POLICY "class_members_teacher_update" ON class_members FOR UPDATE
TO authenticated USING (
  EXISTS (SELECT 1 FROM classes WHERE classes.id = class_members.class_id AND classes.teacher_id = auth.uid())
) WITH CHECK (
  EXISTS (SELECT 1 FROM classes WHERE classes.id = class_members.class_id AND classes.teacher_id = auth.uid())
);

DROP POLICY IF EXISTS "class_members_teacher_delete" ON class_members;
CREATE POLICY "class_members_teacher_delete" ON class_members FOR DELETE
TO authenticated USING (
  EXISTS (SELECT 1 FROM classes WHERE classes.id = class_members.class_id AND classes.teacher_id = auth.uid())
);

-- =============================================
-- MATERIALS
-- =============================================
CREATE TABLE IF NOT EXISTS materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  subject text NOT NULL DEFAULT '',
  topic text NOT NULL DEFAULT '',
  material_type text NOT NULL DEFAULT 'file' CHECK (material_type IN ('file', 'text', 'link')),
  file_path text,
  external_url text,
  text_content text,
  visibility_status text NOT NULL DEFAULT 'draft' CHECK (visibility_status IN ('draft', 'published', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS materials_teacher_id_idx ON materials(teacher_id);

-- =============================================
-- CLASS MATERIALS (many-to-many)
-- =============================================
CREATE TABLE IF NOT EXISTS class_materials (
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  PRIMARY KEY (class_id, material_id)
);

ALTER TABLE materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_materials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "materials_teacher_select" ON materials;
CREATE POLICY "materials_teacher_select" ON materials FOR SELECT
TO authenticated USING (teacher_id = auth.uid());

DROP POLICY IF EXISTS "materials_student_select" ON materials;
CREATE POLICY "materials_student_select" ON materials FOR SELECT
TO authenticated USING (
  visibility_status = 'published'
  AND EXISTS (
    SELECT 1 FROM class_materials cm
    JOIN class_members mem ON mem.class_id = cm.class_id
    WHERE cm.material_id = materials.id
    AND mem.student_id = auth.uid()
    AND mem.membership_status = 'active'
    AND EXISTS (SELECT 1 FROM classes WHERE classes.id = cm.class_id AND classes.is_archived = false)
  )
);

DROP POLICY IF EXISTS "materials_teacher_insert" ON materials;
CREATE POLICY "materials_teacher_insert" ON materials FOR INSERT
TO authenticated WITH CHECK (
  teacher_id = auth.uid()
  AND EXISTS (SELECT 1 FROM teacher_accounts WHERE user_id = auth.uid() AND account_status = 'active')
);

DROP POLICY IF EXISTS "materials_teacher_update" ON materials;
CREATE POLICY "materials_teacher_update" ON materials FOR UPDATE
TO authenticated USING (teacher_id = auth.uid()) WITH CHECK (teacher_id = auth.uid());

DROP POLICY IF EXISTS "materials_teacher_delete" ON materials;
CREATE POLICY "materials_teacher_delete" ON materials FOR DELETE
TO authenticated USING (teacher_id = auth.uid());

DROP POLICY IF EXISTS "class_materials_teacher_select" ON class_materials;
CREATE POLICY "class_materials_teacher_select" ON class_materials FOR SELECT
TO authenticated USING (
  EXISTS (SELECT 1 FROM classes WHERE classes.id = class_materials.class_id AND classes.teacher_id = auth.uid())
);

DROP POLICY IF EXISTS "class_materials_student_select" ON class_materials;
CREATE POLICY "class_materials_student_select" ON class_materials FOR SELECT
TO authenticated USING (
  EXISTS (
    SELECT 1 FROM class_members
    WHERE class_members.class_id = class_materials.class_id
    AND class_members.student_id = auth.uid()
    AND class_members.membership_status = 'active'
  )
);

DROP POLICY IF EXISTS "class_materials_teacher_insert" ON class_materials;
CREATE POLICY "class_materials_teacher_insert" ON class_materials FOR INSERT
TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM classes WHERE classes.id = class_materials.class_id AND classes.teacher_id = auth.uid())
);

DROP POLICY IF EXISTS "class_materials_teacher_delete" ON class_materials;
CREATE POLICY "class_materials_teacher_delete" ON class_materials FOR DELETE
TO authenticated USING (
  EXISTS (SELECT 1 FROM classes WHERE classes.id = class_materials.class_id AND classes.teacher_id = auth.uid())
);

-- =============================================
-- TEACHING MODULES
-- =============================================
CREATE TABLE IF NOT EXISTS teaching_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  subject text NOT NULL DEFAULT '',
  topic text NOT NULL DEFAULT '',
  learning_objectives text,
  content jsonb,
  file_path text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS class_modules (
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES teaching_modules(id) ON DELETE CASCADE,
  PRIMARY KEY (class_id, module_id)
);

ALTER TABLE teaching_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_modules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "modules_teacher_select" ON teaching_modules;
CREATE POLICY "modules_teacher_select" ON teaching_modules FOR SELECT
TO authenticated USING (teacher_id = auth.uid());

DROP POLICY IF EXISTS "modules_student_select" ON teaching_modules;
CREATE POLICY "modules_student_select" ON teaching_modules FOR SELECT
TO authenticated USING (
  status = 'published'
  AND EXISTS (
    SELECT 1 FROM class_modules cm
    JOIN class_members mem ON mem.class_id = cm.class_id
    WHERE cm.module_id = teaching_modules.id
    AND mem.student_id = auth.uid()
    AND mem.membership_status = 'active'
    AND EXISTS (SELECT 1 FROM classes WHERE classes.id = cm.class_id AND classes.is_archived = false)
  )
);

DROP POLICY IF EXISTS "modules_teacher_insert" ON teaching_modules;
CREATE POLICY "modules_teacher_insert" ON teaching_modules FOR INSERT
TO authenticated WITH CHECK (
  teacher_id = auth.uid()
  AND EXISTS (SELECT 1 FROM teacher_accounts WHERE user_id = auth.uid() AND account_status = 'active')
);

DROP POLICY IF EXISTS "modules_teacher_update" ON teaching_modules;
CREATE POLICY "modules_teacher_update" ON teaching_modules FOR UPDATE
TO authenticated USING (teacher_id = auth.uid()) WITH CHECK (teacher_id = auth.uid());

DROP POLICY IF EXISTS "modules_teacher_delete" ON teaching_modules;
CREATE POLICY "modules_teacher_delete" ON teaching_modules FOR DELETE
TO authenticated USING (teacher_id = auth.uid());

DROP POLICY IF EXISTS "class_modules_teacher_select" ON class_modules;
CREATE POLICY "class_modules_teacher_select" ON class_modules FOR SELECT
TO authenticated USING (
  EXISTS (SELECT 1 FROM classes WHERE classes.id = class_modules.class_id AND classes.teacher_id = auth.uid())
);

DROP POLICY IF EXISTS "class_modules_student_select" ON class_modules;
CREATE POLICY "class_modules_student_select" ON class_modules FOR SELECT
TO authenticated USING (
  EXISTS (
    SELECT 1 FROM class_members
    WHERE class_members.class_id = class_modules.class_id
    AND class_members.student_id = auth.uid()
    AND class_members.membership_status = 'active'
  )
);

DROP POLICY IF EXISTS "class_modules_teacher_insert" ON class_modules;
CREATE POLICY "class_modules_teacher_insert" ON class_modules FOR INSERT
TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM classes WHERE classes.id = class_modules.class_id AND classes.teacher_id = auth.uid())
);

DROP POLICY IF EXISTS "class_modules_teacher_delete" ON class_modules;
CREATE POLICY "class_modules_teacher_delete" ON class_modules FOR DELETE
TO authenticated USING (
  EXISTS (SELECT 1 FROM classes WHERE classes.id = class_modules.class_id AND classes.teacher_id = auth.uid())
);

-- =============================================
-- ASSIGNMENTS
-- =============================================
CREATE TABLE IF NOT EXISTS assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  title text NOT NULL,
  instructions text,
  attachment_path text,
  start_at timestamptz,
  due_at timestamptz,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'closed', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assignments_class_id_idx ON assignments(class_id);

CREATE TABLE IF NOT EXISTS assignment_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  submission_text text,
  file_path text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  score numeric,
  feedback text,
  graded_by uuid REFERENCES auth.users(id),
  graded_at timestamptz,
  UNIQUE (assignment_id, student_id)
);

CREATE INDEX IF NOT EXISTS submissions_assignment_id_idx ON assignment_submissions(assignment_id);

ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignment_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "assignments_teacher_select" ON assignments;
CREATE POLICY "assignments_teacher_select" ON assignments FOR SELECT
TO authenticated USING (teacher_id = auth.uid());

DROP POLICY IF EXISTS "assignments_student_select" ON assignments;
CREATE POLICY "assignments_student_select" ON assignments FOR SELECT
TO authenticated USING (
  status = 'published'
  AND EXISTS (
    SELECT 1 FROM class_members
    WHERE class_members.class_id = assignments.class_id
    AND class_members.student_id = auth.uid()
    AND class_members.membership_status = 'active'
    AND EXISTS (SELECT 1 FROM classes WHERE classes.id = assignments.class_id AND classes.is_archived = false)
  )
);

DROP POLICY IF EXISTS "assignments_teacher_insert" ON assignments;
CREATE POLICY "assignments_teacher_insert" ON assignments FOR INSERT
TO authenticated WITH CHECK (
  teacher_id = auth.uid()
  AND EXISTS (SELECT 1 FROM classes WHERE classes.id = assignments.class_id AND classes.teacher_id = auth.uid())
);

DROP POLICY IF EXISTS "assignments_teacher_update" ON assignments;
CREATE POLICY "assignments_teacher_update" ON assignments FOR UPDATE
TO authenticated USING (teacher_id = auth.uid()) WITH CHECK (teacher_id = auth.uid());

DROP POLICY IF EXISTS "assignments_teacher_delete" ON assignments;
CREATE POLICY "assignments_teacher_delete" ON assignments FOR DELETE
TO authenticated USING (teacher_id = auth.uid());

DROP POLICY IF EXISTS "submissions_teacher_select" ON assignment_submissions;
CREATE POLICY "submissions_teacher_select" ON assignment_submissions FOR SELECT
TO authenticated USING (
  EXISTS (
    SELECT 1 FROM assignments
    WHERE assignments.id = assignment_submissions.assignment_id
    AND assignments.teacher_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "submissions_student_select" ON assignment_submissions;
CREATE POLICY "submissions_student_select" ON assignment_submissions FOR SELECT
TO authenticated USING (student_id = auth.uid());

DROP POLICY IF EXISTS "submissions_student_insert" ON assignment_submissions;
CREATE POLICY "submissions_student_insert" ON assignment_submissions FOR INSERT
TO authenticated WITH CHECK (
  student_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM assignments a
    JOIN class_members cm ON cm.class_id = a.class_id
    WHERE a.id = assignment_submissions.assignment_id
    AND cm.student_id = auth.uid()
    AND cm.membership_status = 'active'
    AND a.status = 'published'
  )
);

DROP POLICY IF EXISTS "submissions_student_update" ON assignment_submissions;
CREATE POLICY "submissions_student_update" ON assignment_submissions FOR UPDATE
TO authenticated USING (student_id = auth.uid() AND score IS NULL)
WITH CHECK (student_id = auth.uid());

DROP POLICY IF EXISTS "submissions_teacher_update" ON assignment_submissions;
CREATE POLICY "submissions_teacher_update" ON assignment_submissions FOR UPDATE
TO authenticated USING (
  EXISTS (SELECT 1 FROM assignments WHERE assignments.id = assignment_submissions.assignment_id AND assignments.teacher_id = auth.uid())
) WITH CHECK (
  EXISTS (SELECT 1 FROM assignments WHERE assignments.id = assignment_submissions.assignment_id AND assignments.teacher_id = auth.uid())
);

-- =============================================
-- QUESTION BANKS & QUESTIONS
-- =============================================
CREATE TABLE IF NOT EXISTS question_banks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  subject text NOT NULL DEFAULT '',
  topic text NOT NULL DEFAULT '',
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS questions (
   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
   question_bank_id uuid NOT NULL REFERENCES question_banks(id) ON DELETE CASCADE,
   teacher_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
   question_type text NOT NULL CHECK (question_type IN ('mcq', 'essay')),
   question_text text NOT NULL,
   options_json jsonb,
   explanation text,
   points numeric NOT NULL DEFAULT 1,
   difficulty text CHECK (difficulty IN ('easy', 'medium', 'hard')),
   competency text,
   created_at timestamptz NOT NULL DEFAULT now(),
   updated_at timestamptz NOT NULL DEFAULT now()
 );

CREATE INDEX IF NOT EXISTS question_banks_teacher_id_idx ON question_banks(teacher_id);
CREATE INDEX IF NOT EXISTS questions_bank_id_idx ON questions(question_bank_id);

ALTER TABLE question_banks ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "question_banks_teacher_select" ON question_banks;
CREATE POLICY "question_banks_teacher_select" ON question_banks FOR SELECT
TO authenticated USING (teacher_id = auth.uid());

DROP POLICY IF EXISTS "question_banks_teacher_insert" ON question_banks;
CREATE POLICY "question_banks_teacher_insert" ON question_banks FOR INSERT
TO authenticated WITH CHECK (
  teacher_id = auth.uid()
  AND EXISTS (SELECT 1 FROM teacher_accounts WHERE user_id = auth.uid() AND account_status = 'active')
);

DROP POLICY IF EXISTS "question_banks_teacher_update" ON question_banks;
CREATE POLICY "question_banks_teacher_update" ON question_banks FOR UPDATE
TO authenticated USING (teacher_id = auth.uid()) WITH CHECK (teacher_id = auth.uid());

DROP POLICY IF EXISTS "question_banks_teacher_delete" ON question_banks;
CREATE POLICY "question_banks_teacher_delete" ON question_banks FOR DELETE
TO authenticated USING (teacher_id = auth.uid());

DROP POLICY IF EXISTS "questions_teacher_select" ON questions;
CREATE POLICY "questions_teacher_select" ON questions FOR SELECT
TO authenticated USING (teacher_id = auth.uid());

DROP POLICY IF EXISTS "questions_teacher_insert" ON questions;
CREATE POLICY "questions_teacher_insert" ON questions FOR INSERT
TO authenticated WITH CHECK (
  teacher_id = auth.uid()
  AND EXISTS (SELECT 1 FROM question_banks WHERE question_banks.id = questions.question_bank_id AND question_banks.teacher_id = auth.uid())
);

DROP POLICY IF EXISTS "questions_teacher_update" ON questions;
CREATE POLICY "questions_teacher_update" ON questions FOR UPDATE
TO authenticated USING (teacher_id = auth.uid()) WITH CHECK (teacher_id = auth.uid());

DROP POLICY IF EXISTS "questions_teacher_delete" ON questions;
CREATE POLICY "questions_teacher_delete" ON questions FOR DELETE
TO authenticated USING (teacher_id = auth.uid());

-- =============================================
-- EXAMS
-- =============================================
CREATE TABLE IF NOT EXISTS exams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  instructions text,
  duration_minutes integer NOT NULL DEFAULT 60,
  start_at timestamptz,
  end_at timestamptz,
  max_attempts integer NOT NULL DEFAULT 1,
  shuffle_questions boolean NOT NULL DEFAULT false,
  shuffle_options boolean NOT NULL DEFAULT false,
  show_score_after_submit boolean NOT NULL DEFAULT false,
  show_explanations_after_submit boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'published', 'closed', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS exam_classes (
  exam_id uuid NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  PRIMARY KEY (exam_id, class_id)
);

CREATE TABLE IF NOT EXISTS exam_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
  position integer NOT NULL DEFAULT 0,
  points_override numeric,
  question_snapshot jsonb NOT NULL DEFAULT '{}',
  UNIQUE (exam_id, question_id)
);

CREATE TABLE IF NOT EXISTS exam_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  student_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  attempt_number integer NOT NULL DEFAULT 1,
  started_at timestamptz NOT NULL DEFAULT now(),
  deadline_at timestamptz,
  submitted_at timestamptz,
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'submitted', 'awaiting_grading', 'graded', 'invalidated')),
  objective_score numeric,
  essay_score numeric,
  total_score numeric,
  graded_at timestamptz,
  UNIQUE (exam_id, student_id, attempt_number)
);

CREATE TABLE IF NOT EXISTS student_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
  exam_question_id uuid NOT NULL REFERENCES exam_questions(id) ON DELETE CASCADE,
  answer_json jsonb NOT NULL DEFAULT '{}',
  is_correct boolean,
  awarded_points numeric,
  teacher_feedback text,
  graded_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (attempt_id, exam_question_id)
);

CREATE INDEX IF NOT EXISTS exams_teacher_id_idx ON exams(teacher_id);
CREATE INDEX IF NOT EXISTS exam_questions_exam_id_idx ON exam_questions(exam_id);
CREATE INDEX IF NOT EXISTS exam_attempts_exam_id_idx ON exam_attempts(exam_id);
CREATE INDEX IF NOT EXISTS exam_attempts_student_id_idx ON exam_attempts(student_id);
CREATE INDEX IF NOT EXISTS student_answers_attempt_id_idx ON student_answers(attempt_id);

ALTER TABLE exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_answers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "exams_teacher_select" ON exams;
CREATE POLICY "exams_teacher_select" ON exams FOR SELECT
TO authenticated USING (teacher_id = auth.uid());

DROP POLICY IF EXISTS "exams_student_select" ON exams;
CREATE POLICY "exams_student_select" ON exams FOR SELECT
TO authenticated USING (
  status IN ('published', 'closed')
  AND EXISTS (
    SELECT 1 FROM exam_classes ec
    JOIN class_members cm ON cm.class_id = ec.class_id
    WHERE ec.exam_id = exams.id
    AND cm.student_id = auth.uid()
    AND cm.membership_status = 'active'
    AND EXISTS (SELECT 1 FROM classes WHERE classes.id = ec.class_id AND classes.is_archived = false)
  )
);

DROP POLICY IF EXISTS "exams_teacher_insert" ON exams;
CREATE POLICY "exams_teacher_insert" ON exams FOR INSERT
TO authenticated WITH CHECK (
  teacher_id = auth.uid()
  AND EXISTS (SELECT 1 FROM teacher_accounts WHERE user_id = auth.uid() AND account_status = 'active')
);

DROP POLICY IF EXISTS "exams_teacher_update" ON exams;
CREATE POLICY "exams_teacher_update" ON exams FOR UPDATE
TO authenticated USING (teacher_id = auth.uid()) WITH CHECK (teacher_id = auth.uid());

DROP POLICY IF EXISTS "exams_teacher_delete" ON exams;
CREATE POLICY "exams_teacher_delete" ON exams FOR DELETE
TO authenticated USING (teacher_id = auth.uid());

DROP POLICY IF EXISTS "exam_classes_teacher_select" ON exam_classes;
CREATE POLICY "exam_classes_teacher_select" ON exam_classes FOR SELECT
TO authenticated USING (
  EXISTS (SELECT 1 FROM exams WHERE exams.id = exam_classes.exam_id AND exams.teacher_id = auth.uid())
);

DROP POLICY IF EXISTS "exam_classes_student_select" ON exam_classes;
CREATE POLICY "exam_classes_student_select" ON exam_classes FOR SELECT
TO authenticated USING (
  EXISTS (
    SELECT 1 FROM class_members
    WHERE class_members.class_id = exam_classes.class_id
    AND class_members.student_id = auth.uid()
    AND class_members.membership_status = 'active'
  )
);

DROP POLICY IF EXISTS "exam_classes_teacher_insert" ON exam_classes;
CREATE POLICY "exam_classes_teacher_insert" ON exam_classes FOR INSERT
TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM exams WHERE exams.id = exam_classes.exam_id AND exams.teacher_id = auth.uid())
);

DROP POLICY IF EXISTS "exam_classes_teacher_delete" ON exam_classes;
CREATE POLICY "exam_classes_teacher_delete" ON exam_classes FOR DELETE
TO authenticated USING (
  EXISTS (SELECT 1 FROM exams WHERE exams.id = exam_classes.exam_id AND exams.teacher_id = auth.uid())
);

DROP POLICY IF EXISTS "exam_questions_teacher_select" ON exam_questions;
CREATE POLICY "exam_questions_teacher_select" ON exam_questions FOR SELECT
TO authenticated USING (
  EXISTS (SELECT 1 FROM exams WHERE exams.id = exam_questions.exam_id AND exams.teacher_id = auth.uid())
);

DROP POLICY IF EXISTS "exam_questions_student_select" ON exam_questions;
CREATE POLICY "exam_questions_student_select" ON exam_questions FOR SELECT
TO authenticated USING (
  EXISTS (
    SELECT 1 FROM exams e
    JOIN exam_classes ec ON ec.exam_id = e.id
    JOIN class_members cm ON cm.class_id = ec.class_id
    WHERE e.id = exam_questions.exam_id
    AND e.status IN ('published', 'closed')
    AND cm.student_id = auth.uid()
    AND cm.membership_status = 'active'
    AND EXISTS (SELECT 1 FROM classes WHERE classes.id = ec.class_id AND classes.is_archived = false)
  )
);

DROP POLICY IF EXISTS "exam_questions_teacher_insert" ON exam_questions;
CREATE POLICY "exam_questions_teacher_insert" ON exam_questions FOR INSERT
TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM exams WHERE exams.id = exam_questions.exam_id AND exams.teacher_id = auth.uid())
);

DROP POLICY IF EXISTS "exam_questions_teacher_update" ON exam_questions;
CREATE POLICY "exam_questions_teacher_update" ON exam_questions FOR UPDATE
TO authenticated USING (
  EXISTS (SELECT 1 FROM exams WHERE exams.id = exam_questions.exam_id AND exams.teacher_id = auth.uid())
) WITH CHECK (
  EXISTS (SELECT 1 FROM exams WHERE exams.id = exam_questions.exam_id AND exams.teacher_id = auth.uid())
);

DROP POLICY IF EXISTS "exam_questions_teacher_delete" ON exam_questions;
CREATE POLICY "exam_questions_teacher_delete" ON exam_questions FOR DELETE
TO authenticated USING (
  EXISTS (SELECT 1 FROM exams WHERE exams.id = exam_questions.exam_id AND exams.teacher_id = auth.uid())
);

DROP POLICY IF EXISTS "exam_attempts_teacher_select" ON exam_attempts;
CREATE POLICY "exam_attempts_teacher_select" ON exam_attempts FOR SELECT
TO authenticated USING (
  EXISTS (SELECT 1 FROM exams WHERE exams.id = exam_attempts.exam_id AND exams.teacher_id = auth.uid())
);

DROP POLICY IF EXISTS "exam_attempts_student_select" ON exam_attempts;
CREATE POLICY "exam_attempts_student_select" ON exam_attempts FOR SELECT
TO authenticated USING (student_id = auth.uid());

DROP POLICY IF EXISTS "exam_attempts_student_insert" ON exam_attempts;
CREATE POLICY "exam_attempts_student_insert" ON exam_attempts FOR INSERT
TO authenticated WITH CHECK (
  student_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM exams e
    JOIN exam_classes ec ON ec.exam_id = e.id
    JOIN class_members cm ON cm.class_id = ec.class_id
    WHERE e.id = exam_attempts.exam_id
    AND cm.student_id = auth.uid()
    AND cm.membership_status = 'active'
    AND e.status = 'published'
  )
);

DROP POLICY IF EXISTS "exam_attempts_student_update" ON exam_attempts;
CREATE POLICY "exam_attempts_student_update" ON exam_attempts FOR UPDATE
TO authenticated USING (student_id = auth.uid() AND status = 'in_progress')
WITH CHECK (student_id = auth.uid());

DROP POLICY IF EXISTS "exam_attempts_teacher_update" ON exam_attempts;
CREATE POLICY "exam_attempts_teacher_update" ON exam_attempts FOR UPDATE
TO authenticated USING (
  EXISTS (SELECT 1 FROM exams WHERE exams.id = exam_attempts.exam_id AND exams.teacher_id = auth.uid())
) WITH CHECK (
  EXISTS (SELECT 1 FROM exams WHERE exams.id = exam_attempts.exam_id AND exams.teacher_id = auth.uid())
);

DROP POLICY IF EXISTS "student_answers_teacher_select" ON student_answers;
CREATE POLICY "student_answers_teacher_select" ON student_answers FOR SELECT
TO authenticated USING (
  EXISTS (
    SELECT 1 FROM exam_attempts ea
    JOIN exams e ON e.id = ea.exam_id
    WHERE ea.id = student_answers.attempt_id
    AND e.teacher_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "student_answers_student_select" ON student_answers;
CREATE POLICY "student_answers_student_select" ON student_answers FOR SELECT
TO authenticated USING (
  EXISTS (
    SELECT 1 FROM exam_attempts
    WHERE exam_attempts.id = student_answers.attempt_id
    AND exam_attempts.student_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "student_answers_student_insert" ON student_answers;
CREATE POLICY "student_answers_student_insert" ON student_answers FOR INSERT
TO authenticated WITH CHECK (
  EXISTS (
    SELECT 1 FROM exam_attempts
    WHERE exam_attempts.id = student_answers.attempt_id
    AND exam_attempts.student_id = auth.uid()
    AND exam_attempts.status = 'in_progress'
  )
);

DROP POLICY IF EXISTS "student_answers_student_update" ON student_answers;
CREATE POLICY "student_answers_student_update" ON student_answers FOR UPDATE
TO authenticated USING (
  EXISTS (
    SELECT 1 FROM exam_attempts
    WHERE exam_attempts.id = student_answers.attempt_id
    AND exam_attempts.student_id = auth.uid()
    AND exam_attempts.status = 'in_progress'
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM exam_attempts
    WHERE exam_attempts.id = student_answers.attempt_id
    AND exam_attempts.student_id = auth.uid()
    AND exam_attempts.status = 'in_progress'
  )
);

DROP POLICY IF EXISTS "student_answers_teacher_update" ON student_answers;
CREATE POLICY "student_answers_teacher_update" ON student_answers FOR UPDATE
TO authenticated USING (
  EXISTS (
    SELECT 1 FROM exam_attempts ea
    JOIN exams e ON e.id = ea.exam_id
    WHERE ea.id = student_answers.attempt_id
    AND e.teacher_id = auth.uid()
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM exam_attempts ea
    JOIN exams e ON e.id = ea.exam_id
    WHERE ea.id = student_answers.attempt_id
    AND e.teacher_id = auth.uid()
  )
);

-- =============================================
-- GRADES
-- =============================================
CREATE TABLE IF NOT EXISTS grades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  exam_attempt_id uuid REFERENCES exam_attempts(id) ON DELETE SET NULL,
  assignment_submission_id uuid REFERENCES assignment_submissions(id) ON DELETE SET NULL,
  score numeric NOT NULL,
  max_score numeric NOT NULL,
  feedback text,
  graded_by uuid NOT NULL REFERENCES auth.users(id),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS grades_student_id_idx ON grades(student_id);
CREATE INDEX IF NOT EXISTS grades_class_id_idx ON grades(class_id);

ALTER TABLE grades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "grades_teacher_select" ON grades;
CREATE POLICY "grades_teacher_select" ON grades FOR SELECT
TO authenticated USING (
  EXISTS (SELECT 1 FROM classes WHERE classes.id = grades.class_id AND classes.teacher_id = auth.uid())
);

DROP POLICY IF EXISTS "grades_student_select" ON grades;
CREATE POLICY "grades_student_select" ON grades FOR SELECT
TO authenticated USING (
  student_id = auth.uid() AND published_at IS NOT NULL
);

DROP POLICY IF EXISTS "grades_teacher_insert" ON grades;
CREATE POLICY "grades_teacher_insert" ON grades FOR INSERT
TO authenticated WITH CHECK (
  graded_by = auth.uid()
  AND EXISTS (SELECT 1 FROM classes WHERE classes.id = grades.class_id AND classes.teacher_id = auth.uid())
);

DROP POLICY IF EXISTS "grades_teacher_update" ON grades;
CREATE POLICY "grades_teacher_update" ON grades FOR UPDATE
TO authenticated USING (
  EXISTS (SELECT 1 FROM classes WHERE classes.id = grades.class_id AND classes.teacher_id = auth.uid())
) WITH CHECK (
  EXISTS (SELECT 1 FROM classes WHERE classes.id = grades.class_id AND classes.teacher_id = auth.uid())
);

DROP POLICY IF EXISTS "grades_teacher_delete" ON grades;
CREATE POLICY "grades_teacher_delete" ON grades FOR DELETE
TO authenticated USING (
  EXISTS (SELECT 1 FROM classes WHERE classes.id = grades.class_id AND classes.teacher_id = auth.uid())
);

-- =============================================
-- AUDIT LOGS
-- =============================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  metadata_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs(created_at DESC);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_logs_teacher_select" ON audit_logs;
CREATE POLICY "audit_logs_teacher_select" ON audit_logs FOR SELECT
TO authenticated USING (
  EXISTS (SELECT 1 FROM teacher_accounts WHERE user_id = auth.uid() AND account_status = 'active')
);

DROP POLICY IF EXISTS "audit_logs_insert" ON audit_logs;
CREATE POLICY "audit_logs_insert" ON audit_logs FOR INSERT
TO authenticated WITH CHECK (actor_id = auth.uid());

-- =============================================
-- AUTO-UPDATE updated_at TRIGGER
-- =============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS profiles_updated_at ON profiles;
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS classes_updated_at ON classes;
CREATE TRIGGER classes_updated_at BEFORE UPDATE ON classes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS materials_updated_at ON materials;
CREATE TRIGGER materials_updated_at BEFORE UPDATE ON materials
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS teaching_modules_updated_at ON teaching_modules;
CREATE TRIGGER teaching_modules_updated_at BEFORE UPDATE ON teaching_modules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS assignments_updated_at ON assignments;
CREATE TRIGGER assignments_updated_at BEFORE UPDATE ON assignments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS question_banks_updated_at ON question_banks;
CREATE TRIGGER question_banks_updated_at BEFORE UPDATE ON question_banks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS questions_updated_at ON questions;
CREATE TRIGGER questions_updated_at BEFORE UPDATE ON questions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS exams_updated_at ON exams;
CREATE TRIGGER exams_updated_at BEFORE UPDATE ON exams
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS grades_updated_at ON grades;
CREATE TRIGGER grades_updated_at BEFORE UPDATE ON grades
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- =============================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'student')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============ 2/4: repair auth profile trigger ============
/*
# Repair New User Profile Trigger

1. Purpose
- Fixes the automatic profile creation used during email/password signup.

2. Function Changes
- Uses the fully qualified public.profiles table.
- Sets a fixed search path so authentication cannot fail because of schema resolution.
- Keeps the function limited to the auth.users trigger flow.

3. Security Changes
- Removes direct RPC execution for anonymous and authenticated users.
- The function remains available to its database trigger through SECURITY DEFINER.
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    CASE
      WHEN NEW.raw_user_meta_data->>'role' = 'teacher' THEN 'teacher'
      ELSE 'student'
    END
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- ============ 3/4: private answer keys ============
/*
# RuangAjar — Private Answer Keys Migration

Splits `answer_key_json` and `rubric_json` out of the `questions` table
into a separate `question_answer_keys` table so that Row Level Security
policies can be audited independently.

Only teachers who own the question bank and the trusted grading
function may read this table. Students never get access.
*/

-- =============================================
-- PRIVATE ANSWER KEYS
-- =============================================
CREATE TABLE IF NOT EXISTS question_answer_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  answer_key_json jsonb NOT NULL,
  rubric_json jsonb,
  explanation text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_id)
);

CREATE INDEX IF NOT EXISTS question_answer_keys_question_id_idx ON question_answer_keys(question_id);
CREATE INDEX IF NOT EXISTS question_answer_keys_teacher_id_idx ON question_answer_keys(teacher_id);

ALTER TABLE question_answer_keys ENABLE ROW LEVEL SECURITY;

-- Teacher can only read answer keys for their own questions
DROP POLICY IF EXISTS "answer_keys_teacher_select" ON question_answer_keys;
CREATE POLICY "answer_keys_teacher_select" ON question_answer_keys FOR SELECT
TO authenticated USING (
  teacher_id = auth.uid()
  AND EXISTS (SELECT 1 FROM teacher_accounts WHERE user_id = auth.uid() AND account_status = 'active')
);

-- Only teacher who owns the question may insert/update
DROP POLICY IF EXISTS "answer_keys_teacher_insert" ON question_answer_keys;
CREATE POLICY "answer_keys_teacher_insert" ON question_answer_keys FOR INSERT
TO authenticated WITH CHECK (
  teacher_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM questions
    WHERE questions.id = question_answer_keys.question_id
    AND questions.teacher_id = auth.uid()
  )
  AND EXISTS (SELECT 1 FROM teacher_accounts WHERE user_id = auth.uid() AND account_status = 'active')
);

DROP POLICY IF EXISTS "answer_keys_teacher_update" ON question_answer_keys;
CREATE POLICY "answer_keys_teacher_update" ON question_answer_keys FOR UPDATE
TO authenticated USING (
  teacher_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM questions
    WHERE questions.id = question_answer_keys.question_id
    AND questions.teacher_id = auth.uid()
  )
) WITH CHECK (
  teacher_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM questions
    WHERE questions.id = question_answer_keys.question_id
    AND questions.teacher_id = auth.uid()
  )
);

-- No student or anonymous access at all
-- (Default deny is sufficient; no SELECT policy for students)

-- =============================================
-- TRIGGER
-- =============================================
DROP TRIGGER IF EXISTS question_answer_keys_updated_at ON question_answer_keys;
CREATE TRIGGER question_answer_keys_updated_at BEFORE UPDATE ON question_answer_keys
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
-- ============ 4/4: teacher tools ============
-- RuangAjar — alat guru (jalankan SETELAH 001_exam_grading.sql). Aman dijalankan ulang.
--  - materials.references_json  : daftar sumber/referensi (judul + URL) untuk bahan ajar
--  - assignments.max_score      : nilai maksimum tugas (default 100)
--  - teacher_close_attempts     : guru mengumpulkan paksa ujian yang kedaluwarsa (siswa menutup tab)
--  - publish_exam_grades        : guru menerbitkan/menarik nilai ujian ke siswa
--  - grade_assignment_submission: nilai tugas + otomatis masuk tabel grades

begin;

alter table public.materials   add column if not exists references_json jsonb   not null default '[]'::jsonb;
alter table public.assignments add column if not exists max_score       numeric not null default 100;

create unique index if not exists grades_assignment_submission_uidx
  on public.grades (assignment_submission_id)
  where assignment_submission_id is not null;

-- Inti pengumpulan ujian (dipakai siswa & guru). Tidak mengecek siapa pemanggilnya.
create or replace function public._submit_attempt_core(p_attempt_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exam_id uuid;
begin
  select exam_id into v_exam_id from exam_attempts where id = p_attempt_id and status = 'in_progress';
  if not found then return; end if;

  insert into student_answers (attempt_id, exam_question_id, answer_json)
  select p_attempt_id, eq.id, 'null'::jsonb
  from exam_questions eq
  where eq.exam_id = v_exam_id
  on conflict (attempt_id, exam_question_id) do nothing;

  update student_answers sa
     set is_correct     = coalesce((sa.answer_json #>> '{}') = ak.answer_key_json->>'correct_option_id', false),
         awarded_points = case
                            when coalesce((sa.answer_json #>> '{}') = ak.answer_key_json->>'correct_option_id', false)
                            then coalesce(eq.points_override, (eq.question_snapshot->>'points')::numeric)
                            else 0
                          end,
         graded_at      = now()
    from exam_questions eq
    left join question_answer_keys ak on ak.question_id = eq.question_id
   where sa.attempt_id = p_attempt_id
     and sa.exam_question_id = eq.id
     and eq.question_snapshot->>'question_type' = 'mcq';

  update student_answers sa
     set awarded_points = 0,
         graded_at      = now()
    from exam_questions eq
   where sa.attempt_id = p_attempt_id
     and sa.exam_question_id = eq.id
     and eq.question_snapshot->>'question_type' = 'essay'
     and sa.awarded_points is null
     and btrim(coalesce(sa.answer_json #>> '{}', '')) = '';

  update exam_attempts
     set status = 'awaiting_grading', submitted_at = now()
   where id = p_attempt_id;

  perform public._finalize_attempt(p_attempt_id);
end;
$$;

-- Siswa mengumpulkan ujian (tanda tangan sama seperti di 001)
create or replace function public.submit_exam_attempt(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_att exam_attempts%rowtype;
begin
  select * into v_att from exam_attempts where id = p_attempt_id for update;

  if not found or v_att.student_id is distinct from auth.uid() then
    raise exception 'Percobaan ujian tidak ditemukan' using errcode = 'P0002';
  end if;

  if v_att.status <> 'in_progress' then
    return jsonb_build_object('status', v_att.status, 'total_score', v_att.total_score, 'already_submitted', true);
  end if;

  perform public._submit_attempt_core(p_attempt_id);

  select * into v_att from exam_attempts where id = p_attempt_id;
  return jsonb_build_object('status', v_att.status, 'total_score', v_att.total_score, 'already_submitted', false);
end;
$$;

-- Guru mengumpulkan paksa percobaan yang masih in_progress.
-- p_only_expired = true  : hanya yang lewat tenggat / ujian sudah ditutup / lewat jam selesai
-- p_only_expired = false : semua percobaan yang masih berjalan
create or replace function public.teacher_close_attempts(p_exam_id uuid, p_only_expired boolean default true)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_teacher uuid;
  v_status  text;
  v_end     timestamptz;
  v_id      uuid;
  v_n       int := 0;
begin
  select teacher_id, status, end_at into v_teacher, v_status, v_end from exams where id = p_exam_id;
  if not found or v_teacher is distinct from auth.uid() then
    raise exception 'Tidak berwenang atas ujian ini' using errcode = '42501';
  end if;

  for v_id in
    select a.id from exam_attempts a
    where a.exam_id = p_exam_id
      and a.status = 'in_progress'
      and (
        not p_only_expired
        or (a.deadline_at is not null and a.deadline_at < now())
        or v_status in ('closed', 'archived')
        or (v_end is not null and v_end < now())
      )
  loop
    perform public._submit_attempt_core(v_id);
    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$$;

-- Guru menerbitkan (true) atau menarik (false) nilai ujian dari siswa
create or replace function public.publish_exam_grades(p_exam_id uuid, p_publish boolean default true)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_teacher uuid;
  v_n int;
begin
  select teacher_id into v_teacher from exams where id = p_exam_id;
  if not found or v_teacher is distinct from auth.uid() then
    raise exception 'Tidak berwenang atas ujian ini' using errcode = '42501';
  end if;

  update grades g
     set published_at = case when p_publish then coalesce(g.published_at, now()) else null end,
         updated_at   = now()
    from exam_attempts a
   where g.exam_attempt_id = a.id and a.exam_id = p_exam_id;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Guru menilai tugas: nilai dibatasi 0..max_score tugas, lalu otomatis tercatat di tabel grades
create or replace function public.grade_assignment_submission(
  p_submission_id uuid,
  p_score         numeric,
  p_feedback      text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student uuid;
  v_class   uuid;
  v_teacher uuid;
  v_max     numeric;
begin
  select s.student_id, a.class_id, a.teacher_id, a.max_score
    into v_student, v_class, v_teacher, v_max
  from assignment_submissions s
  join assignments a on a.id = s.assignment_id
  where s.id = p_submission_id;

  if not found or v_teacher is distinct from auth.uid() then
    raise exception 'Tidak berwenang menilai pengumpulan ini' using errcode = '42501';
  end if;
  if p_score is null or p_score < 0 or p_score > v_max then
    raise exception 'Nilai harus antara 0 dan %', v_max using errcode = '22003';
  end if;

  update assignment_submissions
     set score = p_score,
         feedback = nullif(btrim(coalesce(p_feedback, '')), ''),
         graded_by = auth.uid(),
         graded_at = now()
   where id = p_submission_id;

  insert into grades (student_id, class_id, assignment_submission_id, score, max_score, feedback, graded_by, published_at)
  values (v_student, v_class, p_submission_id, p_score, v_max, nullif(btrim(coalesce(p_feedback, '')), ''), auth.uid(), now())
  on conflict (assignment_submission_id) where assignment_submission_id is not null
  do update set score = excluded.score, max_score = excluded.max_score, feedback = excluded.feedback,
                graded_by = excluded.graded_by, updated_at = now();

  return jsonb_build_object('score', p_score, 'max_score', v_max);
end;
$$;

revoke all on function public._submit_attempt_core(uuid)                    from public, anon, authenticated;
revoke all on function public.submit_exam_attempt(uuid)                     from public, anon;
revoke all on function public.teacher_close_attempts(uuid, boolean)         from public, anon;
revoke all on function public.publish_exam_grades(uuid, boolean)            from public, anon;
revoke all on function public.grade_assignment_submission(uuid, numeric, text) from public, anon;
grant execute on function public.submit_exam_attempt(uuid)                     to authenticated;
grant execute on function public.teacher_close_attempts(uuid, boolean)         to authenticated;
grant execute on function public.publish_exam_grades(uuid, boolean)            to authenticated;
grant execute on function public.grade_assignment_submission(uuid, numeric, text) to authenticated;

commit;

-- ===== tambahan: masukkan akun siswa yang SUDAH ADA ke kelas (lewat email) =====
begin;

create or replace function public.add_student_to_class_by_email(p_class_id uuid, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_teacher uuid;
  v_uid     uuid;
  v_name    text;
begin
  select teacher_id into v_teacher from classes where id = p_class_id;
  if not found or v_teacher is distinct from auth.uid() then
    raise exception 'Tidak berwenang atas kelas ini' using errcode = '42501';
  end if;

  select u.id into v_uid from auth.users u where lower(u.email) = lower(btrim(p_email));
  if v_uid is null then
    raise exception 'Email belum terdaftar' using errcode = 'P0002';
  end if;

  select full_name into v_name from profiles where id = v_uid and role = 'student';
  if not found then
    raise exception 'Akun ini bukan akun siswa' using errcode = '22023';
  end if;

  if exists (select 1 from class_members where class_id = p_class_id and student_id = v_uid) then
    update class_members set membership_status = 'active' where class_id = p_class_id and student_id = v_uid;
  else
    insert into class_members (class_id, student_id) values (p_class_id, v_uid);
  end if;

  return jsonb_build_object('student_id', v_uid, 'full_name', v_name);
end;
$$;

revoke all on function public.add_student_to_class_by_email(uuid, text) from public, anon;
grant execute on function public.add_student_to_class_by_email(uuid, text) to authenticated;

commit;

-- ============ 5/5: lock signup role ke student ============
/*
# Lock Signup Role to Student

1. Purpose
- Semua pendaftaran baru lewat API publik (anon key) selalu ber-role `student`.
- Sebelumnya, siapa pun bisa mengirim metadata `role: 'teacher'` saat signup dan
  langsung mendapat akses guru — celah privilege escalation di instance publik.

2. Cara membuat akun guru setelah migration ini
- Lewat Supabase Dashboard (Authentication → Add user), lalu jalankan SQL:
    UPDATE public.profiles SET role = 'teacher' WHERE id = '<user-id>';
- Atau lewat migration akun demo di folder migrations (memasukkan user langsung
  via SQL, tidak lewat trigger signup).

3. Idempotent
- CREATE OR REPLACE FUNCTION — aman dijalankan ulang.
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    'student'
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- ============ 6/6: fix RLS infinite recursion ============
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

-- ============ 7/7: fix RLS infinite recursion (exams) ============
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

-- ============ 8/8: tambah policy INSERT yang hilang ============
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

-- ============ 9/9: fungsi _finalize_attempt (hilang dari 002) ============
/*
# Tambah Fungsi _finalize_attempt (hilang dari migration 002)

1. Problem
- `submit_exam_attempt()` (002_teacher_tools.sql) memanggil
  `public._finalize_attempt(p_attempt_id)`, tetapi fungsinya tidak pernah
  didefinisikan di migration mana pun → submit ujian gagal dengan
  `42883 function public._finalize_attempt(uuid) does not exist`.
  (Fungsi ini ternyata pernah dibuat manual di project lama dan tidak ikut
  ter-commit.)

2. Perilaku
- Merangkum hasil penilaian `_submit_attempt_core`:
    objective_score = jumlah awarded_points untuk soal PG (sudah dinilai core)
    essay_score     = jumlah awarded_points esai yang sudah dinilai guru
    status          = 'awaiting_grading' bila masih ada esai belum dinilai,
                      selain itu 'graded' + graded_at
    total_score     = objective_score + essay_score

3. Fungsi internal (dipanggil submit_exam_attempt, SECURITY DEFINER).
  Idempotent — CREATE OR REPLACE.
*/

CREATE OR REPLACE FUNCTION public._finalize_attempt(p_attempt_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_obj numeric;
  v_essay numeric;
  v_ungraded integer;
BEGIN
  SELECT coalesce(sum(sa.awarded_points), 0) INTO v_obj
    FROM public.student_answers sa
    JOIN public.exam_questions eq ON eq.id = sa.exam_question_id
   WHERE sa.attempt_id = p_attempt_id
     AND eq.question_snapshot->>'question_type' = 'mcq';

  SELECT coalesce(sum(sa.awarded_points), 0) INTO v_essay
    FROM public.student_answers sa
    JOIN public.exam_questions eq ON eq.id = sa.exam_question_id
   WHERE sa.attempt_id = p_attempt_id
     AND eq.question_snapshot->>'question_type' = 'essay'
     AND sa.awarded_points IS NOT NULL;

  SELECT count(*) INTO v_ungraded
    FROM public.student_answers sa
    JOIN public.exam_questions eq ON eq.id = sa.exam_question_id
   WHERE sa.attempt_id = p_attempt_id
     AND eq.question_snapshot->>'question_type' = 'essay'
     AND sa.awarded_points IS NULL;

  UPDATE public.exam_attempts
     SET objective_score = v_obj,
         essay_score = v_essay,
         total_score = v_obj + v_essay,
         status = CASE WHEN v_ungraded > 0 THEN 'awaiting_grading' ELSE 'graded' END,
         graded_at = CASE WHEN v_ungraded > 0 THEN NULL ELSE now() END
   WHERE id = p_attempt_id;
END;
$$;
