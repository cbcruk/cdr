import { expect, test, type Page } from '@playwright/test'

// A locked-down machine is the target environment, so the failure that matters
// most is the one where the browser refuses to give us storage at all. Private
// windows and enterprise policies both do this, and a recorder that dies on
// load takes the app down with it.

function collectPageErrors(page: Page): string[] {
  const errors: string[] = []

  page.on('pageerror', (error) => errors.push(error.message))

  return errors
}

test('the app survives a browser that refuses IndexedDB', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', {
      configurable: true,
      get() {
        throw new DOMException(
          'The user denied permission to access the database.',
          'SecurityError',
        )
      },
    })
  })

  const errors = collectPageErrors(page)

  await page.goto('/')

  // The page renders rather than dying on the recorder's first touch of storage.
  await expect(page.locator('#submit')).toBeVisible()

  await page.locator('[data-emit="warn"]').click()
  await page.locator('#tab-log').click()
  await page.locator('#refresh').click()

  // Nothing to show, but the viewer is still usable and nothing was thrown.
  await expect(page.locator('#records [data-state="storage-unavailable"]')).toBeVisible()
  expect(errors).toEqual([])
})

async function generateThenReload(page: Page, emit: string): Promise<void> {
  await page.goto('/')
  await page.locator('#tab-log').click()
  await page.locator('#clear').click()
  await expect(page.locator('#records .rec')).toHaveCount(0)
  await page.locator('#tab-gen').click()

  // Never open the viewer, so nothing in the test flushes on our behalf. The
  // brief pause is what a real reload gives an in-flight write; reloading in
  // the same tick tears the transaction down and nothing survives either way.
  await page.locator(`[data-emit="${emit}"]`).click()
  await page.waitForTimeout(100)
  await page.reload()

  await page.locator('#tab-log').click()
  await page.locator('#refresh').click()
}

test('an error survives a reload without ever opening the viewer', async ({ page }) => {
  await generateThenReload(page, 'error')

  await expect(page.locator('#records .rec')).toHaveCount(1)
  await expect(page.locator('#records .rec .lvl')).toHaveText('error')
})

test('a lower-severity record can still be lost to the buffer', async ({ page }) => {
  // The other half of the same trade. Batching keeps writes off the main
  // thread, and the cost is that anything below `flushOn` may not have reached
  // the store when the tab goes away. `pagehide` cannot rescue it: IndexedDB
  // writes are async, and one started as the page is torn down does not
  // finish. This pins the boundary rather than pretending it is not there.
  await generateThenReload(page, 'warn')

  await expect(page.locator('#records .rec')).toHaveCount(0)
})

test('two tabs write into one store and both are visible', async ({ browser }) => {
  // The shared-workstation caveat in the README, exercised: separate contexts
  // are separate logger sessions, and a real IndexedDB is shared between them.
  const context = await browser.newContext()
  const first = await context.newPage()

  await first.goto('/')
  await first.locator('#tab-log').click()
  await first.locator('#clear').click()
  await expect(first.locator('#records .rec')).toHaveCount(0)

  await first.locator('#tab-gen').click()
  await first.locator('[data-emit="schema"]').click()

  // Writes are batched, so make the first tab's record reach the store before
  // the second tab reads. This is about two contexts sharing one database, not
  // about flush timing.
  await first.locator('#tab-log').click()
  await first.locator('#refresh').click()
  await expect(first.locator('#records .rec')).toHaveCount(1)

  const second = await context.newPage()

  await second.goto('/')
  await second.locator('[data-emit="swallowed"]').click()
  await second.locator('#tab-log').click()
  await second.locator('#refresh').click()

  // The second tab sees its own record and the first tab's.
  await expect(second.locator('#records .rec')).toHaveCount(2)

  const types = await second.locator('#records .rec .type').allTextContents()

  expect(types).toContain('schema_mismatch')
  expect(types).toContain('swallowed_exception')

  await context.close()
})
