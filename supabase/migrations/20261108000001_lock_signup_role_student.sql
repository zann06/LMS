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
