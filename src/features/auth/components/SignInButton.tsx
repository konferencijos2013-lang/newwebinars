import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'

export function SignInButton() {
  const { t } = useTranslation('auth')

  const handleSignIn = () => {
    // TODO: implement Supabase Google OAuth
  }

  return (
    <Button variant="outline" onClick={handleSignIn}>
      {t('signInWithGoogle')}
    </Button>
  )
}
