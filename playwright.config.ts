import { defineConfig, devices } from '@playwright/test'

const PORT = 5174
const BASE_URL = `http://localhost:${PORT}`

/**
 * End-to-end configuration for the demo app.
 *
 * These tests exist for the claims the unit suite structurally cannot check.
 * Those run on jsdom with `fake-indexeddb`, so nothing there proves that
 * records survive a reload in a real browser's IndexedDB, which is the whole
 * premise of a pull-model recorder.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // 개발 서버 대신 빌드 결과를 서빙한다. Pages에 실제로 올라가는 산출물과
  // 같고, 첫 요청에서 의존성 최적화가 도는 일이 없어 시작이 예측 가능하다.
  webServer: {
    command: `pnpm run demo:build && pnpm exec vp preview --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
