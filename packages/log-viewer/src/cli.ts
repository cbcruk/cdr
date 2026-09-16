#!/usr/bin/env node
import { existsSync } from 'node:fs'
import process from 'node:process'
import cac from 'cac'
import { createBuild } from 'devframe/adapters/build'
import { createDevServer } from 'devframe/adapters/dev'
import { createLogViewer } from './log-viewer/log-viewer.ts'

interface CliFlags {
  port?: number
  host: string
  outDir?: string
  open: boolean
}

const cli = cac('cdr-view')

cli
  .command('<file>', 'Open an NDJSON log exported from cdr')
  .option('--port <port>', 'Port to listen on', { default: 9998 })
  .option('--host <host>', 'Host to bind to', { default: '127.0.0.1' })
  .option('--out-dir <dir>', 'Write a static report here instead of serving')
  .option('--no-open', 'Do not open the browser')
  .action(async (file: string, flags: CliFlags): Promise<void> => {
    if (!existsSync(file)) {
      console.error(`cdr-view: no such file: ${file}`)
      process.exit(1)
    }

    const viewer = createLogViewer({ file })

    if (flags.outDir) {
      await createBuild(viewer, { outDir: flags.outDir })
      console.log(`cdr-view: static report written to ${flags.outDir}`)
      return
    }

    await createDevServer(viewer, {
      host: flags.host,
      port: flags.port,
      openBrowser: flags.open,
      auth: false,
      onReady: ({ origin }) => console.log(`cdr-view: ${file} → ${origin}`),
    })
  })

cli.help()
cli.parse()
