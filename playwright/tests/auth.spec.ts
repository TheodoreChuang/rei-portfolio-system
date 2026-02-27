import { test, expect } from '@playwright/test'

test.describe('Authentication flows', () => {
  test('authenticated user visiting /dashboard sees the dashboard', async ({ page }) => {
    // storageState provides the session cookie via playwright.config.ts
    await page.goto('/dashboard')
    // Should stay on /dashboard — not redirected to /login
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 })
    // And the nav should be visible (not the login page)
    await expect(page.getByText('PropFlow')).toBeVisible({ timeout: 10000 })
  })

  test('unauthenticated user visiting /dashboard is redirected to /login', async ({ browser }) => {
    // Explicitly empty storageState to guarantee no session
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const page = await context.newPage()
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login/, { timeout: 15000 })
    await context.close()
  })

  test('sign out returns user to /login', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 })

    // Open user dropdown and click sign out
    await page.getByTestId('user-avatar').click()
    await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible({ timeout: 5000 })
    await page.getByRole('button', { name: /sign out/i }).click()

    await expect(page).toHaveURL(/\/login/, { timeout: 15000 })
  })
})
