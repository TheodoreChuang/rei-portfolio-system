import { test, expect, type Page } from '@playwright/test'

async function goToSmithStEdit(page: Page) {
  await page.goto('/properties')
  await page.locator('div').filter({ hasText: '123 Smith St' })
    .getByRole('button', { name: 'Edit' }).click()
  await expect(page).toHaveURL(/\/properties\/.+\/edit/, { timeout: 10000 })
}

test.describe('Loan accounts on property edit page', () => {
  test('shows seeded loan accounts', async ({ page }) => {
    await goToSmithStEdit(page)
    await expect(page.getByText('Loan accounts')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Westpac')).toBeVisible()
    await expect(page.getByText('Investment loan')).toBeVisible()
    await expect(page.getByText('Active').first()).toBeVisible()
  })

  test('adds a new loan account', async ({ page }) => {
    await goToSmithStEdit(page)
    await expect(page.getByText('Loan accounts')).toBeVisible({ timeout: 10000 })

    await page.getByLabel('Lender').fill('ANZ')
    await page.getByLabel('Nickname').fill('Variable rate')
    await page.getByRole('button', { name: 'Add loan account' }).click()

    await expect(page.getByText('ANZ')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Variable rate')).toBeVisible()
  })

  test('deactivates a loan account', async ({ page }) => {
    await goToSmithStEdit(page)
    await expect(page.getByText('Westpac')).toBeVisible({ timeout: 10000 })

    // Click Deactivate next to Westpac
    const westpacCard = page.locator('div').filter({ hasText: /^Westpac/ }).first()
    await westpacCard.getByRole('button', { name: 'Deactivate' }).click()

    await expect(westpacCard.getByText('Inactive')).toBeVisible({ timeout: 5000 })
    await expect(westpacCard.getByRole('button', { name: 'Reactivate' })).toBeVisible()
  })
})
