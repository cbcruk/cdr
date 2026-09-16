import { createTraceDevframe } from '@cbcruk/console-trace-devtools/devframe'
import { viteDevframeHub } from '@devframes/vite/hub'
import { defineConfig } from 'vite-plus'

export default defineConfig({
  plugins: [
    // 개발 서버에서만 붙는 Devframe hub. 데모의 span 트리를 dock으로 보여 준다.
    // localhost 전용이라 일회용 코드 인증은 끈다.
    viteDevframeHub({
      quiet: true,
      auth: false,
      devframes: [createTraceDevframe()],
    }),
  ],
  build: {
    outDir: 'demo-dist',
  },
  // 루트 아래 packages/*의 index.html까지 훑으면 각자 alias로 푸는 import를 못 찾아
  // 사전 번들링 전체를 건너뛴다. 데모 진입점만 스캔한다.
  optimizeDeps: {
    entries: ['index.html'],
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
    // log-viewer는 Node 쪽 도구라 자기 설정(node 환경, `cdr` alias)으로 따로 돈다.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/demo-dist/**',
      'e2e/**',
      'packages/log-viewer/**',
    ],
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
