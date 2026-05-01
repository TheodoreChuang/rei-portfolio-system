import { createBrowserClient } from '@supabase/ssr'
import { env } from '@/lib/env'

export function createClient() {
  return createBrowserClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY)
}
