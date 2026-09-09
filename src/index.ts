/**
 * 브라우저 진단 로그를 사용자 기기에만 쌓아 두고, 필요할 때 사용자가 직접
 * 내보내는 pull 모델 로거.
 *
 * 아무것도 전송하지 않으므로 outbound가 막힌 망에서도 동작한다. 앱은
 * {@linkcode DiagLogger}로 "침묵한 실패"를 기록하고, `/log` 같은 라우트에서
 * {@linkcode IdbSink.read}로 꺼내 `downloadLogs`로 내보낸다.
 * 저장 직전 `makeScrubber`가 값을 마스킹하므로 내보내도 원본은
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
import { configureTraceForDiagnostics, spanContext } from './trace'

export { DiagLogger } from './logger'
export type { LoggerOptions } from './logger'
export { IdbSink } from './sinks/idb'
export type { IdbSinkOptions } from './sinks/idb'
export { ConsoleSink } from './sinks/console'
export { makeScrubber } from './scrub'
export type { ScrubOptions, Scrubber } from './scrub'
export { configureTraceForDiagnostics, spanContext, trace } from './trace'

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
  /**
   * 레코드에 상관 식별자를 붙인다. 기본 `false`.
   *
   * 켜면 {@linkcode trace}로 감싼 사용자 동작 하나에서 나온 레코드가 같은
   * `trace_id`를 달고, 중첩된 단계는 `parent_id`로 이어진다. 내보낸 파일을
   * 읽을 때 "이 레코드들이 같은 동작에서 나왔나"에 답할 수 있게 된다.
   * `enrich` 배선과 진단용 기본값 설정을 대신 해 준다.
   *
   * **정확도 경계.** 동기 구간은 언제나 정확하다. `await`를 넘는 귀속은
   * 브라우저에 네이티브 `AsyncContext`가 있거나 트레이서의 Vite 변환을
   * 켰을 때만 정확하다. 그 밖에는 타이머, 프라미스 반응, 나중에 도착한
   * 이벤트에서 기록된 레코드에 식별자가 붙지 않는다. **식별자가 없다는 건
   * 귀속되지 않았다는 뜻이지 무관하다는 뜻이 아니다.** 틀린 동작에 묶이는
   * 일은 없다.
   *
   * 개발 중 오버레이까지 띄우려면 이 옵션 대신 트레이서를 직접 설정할 것.
   */
  trace?: boolean
  /**
   * 매 레코드마다 `ctx`에 합칠 필드를 돌려주는 함수.
   *
   * 상관 식별자처럼 기록 시점마다 달라지는 값을 붙이는 자리다. 반환값은
   * 스크러버를 거치지 않으니 값이 아니라 표식만 담을 것. 자세한 계약은
   * {@linkcode LoggerOptions.enrich}에 있다.
   *
   * `trace`와 함께 쓰면 둘 다 적용된다. 키가 겹치면 이쪽이 이긴다.
   */
  enrich?: () => Record<string, unknown>
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
/** `trace`와 `enrich`를 하나의 보강 함수로 합친다. 키가 겹치면 `enrich`가 이긴다. */
function resolveEnrich(opts: SetupOptions): (() => Record<string, unknown>) | undefined {
  if (!opts.trace) return opts.enrich

  configureTraceForDiagnostics()

  const { enrich } = opts
  if (!enrich) return spanContext

  return () => ({ ...spanContext(), ...enrich() })
}

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
    enrich: resolveEnrich(opts),
    ...opts.logger,
  })

  return { diag, idbSink }
}
