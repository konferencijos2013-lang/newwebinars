import { useMatch } from 'react-router'

export type SupportView = {
  accountId: string
  basePath: string
}

export function useSupportView(): SupportView | null {
  const match = useMatch('/support/accounts/:accountId/*')
  const accountId = match?.params.accountId
  return accountId
    ? { accountId, basePath: `/support/accounts/${accountId}` }
    : null
}

export function supportPath(basePath: string | null, path: string) {
  return basePath ? `${basePath}${path}` : path
}
