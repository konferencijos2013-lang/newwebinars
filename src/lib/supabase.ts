import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// #region agent log
fetch('http://127.0.0.1:7510/ingest/98e51e74-2cb8-43d7-ae19-9d551565ede3', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '85756a' },
  body: JSON.stringify({
    sessionId: '85756a',
    id: 'log_supabase_env',
    runId: 'initial',
    hypothesisId: 'A',
    location: 'src/lib/supabase.ts:3',
    message: 'Supabase env check',
    data: {
      urlType: typeof supabaseUrl,
      urlLength: supabaseUrl?.length ?? 0,
      keyType: typeof supabaseAnonKey,
      keyLength: supabaseAnonKey?.length ?? 0,
    },
    timestamp: Date.now(),
  }),
}).catch(() => {})
// #endregion

if (typeof supabaseUrl !== 'string' || supabaseUrl.length === 0) {
  // #region agent log
  fetch('http://127.0.0.1:7510/ingest/98e51e74-2cb8-43d7-ae19-9d551565ede3', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '85756a' },
    body: JSON.stringify({
      sessionId: '85756a',
      id: 'log_supabase_missing_url',
      runId: 'initial',
      hypothesisId: 'A',
      location: 'src/lib/supabase.ts:5',
      message: 'Missing VITE_SUPABASE_URL',
      data: {},
      timestamp: Date.now(),
    }),
  }).catch(() => {})
  // #endregion
  throw new Error('Missing environment variable: VITE_SUPABASE_URL')
}

if (typeof supabaseAnonKey !== 'string' || supabaseAnonKey.length === 0) {
  // #region agent log
  fetch('http://127.0.0.1:7510/ingest/98e51e74-2cb8-43d7-ae19-9d551565ede3', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '85756a' },
    body: JSON.stringify({
      sessionId: '85756a',
      id: 'log_supabase_missing_key',
      runId: 'initial',
      hypothesisId: 'A',
      location: 'src/lib/supabase.ts:6',
      message: 'Missing VITE_SUPABASE_ANON_KEY',
      data: {},
      timestamp: Date.now(),
    }),
  }).catch(() => {})
  // #endregion
  throw new Error('Missing environment variable: VITE_SUPABASE_ANON_KEY')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
