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