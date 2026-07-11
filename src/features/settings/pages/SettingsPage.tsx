import { useTranslation } from 'react-i18next'
import { Card, CardTitle, CardDescription } from '@/components/ui/Card'
import { Settings } from 'lucide-react'

export function SettingsPage() {
  const { t } = useTranslation('webinars')

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="text-foreground text-2xl font-bold tracking-tight">
          {t('settings.title', 'Settings')}
        </h1>
        <p className="text-muted-foreground text-sm">
          {t('settings.subtitle', 'Workspace and profile settings')}
        </p>
      </div>

      <Card className="flex flex-col items-center justify-center py-16 text-center">
        <Settings className="text-muted-foreground mb-4 h-12 w-12" />
        <CardTitle>
          {t('settings.emptyTitle', 'Settings coming soon')}
        </CardTitle>
        <CardDescription className="mt-2 max-w-sm">
          {t(
            'settings.emptyDescription',
            'Workspace, profile and integrations will be configured here.',
          )}
        </CardDescription>
      </Card>
    </div>
  )
}
