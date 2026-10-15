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
