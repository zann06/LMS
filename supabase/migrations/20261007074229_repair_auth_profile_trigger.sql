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
