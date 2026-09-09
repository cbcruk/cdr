import type { BaseContext, DiagEvent, LogLevel, LogRecord, Sink } from './types'
import { makeScrubber, type ScrubOptions, type Scrubber } from './scrub'

/** {@linkcode DiagLogger} 생성 옵션. */
export interface LoggerOptions {
  /** 레코드를 흘려보낼 목적지들. 하나가 실패해도 나머지는 계속 받는다. */
  sinks: Sink[]
  /** 환경 컨텍스트 (release 버전 등). `url`/`sessionId`는 자동 채움. */
  context?: Partial<BaseContext>
  /** flush 주기(ms). 기본 2000. */
  flushIntervalMs?: number
  /** 한 번에 쌓이는 메모리 버퍼 상한. 넘으면 즉시 flush. 기본 100. */
  maxBufferSize?: number
  /** 이 레벨 미만은 버린다. 기본 `'debug'`. */
  minLevel?: LogLevel
  /** 저장 직전 마스킹 정책. 생략하면 기본 정책이 적용된다. */
  scrub?: ScrubOptions
  /**
   * 매 레코드마다 불려서 `ctx`에 합쳐질 필드를 돌려주는 함수.
   *
   * `context`가 생성 시점에 한 번 고정되는 것과 달리 기록 시점마다 평가되므로,
   * 그때그때 달라지는 값을 붙일 때 쓴다. 화면 경로, 로그인 역할, 진행 중인
   * 작업 식별자 같은 것들이다.
   *
   * 반환값은 **스크러버를 거치지 않는다.** `ctx`는 원래 `url`/`release`처럼
   * 안전한 메타데이터 자리이고, 상관 식별자는 마스킹되면 쓸모가 없어진다.
   * 그러니 값이 아니라 표식만 담을 것.
   *
   * 여기서 던진 예외는 삼켜지고 그 레코드는 보강 없이 저장된다. 로깅이
   * 앱을 깨지 않는다는 원칙이 보강 함수에도 적용된다.
   */
  enrich?: () => Record<string, unknown>
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
}

function randomId(): string {
  // crypto가 없는 환경 대비 fallback
  try {
    return crypto.randomUUID()
  } catch {
    return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  }
}

/**
 * 진단 이벤트를 모아 주기적으로 sink에 흘려보내는 로거.
 *
 * 기록은 동기, 쓰기는 비동기 배치다. 버퍼가 `maxBufferSize`에 닿거나
 * `flushIntervalMs`가 지나면 비우고, 탭이 숨겨지거나 종료될 때도 한 번 더
 * 비워 유실을 줄인다. sink가 던지는 예외는 삼켜서 로깅이 앱을 깨지 않게 한다.
 *
 * 흔한 구성은 `setupDiagLogger`가 대신 세워 준다. 직접 생성하는 건
 * sink 조합이나 버퍼 정책을 손볼 때다.
 *
 * @example 직접 조립
 * ```ts
 * import { DiagLogger, IdbSink } from 'cdr'
 *
 * const logger = new DiagLogger({
 *   sinks: [new IdbSink()],
 *   context: { release: '2026.09.1' },
 *   minLevel: 'info',
 * })
 *
 * logger.swallowed('checkout.submit', new Error('boom'))
 * await logger.flush()
 * ```
 */
export class DiagLogger {
  private sinks: Sink[]
  private scrub: Scrubber
  private buffer: LogRecord[] = []
  private timer: ReturnType<typeof setInterval> | null = null
  private readonly flushIntervalMs: number
  private readonly maxBufferSize: number
  private readonly minLevel: number
  private readonly baseCtx: BaseContext
  private readonly enrich?: () => Record<string, unknown>
  private listenersBound = false

  /**
   * 로거를 만들고 곧바로 주기 flush와 생명주기 훅을 건다.
   *
   * @param opts sink와 버퍼·마스킹 정책.
   */
  constructor(opts: LoggerOptions) {
    this.sinks = opts.sinks
    this.scrub = makeScrubber(opts.scrub)
    this.flushIntervalMs = opts.flushIntervalMs ?? 2000
    this.maxBufferSize = opts.maxBufferSize ?? 100
    this.minLevel = LEVEL_ORDER[opts.minLevel ?? 'debug']
    this.enrich = opts.enrich
    this.baseCtx = {
      url: typeof location !== 'undefined' ? location.href : '',
      sessionId: randomId(),
      ...opts.context,
    }
    this.start()
  }

