import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Account, AccountMember } from '@/shared/database.types'

type AccountState =
  | { status: 'loading'; account: null; membership: null }
  | { status: 'ready'; account: Account; membership: AccountMember }
  | { status: 'empty'; account: null; membership: null }
  | { status: 'error'; account: null; membership: null; error: Error }

export function useAccount() {
  const [state, setState] = useState<AccountState>({
    status: 'loading',
    account: null,
    membership: null,
  })

  useEffect(() => {
    let isActive = true

    async function load() {
      const { data: sessionData } = await supabase.auth.getSession()
      const userId = sessionData.session?.user.id
      if (!userId) {
        if (isActive)
          setState({ status: 'empty', account: null, membership: null })
        return
      }

      const { data, error } = await supabase
        .from('account_members')
        .select('*, accounts(*)')
        .eq('user_id', userId)
        .order('joined_at', { ascending: true })
        .limit(1)
        .single()

      if (error) {
        if (error.code === 'PGRST116') {
          if (isActive)
            setState({ status: 'empty', account: null, membership: null })
          return
        }
        if (isActive)
          setState({ status: 'error', account: null, membership: null, error })
        return
      }

      if (isActive) {
        setState({
          status: 'ready',
          account: data.accounts as unknown as Account,
          membership: data as unknown as AccountMember,
        })
      }
    }

    load()

    return () => {
      isActive = false
    }
  }, [])

  return state
}
