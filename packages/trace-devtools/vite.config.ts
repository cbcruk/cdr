import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite-plus'

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  root: here('./app'),
  base: './',
  build: {
    outDir: here('./dist/panel'),
    emptyOutDir: true,
    target: 'es2022',
  },
  test: {
    root: here('.'),
    include: ['tests/**/*.test.ts'],
  },
  fmt: {
    semi: false,
    singleQuote: true,
  },
})
