import { useState, type FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { BookOpen, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldLabel } from '@/components/ui/field'

function translateAuthError(message: string) {
  const m = message.toLowerCase()
  if (m.includes('invalid login credentials')) return 'Email atau kata sandi salah, atau akun belum terdaftar'
  if (m.includes('email not confirmed')) return 'Email belum dikonfirmasi. Konfirmasi dulu di dashboard Supabase atau lewat email'
  if (m.includes('failed to fetch') || m.includes('network')) return 'Tidak bisa terhubung ke Supabase. Cek VITE_SUPABASE_URL di file .env lalu restart npm run dev'
  if (m.includes('invalid api key') || m.includes('apikey')) return 'API key Supabase salah. Cek VITE_SUPABASE_ANON_KEY di file .env lalu restart npm run dev'
  return message
}

export function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (signInError) {
        console.error('Login error:', signInError)
        setError(translateAuthError(signInError.message))
        setLoading(false)
        return
      }

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', signInData.user.id)
        .maybeSingle()

      if (profileError) {
        console.error('Profile error:', profileError)
        setError(`Login berhasil, tapi gagal membaca profil: ${profileError.message}`)
        setLoading(false)
        return
      }

      if (!profileData) {
        setError('Login berhasil, tapi data profil tidak ditemukan. Pastikan ada baris di tabel profiles dengan id yang sama dengan user ini.')
        setLoading(false)
        return
      }

      toast.success('Berhasil masuk')
      navigate(profileData.role === 'teacher' ? '/teacher/dashboard' : '/student/dashboard')
    } catch (err) {
      console.error('Unexpected login error:', err)
      setError(err instanceof Error ? translateAuthError(err.message) : 'Terjadi kesalahan tak terduga')
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex size-14 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <BookOpen className="size-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">RuangAjar</h1>
          <p className="text-sm text-muted-foreground">Masuk untuk melanjutkan pembelajaran</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              type="email"
              placeholder="nama@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="password">Kata Sandi</FieldLabel>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </Field>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="size-4 animate-spin" />}
            Masuk
          </Button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          Lupa kata sandi? <Link to="/forgot-password" className="text-primary hover:underline">Atur ulang</Link>
        </p>
      </div>
    </div>
  )
}