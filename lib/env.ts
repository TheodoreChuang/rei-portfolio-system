function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

export const env = {
  DATABASE_URL:             requireEnv('DATABASE_URL'),
  SUPABASE_URL:             requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
  SUPABASE_PUBLISHABLE_KEY: requireEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
  LOG_LEVEL:                process.env.LOG_LEVEL ?? 'info',
} as const
