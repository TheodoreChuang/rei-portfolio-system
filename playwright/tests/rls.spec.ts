import { test, expect } from '@playwright/test'
import { createTestUser, deleteTestUser, getTestSession } from '../fixtures'

test.describe('RLS data isolation', () => {
  /**
   * Verifies that user B cannot see user A's data in the UI.
   *
   * User A = the main test user (via storageState, already has data seeded).
   * User B = a fresh user created inline with no reports.
   */
  test('user B sees empty dashboard when user A has reports', async ({ browser }) => {
    // Create user B fresh (no data)
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
        httpOnly: true,
        secure: false,
        sameSite: 'Lax',
      }])

      await page.goto('/dashboard')
      await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 })

      // User B should see the empty state (not user A's reports)
      await expect(page.getByRole('heading', { name: /No data for/i })).toBeVisible({ timeout: 15000 })

      await context.close()
    } finally {
      await deleteTestUser(user.id)
    }
  })
})
