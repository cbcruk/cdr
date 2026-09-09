import { defineConfig } from 'vite-plus'

export default defineConfig({
  build: {
    outDir: 'demo-dist',
  },
  pack: {
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: true,
    sourcemap: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['tests/setup.ts'],
    // e2e는 Playwright가 실제 브라우저에서 돌린다. `vp test`가 주워가면
    // @playwright/test를 jsdom에서 불러오다 깨진다.
    exclude: ['**/node_modules/**', '**/dist/**', '**/demo-dist/**', 'e2e/**'],
  },
  fmt: {
    semi: false,
    singleQuote: true,
  },
  lint: {
    jsPlugins: [{ name: 'vite-plus', specifier: 'vite-plus/oxlint-plugin' }],
    rules: { 'vite-plus/prefer-vite-plus-imports': 'error' },
    options: { typeAware: true, typeCheck: true },
  },
  staged: {
    '*': 'vp fmt',
  },
})
