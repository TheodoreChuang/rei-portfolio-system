import { test as setup, expect } from '@playwright/test'
import path from 'path'
import { createTestUser, getTestSession } from './fixtures'

const authFile = path.join(__dirname, '.auth/user.json')

// Requires local Supabase: npx supabase start
setup('create test user and authenticate', async ({ context }) => {
  const { email, password } = await createTestUser()

  const session = await getTestSession(email, password)

  // Set Supabase SSR auth cookie (see CLAUDE.md for format)
  const cookieValue = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url')

  await context.addCookies([{
    name: 'sb-127-auth-token',
    value: cookieValue,
    domain: 'localhost',
    path: '/',
    httpOnly: false,
    secure: false,
    sameSite: 'Lax',
  }])

  await context.storageState({ path: authFile })
})
