import { useEffect, useState } from 'react'
import { useMatch } from 'react-router'
import { supabase } from '@/lib/supabase'
import type { Account, AccountMember } from '@/shared/database.types'

type AccountState =
  | { status: 'loading'; account: null; membership: null }
  | { status: 'ready'; account: Account; membership: AccountMember }
  | { status: 'empty'; account: null; membership: null }
  | { status: 'error'; account: null; membership: null; error: Error }

export function useAccount() {
  const supportMatch = useMatch('/support/accounts/:accountId/*')
  const supportAccountId = supportMatch?.params.accountId
  const [state, setState] = useState<AccountState>({
    status: 'loading',
    account: null,
    membership: null,
  })

  useEffect(() => {
    let isActive = true

    async function load() {
      if (supportAccountId) {
        const { data, error } = await supabase
          .from('accounts')
          .select('*')
          .eq('id', supportAccountId)
          .single()
        if (!isActive) return
        if (error) {
          setState({ status: 'error', account: null, membership: null, error })
          return
        }
        setState({
          status: 'ready',
          account: data as Account,
          membership: {
            account_id: supportAccountId,
            user_id: '',
            role: 'viewer',
            joined_at: '',
          },
        })
        return
      }

      const { data: sessionData } = await supabase.auth.getSession()
      const userId = sessionData.session?.user.id
      if (!userId) {
        if (isActive)
          setState({ status: 'empty', account: null, membership: null })
        return
      }

      // Use .limit(1) without .single() because PostgREST returns 406 when the
      // user has no membership rows. An empty array is handled below.
      const { data, error } = await supabase
        .from('account_members')
        .select('*, accounts(*)')
        .eq('user_id', userId)
        .order('joined_at', { ascending: true })
        .limit(1)

      if (!isActive) return

      if (error) {
        console.error('[useAccount] query error', error)
        setState({ status: 'error', account: null, membership: null, error })
        return
      }

      const first = data?.[0]
      if (!first) {
        setState({ status: 'empty', account: null, membership: null })
        return
      }

      setState({
        status: 'ready',
        account: first.accounts as unknown as Account,
        membership: first as unknown as AccountMember,
      })
    }

    load()

    return () => {
      isActive = false
    }
  }, [supportAccountId])

  return state
}
