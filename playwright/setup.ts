import { test as setup } from '@playwright/test'
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

  // Seed test data for the authenticated user via the API so loans.spec.ts
  // can find a property and loan account without depending on pnpm seed.
  const propRes = await context.request.post('/api/properties', {
    data: {
      address: '123 Smith St, Sydney NSW 2000',
      nickname: 'Smith St',
      startDate: '2020-01-01',
    },
  })
  if (propRes.ok()) {
    const { property } = await propRes.json()
    await context.request.post(`/api/properties/${property.id}/loans`, {
      data: {
        lender: 'Westpac',
        nickname: 'Investment loan',
        startDate: '2020-01-01',
        endDate: '2050-01-01',
      },
    })
  }

  await context.storageState({ path: authFile })
})
