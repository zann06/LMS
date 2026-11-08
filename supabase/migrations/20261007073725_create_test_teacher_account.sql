/*
# Create Test Teacher Account

1. Purpose
- Membuat akun guru demo untuk mencoba RuangAjar.
- Memasukkan auth.users (pola KOLOM MINIMAL — kolom lain mengikuti default
  schema, meniru bentuk baris buatan GoTrue), lalu melengkapi
  teacher_accounts dan profiles.

2. Account Credentials
- Email: guru@ruangajar.com
- Password: TIDAK disimpan di repo ini. Isi saat runtime, lihat di bawah.
- Full Name: Guru Demo
- Role: teacher

3. How to run
- Password dibaca dari session GUC `app.demo_teacher_password`.
- NO-OP (dilewati dengan NOTICE) bila GUC tidak di-set.

  Di Supabase SQL Editor, jalankan dalam satu sesi/tab yang sama:

    SET app.demo_teacher_password = 'password-kuat-pilihan-anda';
    -- lalu jalankan seluruh blok DO di bawah

  Alternatif tanpa SQL: Dashboard → Authentication → Add user, lalu
  jalankan SQL singkat di bagian bawah file ini (set role + teacher_accounts).

4. Security
- Tidak membuka akses publik apa pun.
- Akun demo hanya untuk development — jangan dipakai di project produksi.
- Jangan pernah commit password asli.

5. Catatan teknis
- JANGAN mengisi kolom token (`confirmation_token` dll) secara eksplisit saat
  INSERT ke auth.users — biarkan default; GoTrue (v2.19x) gagal membaca
  baris yang kolom token-nya NULL, jadi setelah INSERT semua kolom token
  di-COALESCE ke ''. Detail lihat migration 20261108000005 dan README.
*/

DO $$
DECLARE
  v_user_id uuid;
  v_email constant text := 'guru@ruangajar.com';
  v_password text := current_setting('app.demo_teacher_password', true);
BEGIN
  IF v_password IS NULL OR v_password = '' THEN
    RAISE NOTICE 'Skipped: set app.demo_teacher_password before running this migration.';
    RETURN;
  END IF;

  SELECT id INTO v_user_id FROM auth.users WHERE email = v_email;

  IF v_user_id IS NULL THEN
    -- pola minimal: sisanya mengikuti default schema (bentuk row GoTrue)
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_user_meta_data, raw_app_meta_data,
      created_at, updated_at
    )
    VALUES (
      '00000000-0000-0000-0000-000000000000',
      gen_random_uuid(),
      'authenticated',
      'authenticated',
      v_email,
      crypt(v_password, gen_salt('bf')),
      now(),
      '{"full_name": "Guru Demo", "role": "teacher"}'::jsonb,
      '{"provider": "email", "providers": ["email"]}'::jsonb,
      now(),
      now()
    )
    RETURNING id INTO v_user_id;
  ELSE
    -- akun sudah ada: pastikan password & statusnya benar
    UPDATE auth.users
       SET encrypted_password = crypt(v_password, gen_salt('bf')),
           email_confirmed_at = COALESCE(email_confirmed_at, now()),
           instance_id = COALESCE(instance_id, '00000000-0000-0000-0000-000000000000'),
           updated_at = now()
     WHERE id = v_user_id;
  END IF;

  -- kolom token WAJIB tidak-NULL (GoTrue scan error bila NULL)
  UPDATE auth.users
     SET confirmation_token = COALESCE(confirmation_token, ''),
         recovery_token = COALESCE(recovery_token, ''),
         email_change = COALESCE(email_change, ''),
         email_change_token_new = COALESCE(email_change_token_new, ''),
         email_change_token_current = COALESCE(email_change_token_current, ''),
         reauthentication_token = COALESCE(reauthentication_token, ''),
         phone_change = COALESCE(phone_change, ''),
         phone_change_token = COALESCE(phone_change_token, '')
   WHERE id = v_user_id;

  -- baris identities (dibutuhkan dashboard; kolom email di identities GENERATED)
  INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  SELECT gen_random_uuid(), v_user_id, v_user_id::text,
         jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true),
         'email', now(), now(), now()
  WHERE NOT EXISTS (SELECT 1 FROM auth.identities WHERE user_id = v_user_id AND provider = 'email');

  INSERT INTO teacher_accounts (user_id, account_status)
  SELECT v_user_id, 'active'
  WHERE NOT EXISTS (SELECT 1 FROM teacher_accounts WHERE user_id = v_user_id);

  INSERT INTO profiles (id, full_name, role)
  SELECT v_user_id, 'Guru Demo', 'teacher'
  WHERE NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_user_id);

  UPDATE profiles SET role = 'teacher' WHERE id = v_user_id AND role <> 'teacher';

  RAISE NOTICE 'Akun guru demo siap: %', v_email;
END $$;

-- Alternatif tanpa GUC (misal akun dibuat via Dashboard → Add user):
--   UPDATE public.profiles SET role = 'teacher'
--    WHERE id = (SELECT id FROM auth.users WHERE email = 'guru@ruangajar.com');
--   INSERT INTO public.teacher_accounts (user_id, account_status)
--   SELECT id, 'active' FROM auth.users WHERE email = 'guru@ruangajar.com'
--    WHERE NOT EXISTS (SELECT 1 FROM public.teacher_accounts WHERE user_id = (SELECT id FROM auth.users WHERE email = 'guru@ruangajar.com'));
