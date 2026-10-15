import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: { id: string; full_name: string; role: 'teacher' | 'student'; student_number: string | null } | null
  isTeacher: boolean
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<AuthContextValue['profile']>(null)
  const [loading, setLoading] = useState(true)
  // user yang profilnya sudah dimuat — supaya token refresh tidak memicu loading ulang
  const loadedUserId = useRef<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session) {
        loadProfile(data.session.user.id)
      } else {
        setLoading(false)
      }
    })

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      if (newSession) {
        // login baru: tahan ProtectedRoute sampai role dari profil sudah diketahui,
        // kalau tidak guru bisa sempat dilempar ke halaman siswa
        if (loadedUserId.current !== newSession.user.id) setLoading(true)
        ;(async () => { await loadProfile(newSession.user.id) })()
      } else {
        loadedUserId.current = null
        setProfile(null)
        setLoading(false)
      }
    })

    return () => { authListener.subscription.unsubscribe() }
  }, [])

  async function loadProfile(userId: string) {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, role, student_number')
      .eq('id', userId)
      .maybeSingle()

    setProfile(data as AuthContextValue['profile'])
    loadedUserId.current = userId
    setLoading(false)
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setProfile(null)
  }

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    profile,
    isTeacher: profile?.role === 'teacher',
    loading,
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
