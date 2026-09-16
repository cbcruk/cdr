import { readFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineDevframe, defineRpcFunction } from 'devframe'
import type { DevframeDefinition } from 'devframe/types'
import type { RpcDefinitionsToFunctionsWithNamespace } from 'devframe/rpc'
import { parseNdjson } from '../parse-ndjson/parse-ndjson.ts'
import { LOG_VIEWER_ID } from './log-viewer.constants.ts'
import type { LoadedLog, LogViewerOptions } from './log-viewer.types.ts'

export { LOG_VIEWER_ID } from './log-viewer.constants.ts'
export type { LoadedLog, LogViewerOptions } from './log-viewer.types.ts'

const CLIENT_DIST = fileURLToPath(new URL('../../dist/client', import.meta.url))

function defineLoadLog(file: string) {
  return defineRpcFunction({
    name: 'load-log',
    type: 'static',
    jsonSerializable: true,
    handler: async (): Promise<LoadedLog> => {
      const path = resolve(file)
      const text = await readFile(path, 'utf8')
      return { fileName: basename(path), ...parseNdjson(text) }
    },
  })
}

declare module 'devframe' {
  interface DevframeRpcServerFunctions extends RpcDefinitionsToFunctionsWithNamespace<
    typeof LOG_VIEWER_ID,
    readonly [ReturnType<typeof defineLoadLog>]
  > {}
}

/**
 * cdr이 내보낸 NDJSON 파일 하나를 보는 devframe을 만든다.
 *
 * 파일은 RPC가 불릴 때 읽는다. `load-log`가 `static`이라 정적 빌드에서는
 * 빌드 시점에 한 번 읽혀 덤프에 구워지고, 그 결과물은 서버 없이 열린다.
 *
 * 화면은 `dist/client`에 미리 빌드돼 있어야 한다(`pnpm -C packages/log-viewer build`).
 *
 * @example 개발 서버로 띄우기
 * ```ts
 * import { createDevServer } from 'devframe/adapters/dev'
 * import { createLogViewer } from './log-viewer.ts'
 *
 * await createDevServer(createLogViewer({ file: 'cdr-2026-09-16.ndjson' }), {
 *   auth: false,
 * })
 * ```
 */
export function createLogViewer(options: LogViewerOptions): DevframeDefinition {
  return defineDevframe({
    id: LOG_VIEWER_ID,
    name: 'cdr log viewer',
    version: '0.1.0',
    packageName: '@cbcruk/cdr-log-viewer',
    homepage: 'https://github.com/cbcruk/cdr',
    description: 'Inspect NDJSON logs exported from cdr, grouped by session and span.',
    importMetaUrl: import.meta.url,
    clientAssets: CLIENT_DIST,
    setup(ctx) {
      ctx.scope(LOG_VIEWER_ID).rpc.register(defineLoadLog(options.file))
    },
  })
}
