import { Navigate, Outlet, useLocation } from 'react-router'
import { useUser } from '@/features/auth/hooks/useUser'
import { Spinner } from '@/components/ui/Spinner'

export function ProtectedRoute({ children }: { children?: React.ReactNode }) {
  const { status } = useUser()
  const location = useLocation()

  if (status === 'loading') {
    return (
      <div className="flex flex-1 items-center justify-center py-20">
        <Spinner />
      </div>
    )
  }

  if (status === 'unauthenticated') {
    const returnTo = `${location.pathname}${location.search}`
    return (
      <Navigate
        to={`/login?returnTo=${encodeURIComponent(returnTo)}`}
        state={{ from: location }}
        replace
      />
    )
  }

  return children ? <>{children}</> : <Outlet />
}
