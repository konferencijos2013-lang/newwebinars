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
const cookieStorage = {
  getItem(key: string): string | null {
    const match = document.cookie.match(new RegExp('(^| )' + key + '=([^;]+)'))
    return match ? decodeURIComponent(match[2]) : null
  },
  setItem(key: string, value: string): void {
    // 5 minute expiry is enough for the OAuth round-trip.
    const expires = new Date(Date.now() + 5 * 60 * 1000).toUTCString()
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
    detectSessionInUrl: true,
    storage: cookieStorage,
  },
})
