import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { BookOpen, Loader2, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldLabel } from '@/components/ui/field'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })

    setLoading(false)

    if (error) {
      toast.error('Gagal mengirim email. Coba lagi.')
      return
    }

    setSent(true)
    toast.success('Email atur ulang kata sandi telah dikirim')
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex size-14 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <BookOpen className="size-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Atur Ulang Kata Sandi</h1>
        </div>

        {sent ? (
          <div className="space-y-4 text-center">
            <p className="text-sm text-muted-foreground">
              Email atur ulang kata sandi telah dikirim ke <strong>{email}</strong>. Periksi kotak masuk Anda.
            </p>
            <Button variant="outline" className="w-full" asChild>
              <Link to="/login"><ArrowLeft className="size-4" /> Kembali ke Masuk</Link>
            </Button>
          </div>
        ) : (
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
              />
            </Field>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="size-4 animate-spin" />}
              Kirim Email
            </Button>
            <Button variant="ghost" className="w-full" asChild>
              <Link to="/login"><ArrowLeft className="size-4" /> Kembali</Link>
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
