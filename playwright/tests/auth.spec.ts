import { test, expect } from '@playwright/test'
import { createTestUser, deleteTestUser, getTestSession } from '../fixtures'

test.describe('Authentication flows', () => {
  test('authenticated user visiting /dashboard sees the dashboard', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 })
    await expect(page.getByRole('heading', { name: 'Portfolio' })).toBeVisible({ timeout: 10000 })
  })

  test('unauthenticated user visiting /dashboard is redirected to /login', async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const page = await context.newPage()
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login/, { timeout: 15000 })
    await context.close()
  })

  test('sign out returns user to /login', async ({ browser }) => {
    // Dedicated throwaway user so sign-out doesn't invalidate the shared storageState session
    const { email, password, user } = await createTestUser()
    try {
      const session = await getTestSession(email, password)
      const cookieValue = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url')
      const context = await browser.newContext()
      const page = await context.newPage()
      await context.addCookies([{
        name: 'sb-127-auth-token',
        value: cookieValue,
        domain: 'localhost',
        path: '/',
        httpOnly: false,
        secure: false,
        sameSite: 'Lax',
      }])

      // Navigate to /entities — safe for users with no seeded data (no onboarding redirect)
      await page.goto('/entities')
      await expect(page).toHaveURL(/\/entities/, { timeout: 15000 })

      await page.getByTestId('user-avatar').click()
      await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible({ timeout: 5000 })
      await page.getByRole('button', { name: /sign out/i }).click()

      await expect(page).toHaveURL(/\/login/, { timeout: 15000 })
      await context.close()
    } finally {
      await deleteTestUser(user.id)
    }
  })
})
