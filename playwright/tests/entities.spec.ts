import { test, expect } from '@playwright/test'

test.describe('Entities', () => {
  test('adds an entity', async ({ page }) => {
    await page.goto('/entities')

    await page.getByRole('button', { name: '+ Add entity' }).click()
    await expect(page.locator('#new-entity-name')).toBeVisible({ timeout: 5000 })

    await page.locator('#new-entity-name').fill('Smith Family Trust')
    await page.locator('#new-entity-type').selectOption('Discretionary trust')
    await page.getByRole('button', { name: 'Add entity', exact: true }).click()

    await expect(page.getByText('Smith Family Trust')).toBeVisible({ timeout: 5000 })
  })
})
