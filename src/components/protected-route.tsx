import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { Spinner } from '@/components/ui/spinner'

export function ProtectedRoute({ children, requireTeacher }: { children: ReactNode; requireTeacher?: boolean }) {
  const { session, isTeacher, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Spinner className="size-8" />
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (requireTeacher && !isTeacher) {
    return <Navigate to="/student/dashboard" replace />
  }

  if (!requireTeacher && isTeacher) {
    return <Navigate to="/teacher/dashboard" replace />
  }

  return <>{children}</>
}
