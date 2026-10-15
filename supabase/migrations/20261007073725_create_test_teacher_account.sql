/*
# Create Test Teacher Account

1. Purpose
- Creates a demo teacher account for testing the RuangAjar LMS.
- Inserts into auth.users, teacher_accounts, and profiles.

2. Account Credentials
- Email: guru@ruangajar.com
- Password: NOT stored in this repository. Provide it at runtime, see below.
- Full Name: Guru Demo
- Role: teacher

3. How to run
- The password is read from the session GUC `app.demo_teacher_password`.
- This migration is a NO-OP (skipped with a NOTICE) when the GUC is not set.

  In the Supabase SQL editor, run both statements in the same session:

    SET app.demo_teacher_password = 'choose-a-strong-local-password';
    -- then run the DO block below

  Or from the Supabase CLI:

    supabase db reset

4. Notes
- This is a test/demo account for development purposes only.
- Never run this against a production project.
- Never commit a real password. Rotate the account or delete it before going live.
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

  -- Check if user already exists
  SELECT id INTO v_user_id FROM auth.users WHERE email = v_email;

  IF v_user_id IS NULL THEN
    -- Create the auth user
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_user_meta_data,
      raw_app_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      email_change_token_new,
      email_change
    ) VALUES (
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
      now(),
      '',
      '',
      ''
    )
    RETURNING id INTO v_user_id;
  END IF;

  -- Insert teacher_accounts record if not exists
  INSERT INTO teacher_accounts (user_id, account_status)
  SELECT v_user_id, 'active'
  WHERE NOT EXISTS (SELECT 1 FROM teacher_accounts WHERE user_id = v_user_id);

  -- Insert profiles record if not exists
  INSERT INTO profiles (id, full_name, role)
  SELECT v_user_id, 'Guru Demo', 'teacher'
  WHERE NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_user_id);
END $$;