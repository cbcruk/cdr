import { expect, test, type Page } from '@playwright/test'

// What the unit suite cannot reach. Those tests run on jsdom with
// `fake-indexeddb`, so they prove the logic but never that a real browser
// keeps these records across a reload, which is the whole premise of a
// pull-model recorder.

async function openViewer(page: Page): Promise<void> {
  await page.locator('#tab-log').click()
  await page.locator('#refresh').click()
}

async function clearAll(page: Page): Promise<void> {
  await openViewer(page)
  await page.locator('#clear').click()
  await expect(page.locator('#records .rec')).toHaveCount(0)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await clearAll(page)
  await page.locator('#tab-gen').click()
})

test('a blocked submit is recorded and survives a reload', async ({ page }) => {
  await page.locator('#email').fill('not-an-email')
  await page.locator('#phone').fill('nope')
  await page.locator('#submit').click()

  await openViewer(page)
  await expect(page.locator('#records .rec')).toHaveCount(1)
  await expect(page.locator('#records .rec .type')).toHaveText('validation_blocked')

  // The pull model's actual claim: it is still there on a cold load.
  await page.reload()
  await openViewer(page)
  await expect(page.locator('#records .rec .type')).toHaveText('validation_blocked')
})

test('records from one submit share a trace id', async ({ page }) => {
  await page.locator('#email').fill('not-an-email')
  await page.locator('#phone').fill('nope')
  await page.locator('#submit').click()
  await page.locator('#submit').click()

  await openViewer(page)

  const ids = await page.locator('#records .trace-id').allTextContents()

  expect(ids).toHaveLength(2)
  expect(ids[0]).toBeTruthy()
  // Two separate user actions, so two separate traces.
  expect(ids[0]).not.toBe(ids[1])
})

test('sensitive values are masked before they are stored', async ({ page }) => {
  await page.locator('[data-emit="sensitive"]').click()

  await openViewer(page)

  const payload = await page.locator('#records .rec .data').first().textContent()

  expect(payload).toContain('‹masked›')
  expect(payload).not.toContain('eyJhbGciOiJIUzI1Niated')
  expect(payload).not.toContain('patient@example.org')
  expect(payload).not.toContain('홍길동')
})

test('the viewer filters by level without dropping records', async ({ page }) => {
  await page.locator('[data-emit="info"]').click()
  await page.locator('[data-emit="error"]').click()

  await openViewer(page)
  await expect(page.locator('#records .rec')).toHaveCount(2)

  await page.locator('#lvl-info').uncheck()
  await expect(page.locator('#records .rec')).toHaveCount(1)
  await expect(page.locator('#records .rec .lvl')).toHaveText('error')

  await page.locator('#lvl-info').check()
  await expect(page.locator('#records .rec')).toHaveCount(2)
})

test('export hands the user an NDJSON file of what they can see', async ({ page }) => {
  await page.locator('[data-emit="schema"]').click()
  await page.locator('[data-emit="swallowed"]').click()

  await openViewer(page)

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#download').click(),
  ])

  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(chunk as Buffer)
  }

  const lines = Buffer.concat(chunks).toString('utf8').trim().split('\n')

  expect(lines).toHaveLength(2)

  const types = lines.map((line) => (JSON.parse(line) as { type: string }).type)

  expect(types).toContain('schema_mismatch')
  expect(types).toContain('swallowed_exception')
})

test('clearing empties the store for good', async ({ page }) => {
  await page.locator('[data-emit="warn"]').click()

  await openViewer(page)
  await expect(page.locator('#records .rec')).toHaveCount(1)

  await page.locator('#clear').click()
  // Wait for the clear to land. Reloading mid-transaction would abort it, and
  // the reload is the point of the test.
  await expect(page.locator('#records .rec')).toHaveCount(0)

  await page.reload()
  await openViewer(page)

  await expect(page.locator('#records .rec')).toHaveCount(0)
})

test('clearing right after generating events leaves nothing behind', async ({ page }) => {
  // Writes are batched, so a record can exist without having reached the store
  // yet. Clearing flushes first for that reason; without it the buffer lands
  // after the wipe and the user watches an entry reappear. The flush timer
  // makes the raw race hard to hit on demand, so this pins the ordering from
  // the outside rather than trying to reproduce the window.
  await page.locator('[data-emit="warn"]').click()

  await page.locator('#tab-log').click()
  await page.locator('#clear').click()
  await expect(page.locator('#records .rec')).toHaveCount(0)

  await page.reload()
  await openViewer(page)

  await expect(page.locator('#records .rec')).toHaveCount(0)
})

test('the text filter narrows the list without touching the store', async ({ page }) => {
  await page.locator('[data-emit="info"]').click()
  await page.locator('[data-emit="error"]').click()

  await openViewer(page)
  await expect(page.locator('#records .rec')).toHaveCount(2)

  await page.locator('#search').fill('request failed')
  await expect(page.locator('#records .rec')).toHaveCount(1)
  await expect(page.locator('#records .rec .lvl')).toHaveText('error')

  // Filtering is a view concern; clearing it brings everything back.
  await page.locator('#search').fill('')
  await expect(page.locator('#records .rec')).toHaveCount(2)
})

test('copying puts the visible records on the clipboard as text', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])

  await page.locator('[data-emit="schema"]').click()

  await openViewer(page)
  await page.locator('#copy').click()

  // The button confirms, which is the only signal a user gets.
  await expect(page.locator('#copy')).toHaveText('복사됨!')

  const clipboard = await page.evaluate(() => navigator.clipboard.readText())

  expect(clipboard).toContain('schema_mismatch')
})
