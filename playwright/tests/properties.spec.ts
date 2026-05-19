import { test, expect } from '@playwright/test'

test.describe('Properties', () => {
  test('adds a property', async ({ page }) => {
    await page.goto('/properties')

    await page.getByRole('button', { name: /Add property/ }).click()
    await expect(page).toHaveURL(/\/properties\/new/, { timeout: 10000 })

    await page.locator('#address').fill('42 Park Avenue, Melbourne VIC 3000')
    await page.locator('#nickname').fill('Park Ave')
    await page.locator('#start-date').fill('2022-06-01')

    await page.getByRole('button', { name: 'Add property' }).click()

    await expect(page).toHaveURL(/\/properties\/.+/, { timeout: 10000 })
  })
})
