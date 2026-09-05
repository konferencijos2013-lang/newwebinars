import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (typeof supabaseUrl !== 'string' || supabaseUrl.length === 0) {
  throw new Error('Missing environment variable: VITE_SUPABASE_URL')
}

if (typeof supabaseAnonKey !== 'string' || supabaseAnonKey.length === 0) {
  throw new Error('Missing environment variable: VITE_SUPABASE_ANON_KEY')
}

// Cookie-backed storage helper. Cookies survive cross-site redirects better
// than localStorage / sessionStorage in some browsers (Safari, Incognito).
//
// The PKCE code verifier only needs to live for the duration of the OAuth
// round-trip, but the actual session (access/refresh token) must persist for
// the whole login — giving everything a 5 minute expiry silently logged
// users out a few minutes after sign-in.
const FIVE_MINUTES_MS = 5 * 60 * 1000
const HUNDRED_DAYS_MS = 100 * 24 * 60 * 60 * 1000

function cookieMaxAge(key: string): number {
  return key.endsWith('-code-verifier') ? FIVE_MINUTES_MS : HUNDRED_DAYS_MS
}

const cookieStorage = {
  getItem(key: string): string | null {
    const match = document.cookie.match(new RegExp('(^| )' + key + '=([^;]+)'))
    return match ? decodeURIComponent(match[2]) : null
  },
  setItem(key: string, value: string): void {
    const expires = new Date(Date.now() + cookieMaxAge(key)).toUTCString()
    document.cookie = `${key}=${encodeURIComponent(value)}; path=/; expires=${expires}; SameSite=Lax; secure`
  },
  removeItem(key: string): void {
    document.cookie = `${key}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax; secure`
  },
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    // AuthCallbackPage exchanges the code / sets the session manually. If
    // this were left on, supabase-js's own automatic URL detection races
    // against that manual handling and consumes the (single-use) PKCE code
    // first, so the page's own exchange fails with an empty/stripped URL
    // and no usable error — exactly the "no_session_or_code" symptom.
    detectSessionInUrl: false,
    storage: cookieStorage,
  },
})
