import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { toNdjson } from 'cdr'
import { createBuild } from 'devframe/adapters/build'
import { DEVFRAME_RPC_DUMP_MANIFEST_FILENAME } from 'devframe/constants'
import { afterEach, describe, expect, it } from 'vite-plus/test'
import { LOG_VIEWER_ID, createLogViewer } from '../src/log-viewer/log-viewer.ts'
import { record } from './fixtures/records.ts'

const dirs: string[] = []

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'cdr-log-viewer-'))
  dirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('createLogViewer static build', () => {
  it('bakes the parsed log into the RPC dump so the report opens without a server', async () => {
    const work = await tempDir()
    const file = join(work, 'cdr-export.ndjson')
    await writeFile(file, `${toNdjson([record({ message: 'hello' })])}\nnot json\n`)

    const client = join(work, 'client')
    await mkdir(client)
    await writeFile(join(client, 'index.html'), '<!doctype html>')
    const outDir = join(work, 'out')

    await createBuild(createLogViewer({ file }), { outDir, distDir: client })

    const manifest = JSON.parse(
      await readFile(join(outDir, DEVFRAME_RPC_DUMP_MANIFEST_FILENAME), 'utf8'),
    ) as Record<string, { type: string; path: string }>
    const entry = manifest[`${LOG_VIEWER_ID}:load-log`]
    expect(entry?.type).toBe('static')

    const dump = JSON.parse(await readFile(join(outDir, entry!.path), 'utf8')) as {
      output: unknown
    }
    expect(dump.output).toMatchObject({
      fileName: 'cdr-export.ndjson',
      records: [{ message: 'hello' }],
      issues: [{ line: 2, reason: 'invalid JSON' }],
    })
  })
})
