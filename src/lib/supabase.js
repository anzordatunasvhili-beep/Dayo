import { createClient } from '@supabase/supabase-js'
const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY
export const isSupabaseConfigured = Boolean(url && key)
export const supabase = isSupabaseConfigured
  ? createClient(url, key, {
      auth: {
        // Student sessions must survive reloads and refresh before the short-lived
        // access token expires. Keep these explicit so deployment defaults cannot
        // accidentally turn a one-hour access token into a one-hour login.
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null
