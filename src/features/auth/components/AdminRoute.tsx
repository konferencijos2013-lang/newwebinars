import { Navigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useUser } from '@/features/auth/hooks/useUser'
import { Spinner } from '@/components/ui/Spinner'

export function AdminRoute({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation('common')
  const { status, user } = useUser()

  if (status === 'loading') {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  if (status === 'unauthenticated' || user?.role !== 'admin') {
    return (
      <div className="p-6">
        <div className="mx-auto max-w-md rounded-lg border border-red-200 bg-red-50 p-6 text-center text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          <h2 className="text-lg font-semibold">{t('adminRequired.title')}</h2>
          <p className="mt-2 text-sm">{t('adminRequired.description')}</p>
        </div>
        <Navigate to="/dashboard" replace />
      </div>
    )
  }

  return <>{children}</>
}
