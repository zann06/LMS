/*
# Tambah Fungsi get_attempt_review & grade_essay_answer (hilang dari 002)

1. Problem
- Keduanya dipanggil aplikasi (`attempt-review-dialog.tsx` dan
  `exam-detail.tsx`) tetapi tidak pernah didefinisikan di migration mana pun
  (dulu dibuat manual di project lama dan tidak ter-commit) →
  "lihat hasil" ujian gagal dengan
  `Could not find the function public.get_attempt_review`.

2. Perilaku get_attempt_review(p_attempt_id uuid) → jsonb
- Hanya boleh dipanggil oleh siswa pemilik attempt atau guru pemilik ujian.
- `reveal_key` = true bila viewer adalah guru, ATAU ujian mengizinkan
  pembahasan (show_explanations_after_submit) DAN jendela ujian sudah berakhir
  (now() >= end_at). Kunci jawaban & pembahasan hanya ikut dalam hasil bila
  reveal_key = true — tidak pernah bocor ke siswa sebelum waktunya.
- Per item: posisi, tipe, teks, opsi, poin, jawaban siswa, is_correct,
  awarded_points, komentar guru (student_answers.teacher_feedback), serta
  kunci + pembahasan (bersyarat).
- Top-level: exam_title, status, score (total_score), max_score (jumlah poin
  soal), feedback guru dari tabel grades, reveal_key, wants_explanations, items.

3. Perilaku grade_essay_answer(p_answer_id uuid, p_points numeric, p_feedback text)
- Hanya guru pemilik ujian boleh menilai.
- Set awarded_points + teacher_feedback + graded_at pada jawaban tersebut,
  lalu menghitung ulang total via _finalize_attempt.

4. Idempotent — CREATE OR REPLACE.
*/

-- ---------- get_attempt_review ----------
CREATE OR REPLACE FUNCTION public.get_attempt_review(p_attempt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  att public.exam_attempts%rowtype;
  ex public.exams%rowtype;
  v_viewer uuid := auth.uid();
  v_is_teacher boolean;
  v_is_student boolean;
  v_reveal boolean;
  v_max numeric;
  v_feedback text;
  v_items jsonb;
BEGIN
  SELECT * INTO att FROM public.exam_attempts WHERE id = p_attempt_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Percobaan ujian tidak ditemukan' USING errcode = 'P0002';
  END IF;

  SELECT * INTO ex FROM public.exams WHERE id = att.exam_id;

  v_is_teacher := (ex.teacher_id = v_viewer);
  v_is_student := (att.student_id = v_viewer);
  IF NOT (v_is_teacher OR v_is_student) THEN
    RAISE EXCEPTION 'Tidak diizinkan melihat hasil percobaan ini' USING errcode = '42501';
  END IF;

  v_reveal := v_is_teacher
    OR (ex.show_explanations_after_submit AND now() >= ex.end_at);

  SELECT coalesce(sum((eq.question_snapshot->>'points')::numeric), 0) INTO v_max
    FROM public.exam_questions eq
   WHERE eq.exam_id = ex.id;

  SELECT g.feedback INTO v_feedback
    FROM public.grades g
   WHERE g.exam_attempt_id = att.id AND g.student_id = att.student_id
   LIMIT 1;

  SELECT jsonb_agg(item ORDER BY item->>'position') INTO v_items
    FROM (
      SELECT jsonb_build_object(
        'position', eq.position,
        'question_type', eq.question_snapshot->>'question_type',
        'question_text', eq.question_snapshot->>'question_text',
        'options', eq.question_snapshot->'options_json',
        'points', coalesce(eq.points_override, (eq.question_snapshot->>'points')::numeric),
        'student_answer', sa.answer_json,
        'is_correct', sa.is_correct,
        'awarded_points', sa.awarded_points,
        'teacher_feedback', sa.teacher_feedback,
        'correct_option_id', CASE WHEN v_reveal THEN ak.answer_key_json->>'correct_option_id' END,
        'explanation', CASE WHEN v_reveal THEN ak.explanation END
      ) AS item
      FROM public.exam_questions eq
      LEFT JOIN public.student_answers sa
        ON sa.exam_question_id = eq.id AND sa.attempt_id = att.id
      LEFT JOIN public.question_answer_keys ak
        ON ak.question_id = eq.question_id
      WHERE eq.exam_id = ex.id
    ) sub;

  RETURN jsonb_build_object(
    'exam_title', ex.title,
    'status', att.status,
    'score', coalesce(att.total_score, 0),
    'max_score', v_max,
    'feedback', v_feedback,
    'reveal_key', v_reveal,
    'wants_explanations', ex.show_explanations_after_submit,
    'items', coalesce(v_items, '[]'::jsonb)
  );
END;
$$;

-- ---------- grade_essay_answer ----------
CREATE OR REPLACE FUNCTION public.grade_essay_answer(p_answer_id uuid, p_points numeric, p_feedback text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_teacher_id uuid;
  v_attempt_id uuid;
  v_max numeric;
BEGIN
  SELECT e.teacher_id, ea.id, coalesce(eq.points_override, (eq.question_snapshot->>'points')::numeric)
    INTO v_teacher_id, v_attempt_id, v_max
    FROM public.student_answers sa
    JOIN public.exam_attempts ea ON ea.id = sa.attempt_id
    JOIN public.exams e ON e.id = ea.exam_id
    JOIN public.exam_questions eq ON eq.id = sa.exam_question_id
   WHERE sa.id = p_answer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Jawaban tidak ditemukan' USING errcode = 'P0002';
  END IF;
  IF v_teacher_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Hanya guru pemilik ujian yang bisa menilai' USING errcode = '42501';
  END IF;
  IF p_points IS NULL OR p_points < 0 OR p_points > v_max THEN
    RAISE EXCEPTION 'Nilai harus antara 0 dan %', v_max USING errcode = '22023';
  END IF;

  UPDATE public.student_answers
     SET awarded_points = p_points,
         teacher_feedback = NULLIF(p_feedback, ''),
         graded_at = now()
   WHERE id = p_answer_id;

  PERFORM public._finalize_attempt(v_attempt_id);
END;
$$;
