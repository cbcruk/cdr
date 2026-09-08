/**
 * 브라우저 진단 로그를 사용자 기기에만 쌓아 두고, 필요할 때 사용자가 직접
 * 내보내는 pull 모델 로거.
 *
 * 아무것도 전송하지 않으므로 outbound가 막힌 망에서도 동작한다. 앱은
 * {@linkcode DiagLogger}로 "침묵한 실패"를 기록하고, `/log` 같은 라우트에서
 * {@linkcode IdbSink.read}로 꺼내 {@linkcode downloadLogs}로 내보낸다.
 * 저장 직전 {@linkcode makeScrubber}가 값을 마스킹하므로 내보내도 원본은
 * 나가지 않는다.
 *
 * @example 앱 시작 지점에서 한 번 세우기
 * ```ts
 * import { setupDiagLogger } from 'cdr'
 *
 * export const { diag, idbSink } = setupDiagLogger({
 *   release: '2026.09.1',
 *   maxRecords: 5000,
 *   dev: true,
 * })
 *
 * diag.validationBlocked(['email'])
 * ```
 *
 * @module
 */

import { DiagLogger, type LoggerOptions } from './logger'
import { IdbSink, type IdbSinkOptions } from './sinks/idb'
import { ConsoleSink } from './sinks/console'

export { DiagLogger } from './logger'
export type { LoggerOptions } from './logger'
export { IdbSink } from './sinks/idb'
export type { IdbSinkOptions } from './sinks/idb'
export { ConsoleSink } from './sinks/console'
export { makeScrubber } from './scrub'
export type { ScrubOptions, Scrubber } from './scrub'

export * from './types'
export * from './export'

// adapters
export { pinoTransmit } from './adapters/pino'
export { attachLoglevel } from './adapters/loglevel'
export { consolaReporter } from './adapters/consola'

/** {@linkcode setupDiagLogger}에 넘기는 구성. 전부 선택이다. */
export interface SetupOptions {
  /** 빌드/릴리스 버전. 매 레코드의 컨텍스트에 붙는다. */
  release?: string
  /** IndexedDB에 유지할 최대 레코드 수. 기본 5000. */
  maxRecords?: number
  /** `true`면 console에도 출력한다. 보통 `import.meta.env.DEV`를 넘긴다. */
  dev?: boolean
  /** IndexedDB sink 세부 설정. `maxRecords`보다 우선한다. */
  idb?: IdbSinkOptions
  /** 로거 세부 설정. `sinks`는 이 팩토리가 정하므로 넘길 수 없다. */
  logger?: Partial<Omit<LoggerOptions, 'sinks'>>
}

/**
 * 가장 흔한 구성을 한 번에 세우는 편의 팩토리.
 *
 * - prod: IndexedDB만 (pull 모델, 망 제약 무관)
 * - dev: + console
 *
 * 더 세밀하게 제어하려면 {@linkcode DiagLogger}를 직접 생성하고 sink를
 * 조립할 것. `idbSink`를 함께 반환하므로 `/log` 라우트에서
 * {@linkcode IdbSink.read} / {@linkcode IdbSink.clear}에 그대로 쓴다.
 *
 * @param opts 릴리스 버전, 보존 상한, dev 여부 등.
 * @returns 기록에 쓸 `diag`와 읽기·비우기에 쓸 `idbSink`.
 *
 * @example 기록과 내보내기
 * ```ts
 * import { downloadLogs, setupDiagLogger } from 'cdr'
 *
 * const { diag, idbSink } = setupDiagLogger({ release: '2026.09.1' })
 *
 * diag.schemaMismatch('OrderResponse', ['items.0.price'])
 * await diag.flush()
 *
 * downloadLogs(await idbSink.read())
 * ```
 */
export function setupDiagLogger(opts: SetupOptions = {}): {
  diag: DiagLogger
  idbSink: IdbSink
} {
  const idbSink = new IdbSink({
    maxRecords: opts.maxRecords ?? 5000,
    ...opts.idb,
  })

  const sinks = opts.dev ? [idbSink, new ConsoleSink()] : [idbSink]

  const diag = new DiagLogger({
    sinks,
    context: { release: opts.release },
    ...opts.logger,
  })

  return { diag, idbSink }
}
