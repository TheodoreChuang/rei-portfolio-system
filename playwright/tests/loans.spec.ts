import { test, expect, type Page } from '@playwright/test'

async function goToSmithStEdit(page: Page) {
  await page.goto('/properties')
  await page.locator('div').filter({ hasText: '123 Smith St' })
    .getByRole('button', { name: 'Edit' }).click()
  await expect(page).toHaveURL(/\/properties\/.+(?<!\/edit)$/, { timeout: 10000 })
}

test.describe('Loan accounts on property edit page', () => {
  test('shows seeded loan accounts', async ({ page }) => {
    await goToSmithStEdit(page)
    await expect(page.getByText('Loan accounts')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Westpac')).toBeVisible()
    await expect(page.getByText('Investment loan')).toBeVisible()
    // Slice 5: shows date range instead of Active/Inactive badge
    await expect(page.getByText(/2020-01-01/)).toBeVisible()
  })

  test('adds a new loan account', async ({ page }) => {
    await goToSmithStEdit(page)
    await expect(page.getByText('Loan accounts')).toBeVisible({ timeout: 10000 })

    await page.locator('#new-lender').fill('ANZ')
    await page.locator('#new-nickname').fill('Variable rate')
    // Chrome date inputs require native value setter to trigger React onChange
    await page.locator('#new-loan-start').evaluate((el: HTMLInputElement) => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set?.call(el, '2020-01-01')
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await page.locator('#new-loan-end').evaluate((el: HTMLInputElement) => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set?.call(el, '2050-01-01')
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await page.getByRole('button', { name: 'Add loan account' }).click()

    await expect(page.getByText('ANZ')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Variable rate')).toBeVisible()
  })

  test('ends a loan account', async ({ page }) => {
    await goToSmithStEdit(page)
    await expect(page.getByText('Westpac')).toBeVisible({ timeout: 10000 })

    const endLoanButtons = page.getByRole('button', { name: 'End loan' })
    const initialCount = await endLoanButtons.count()

    // End the first loan (Westpac) — button disappears for ended loans
    await endLoanButtons.first().click()

    await expect(endLoanButtons).toHaveCount(initialCount - 1, { timeout: 5000 })
  })
})
