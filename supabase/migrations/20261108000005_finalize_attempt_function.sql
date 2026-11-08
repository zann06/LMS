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
