import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { AppUser } from '@/shared/types/supabase'

type UserState =
  | { status: 'loading'; user: null }
  | { status: 'authenticated'; user: AppUser }
  | { status: 'unauthenticated'; user: null }

function mapUser(sessionUser: {
  id: string
  email?: string | undefined
}): AppUser {
  return {
    id: sessionUser.id,
    email: sessionUser.email ?? null,
    role: 'guest',
  }
}

export function useUser() {
  const [state, setState] = useState<UserState>({
    status: 'loading',
    user: null,
  })

  useEffect(() => {
    let isActive = true

    supabase.auth.getSession().then(({ data, error }) => {
      if (!isActive) return
      const session = data.session

      if (error || !session) {
        setState({ status: 'unauthenticated', user: null })
        return
      }

      setState({ status: 'authenticated', user: mapUser(session.user) })
    })

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isActive) return

      if (event === 'SIGNED_OUT' || !session) {
        setState({ status: 'unauthenticated', user: null })
        return
      }

      setState({ status: 'authenticated', user: mapUser(session.user) })
    })

    return () => {
      isActive = false
      data.subscription.unsubscribe()
    }
  }, [])

  return state
}