  /**
   * 진단 이벤트를 기록한다.
   *
   * 동기 호출이고, 실제 쓰기는 비동기 배치로 미뤄진다. `minLevel` 미만이면
   * 조용히 버린다. `data`는 이 시점에 마스킹되므로, 나중에 객체를 바꿔도
   * 기록된 값은 변하지 않는다. `enrich`가 있으면 이 시점에 불려서 결과가
   * `ctx`에 합쳐진다.
   *
   * @param event 기록할 이벤트. `level`/`source`는 각각 `'info'`/`'app'`이 기본.
   */
  log(event: DiagEvent): void {
    const level = event.level ?? 'info'
    if (LEVEL_ORDER[level] < this.minLevel) return

    const record: LogRecord = {
      type: event.type,
      ts: Date.now(),
      level,
      message: event.message ?? '',
      data: event.data ? this.scrub(event.data) : {}, // ← 쓰기 시점 마스킹
      source: event.source ?? 'app',
      ctx: { ...this.baseCtx, url: this.currentUrl(), ...this.enrichment() },
    }

    this.buffer.push(record)
    if (this.buffer.length >= this.maxBufferSize) void this.flush()
  }

  /**
   * 검증 실패로 동작을 막았으나 UI가 침묵한 상황을 `warn`으로 기록한다.
   *
   * 필드 이름만 남기고 입력값은 남기지 않는다.
   *
   * @param fields 막힌 필드 경로 (예: `['email', 'address.zip']`).
   * @param source 출처 표시. 기본 `'app'`.
   */
  validationBlocked(fields: string[], source = 'app') {
    this.log({ type: 'validation_blocked', level: 'warn', source, data: { fields } })
  }

  /**
   * 응답이 스키마와 어긋난 상황을 `error`로 기록한다.
   *
   * @param schema 어긋난 스키마 이름.
   * @param paths 문제가 난 경로 목록.
   * @param source 출처 표시. 기본 `'app'`.
   */
  schemaMismatch(schema: string, paths: string[], source = 'app') {
    this.log({ type: 'schema_mismatch', level: 'error', source, data: { schema, paths } })
  }

  /**
   * catch 했지만 사용자에게 표면화하지 않은 예외를 `error`로 기록한다.
   *
   * @param where 삼킨 지점의 이름 (예: `'checkout.submit'`).
   * @param err 삼킨 예외. `Error`면 `name`/`stack`이 보존된다.
   * @param source 출처 표시. 기본 `'app'`.
   */
  swallowed(where: string, err?: unknown, source = 'app') {
    this.log({ type: 'swallowed_exception', level: 'error', source, data: { where, err } })
  }

  /**
   * 버퍼에 쌓인 레코드를 모든 sink에 한 번에 넘긴다.
   *
   * 버퍼는 넘기기 전에 비우므로, 실패한 sink의 레코드는 재시도되지 않는다.
   * sink가 던진 예외는 삼켜지고, 다른 sink는 영향을 받지 않는다.
   *
   * @returns 모든 sink의 쓰기가 끝나면 resolve. 버퍼가 비었으면 즉시 resolve.
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) return
    const batch = this.buffer
    this.buffer = []
    await Promise.all(
      this.sinks.map(async (s) => {
        try {
          await s.write(batch)
        } catch {
          // sink 실패가 앱이나 다른 sink를 깨면 안 된다. 조용히 무시.
        }
      }),
    )
  }

  /** 보강 함수가 던져도 그 레코드만 보강 없이 간다. */
  private enrichment(): Record<string, unknown> {
    if (!this.enrich) return {}
    try {
      return this.enrich()
    } catch {
      return {}
    }
  }

  private currentUrl(): string {
    return typeof location !== 'undefined' ? location.href : this.baseCtx.url
  }

  private start(): void {
    if (this.timer) return
    this.timer = setInterval(() => void this.flush(), this.flushIntervalMs)
    this.bindLifecycle()
  }

  /** 탭 종료/백그라운드 진입 시점에 유실 최소화. */
  private bindLifecycle(): void {
    if (this.listenersBound || typeof addEventListener !== 'function') return
    this.listenersBound = true
    const onExit = () => {
      void this.flush()
      void Promise.all(this.sinks.map((s) => Promise.resolve(s.flush?.())))
    }
    addEventListener('pagehide', onExit)
    addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') onExit()
    })
  }

  /**
   * 주기 flush를 멈추고 마지막으로 한 번 비운다.
   *
   * 테스트나 SPA 언마운트에서 타이머를 남기지 않으려고 쓴다. 마지막 flush는
   * 기다리지 않으므로, 완료를 보장하려면 {@linkcode DiagLogger.flush}를 먼저
   * await 할 것. 생명주기 리스너는 해제되지 않는다.
   */
  dispose(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    void this.flush()
  }
}
