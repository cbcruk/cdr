import { expect, test } from '@playwright/test'

// The roadmap asks whether losing attribution across `await` actually bites in
// a real app. This answers it from the outside, in a real browser, rather than
// by reasoning about the engine. Chromium has no native `AsyncContext` and the
// demo does not enable the Vite transform, so this is the default a consumer
// gets today.

test('attribution stops at the first await', async ({ page }) => {
  await page.goto('/')
  await page.locator('#tab-log').click()
  await page.locator('#clear').click()
  await expect(page.locator('#records .rec')).toHaveCount(0)

  await page.locator('#tab-gen').click()
  await page.locator('[data-emit="async"]').click()

  await page.locator('#tab-log').click()
  await page.locator('#refresh').click()
  await expect(page.locator('#records .rec')).toHaveCount(2)

  const rows = page.locator('#records .rec')
  const before = rows.filter({ hasText: 'api call started' })
  const after = rows.filter({ hasText: 'api call finished' })

  // Before the await the ambient span is visible, so the record is attributed.
  await expect(before.locator('.trace-id')).toHaveCount(1)

  // After it, the span has been restored away and the record lands on the
  // root, so it carries no ids at all. Unattributed, never misattributed.
  await expect(after.locator('.trace-id')).toHaveCount(0)
})
