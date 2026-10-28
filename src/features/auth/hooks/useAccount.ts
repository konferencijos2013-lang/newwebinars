import { useEffect, useState } from 'react'
import { useMatch } from 'react-router'
import { supabase } from '@/lib/supabase'
import type { Account, AccountMember } from '@/shared/database.types'

export type AccountChoice = {
  id: string
  name: string
  role: AccountMember['role']
}

type AccountState =
  | { status: 'loading'; account: null; membership: null; memberships: [] }
  | {
      status: 'ready'
      account: Account
      membership: AccountMember
      memberships: AccountChoice[]
    }
  | { status: 'empty'; account: null; membership: null; memberships: [] }
  | {
      status: 'error'
      account: null
      membership: null
      memberships: []
      error: Error
    }

const ACCOUNT_STORAGE_KEY = 'newwebinars-account'

export function useAccount() {
  const supportMatch = useMatch('/support/accounts/:accountId/*')
  const supportAccountId = supportMatch?.params.accountId
  const [state, setState] = useState<AccountState>({
    status: 'loading',
    account: null,
    membership: null,
    memberships: [],
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
          setState({
            status: 'error',
            account: null,
            membership: null,
            memberships: [],
            error,
          })
          return
        }
        setState({
          status: 'ready',
          account: data as Account,
          memberships: [],
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
          setState({
            status: 'empty',
            account: null,
            membership: null,
            memberships: [],
          })
        return
      }

      // Use .limit(1) without .single() because PostgREST returns 406 when the
      // user has no membership rows. An empty array is handled below.
      const { data, error } = await supabase
        .from('account_members')
        .select('*, accounts(*)')
        .eq('user_id', userId)
        .order('joined_at', { ascending: true })
        .limit(20)

      if (!isActive) return

      if (error) {
        console.error('[useAccount] query error', error)
        setState({
          status: 'error',
          account: null,
          membership: null,
          memberships: [],
          error,
        })
        return
      }

      const rows = data ?? []
      const preferredId = localStorage.getItem(ACCOUNT_STORAGE_KEY)
      const first =
        rows.find((row) => row.account_id === preferredId) ?? rows[0]
      if (!first) {
        setState({
          status: 'empty',
          account: null,
          membership: null,
          memberships: [],
        })
        return
      }

      setState({
        status: 'ready',
        account: first.accounts as unknown as Account,
        membership: first as unknown as AccountMember,
        memberships: rows.map((row) => ({
          id: row.account_id,
          name: (row.accounts as { name?: string } | null)?.name ?? 'Paskyra',
          role: row.role,
        })),
      })
    }

    load()

    return () => {
      isActive = false
    }
  }, [supportAccountId])

  return state
}
