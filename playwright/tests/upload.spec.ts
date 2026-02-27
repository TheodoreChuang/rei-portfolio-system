import { test, expect } from '@playwright/test'
import path from 'path'

test.describe('Upload flow', () => {
  /**
   * Full upload → match → mortgage → generate report flow.
   *
   * Requires:
   * - Local Supabase running (npx supabase start)
   * - At least one property registered for the test user
   * - A valid test PDF at playwright/fixtures/sample-statement.pdf
   *   (a real LLM call is made; mark as test.slow() to skip in quick runs)
   *
   * NOTE: This test is skipped by default until the fixture PDF is present
   * and the test environment is confirmed working.
   */
  test.skip('full upload flow: select month → upload → match → mortgage → generate', async ({ page }) => {
    await page.goto('/upload')
    await expect(page.getByText('Select month & upload')).toBeVisible({ timeout: 10000 })

    // Select a recent month
    const monthBtn = page.getByTestId(/month-selector-/).first()
    await monthBtn.click()

    // Upload a PDF
    const pdfPath = path.join(__dirname, '../fixtures/sample-statement.pdf')
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(pdfPath)

    // Continue to processing
    await page.getByTestId('continue-to-processing').click()

    // Wait for extraction to complete (real LLM call)
    await expect(page.getByTestId('confirm-matching')).toBeVisible({ timeout: 60000 })

    // Confirm matching
    await page.getByTestId('confirm-matching').click()

    // Skip mortgage entry
    await page.getByTestId('continue-to-review').click()

    // Generate report
    await page.getByTestId('generate-report').click()

    // Should land on dashboard with the report
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30000 })
    await expect(page.getByText(/report/i)).toBeVisible({ timeout: 15000 })
  })
})
