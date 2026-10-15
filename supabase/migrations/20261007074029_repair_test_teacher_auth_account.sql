/*
# Repair Test Teacher Authentication Account

1. Purpose
- Repairs the existing demo teacher account so Supabase email/password login can query it correctly.

2. Data Changes
- Completes required auth.users defaults for the demo account.
- Adds the missing email identity in auth.identities.
- Resets the demo password to the value supplied at runtime.
- Ensures teacher_accounts and profiles are present.

3. Account
- Email: guru@ruangajar.com
- Password: NOT stored in this repository. Provide it at runtime, see below.
- Role: teacher

4. How to run
- The password is read from the session GUC `app.demo_teacher_password`.
- This migration is a NO-OP (skipped with a NOTICE) when the GUC is not set.

  In the Supabase SQL editor, run both statements in the same session:

    SET app.demo_teacher_password = 'choose-a-strong-local-password';
    -- then run the DO block below

5. Security
- No public access is added.
- The account remains an authenticated teacher account.
- Never commit a real password.
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

  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = v_email;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Test teacher account was not found';
  END IF;

  UPDATE auth.users
  SET encrypted_password = crypt(v_password, gen_salt('bf')),
      email_confirmed_at = COALESCE(email_confirmed_at, now()),
      raw_app_meta_data = COALESCE(raw_app_meta_data, '{"provider":"email","providers":["email"]}'::jsonb),
      raw_user_meta_data = COALESCE(raw_user_meta_data, '{"full_name":"Guru Demo","role":"teacher"}'::jsonb),
      is_sso_user = false,
      is_anonymous = false,
      updated_at = now()
  WHERE id = v_user_id;

  INSERT INTO auth.identities (
    provider_id,
    user_id,
    identity_data,
    provider,
    created_at,
    updated_at,
    id
  )
  SELECT
    v_user_id::text,
    v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', v_email),
    'email',
    now(),
    now(),
    gen_random_uuid()
  WHERE NOT EXISTS (
    SELECT 1 FROM auth.identities
    WHERE user_id = v_user_id AND provider = 'email'
  );

  INSERT INTO teacher_accounts (user_id, account_status)
  SELECT v_user_id, 'active'
  WHERE NOT EXISTS (SELECT 1 FROM teacher_accounts WHERE user_id = v_user_id);

  INSERT INTO profiles (id, full_name, role)
  SELECT v_user_id, 'Guru Demo', 'teacher'
  WHERE NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_user_id);
END $$;