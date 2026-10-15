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
