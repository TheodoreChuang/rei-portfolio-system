import { test, expect } from '@playwright/test'

test.describe('Loans', () => {
  test('adds a loan', async ({ page }) => {
    await page.goto('/loans')

    await page.getByRole('link', { name: '+ Add loan' }).click()
    await expect(page).toHaveURL(/\/loans\/new/, { timeout: 10000 })

    await page.locator('#lender').fill('Commonwealth Bank')
    await page.locator('#nickname').fill('Investment loan')

    // Wait for the async property list to load, then select the seeded property
    await expect(page.getByRole('button', { name: /123 Smith St/ })).toBeVisible({ timeout: 10000 })
    await page.getByRole('button', { name: /123 Smith St/ }).click()

    await page.locator('#start-date').fill('2022-06-01')
    await page.locator('#end-date').fill('2052-06-01')

    await page.getByRole('button', { name: 'Add loan' }).click()

    await expect(page).toHaveURL(/\/loans\/.+/, { timeout: 10000 })
  })
})
