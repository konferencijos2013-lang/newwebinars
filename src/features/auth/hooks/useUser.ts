import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { AppUser } from '@/shared/types/supabase'

type UserState =
  | { status: 'loading'; user: null }
  | { status: 'authenticated'; user: AppUser }
  | { status: 'unauthenticated'; user: null }

function mapUser(
  sessionUser: {
    id: string
    email?: string | undefined
  },
  profileRole: string | null,
): AppUser {
  return {
    id: sessionUser.id,
    email: sessionUser.email ?? null,
    role: (profileRole as AppUser['role']) ?? 'guest',
  }
}

export function useUser() {
  const [state, setState] = useState<UserState>({
    status: 'loading',
    user: null,
  })

  useEffect(() => {
    let isActive = true

    async function load() {
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession()
      if (!isActive) return

      if (sessionError || !sessionData.session) {
        setState({ status: 'unauthenticated', user: null })
        return
      }

      const sessionUser = sessionData.session.user
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', sessionUser.id)
        .single()

      if (!isActive) return

      setState({
        status: 'authenticated',
        user: mapUser(sessionUser, profile?.role ?? null),
      })
    }

    load()

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isActive) return

      if (event === 'SIGNED_OUT' || !session) {
        setState({ status: 'unauthenticated', user: null })
        return
      }

      // Refetch profile role after sign-in to keep admin check accurate.
      supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single()
        .then(({ data: profile }) => {
          if (!isActive) return
          setState({
            status: 'authenticated',
            user: mapUser(session.user, profile?.role ?? null),
          })
        })
    })

    return () => {
      isActive = false
      data.subscription.unsubscribe()
    }
  }, [])

  return state
}
