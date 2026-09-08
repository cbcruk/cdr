/**
 * 침묵하는 "제3의 상태"를 일급 이벤트로 만드는 분류.
 *
 * 자유 문자열이 아니라 유니온이라, 어떤 종류의 사일런트가 존재하는지가
 * 코드로 관리되고 검색·집계 가능해진다.
 *
 * - `validation_blocked` — 검증 실패로 동작을 막았는데 UI가 침묵.
 * - `schema_mismatch` — 응답이 스키마와 안 맞음.
 * - `swallowed_exception` — catch 했지만 표면화 안 됨.
 * - `silent_early_return` — early return 했는데 사용자 피드백 없음.
 * - `log` — 일반 로그 (기존 로거 어댑터 경유분).
 */
export type DiagEventType =
  | 'validation_blocked'
  | 'schema_mismatch'
  | 'swallowed_exception'
  | 'silent_early_return'
  | 'log'

/**
 * 로그 심각도.
 *
 * `trace` < `debug` < `info` < `warn` < `error` 순서로 높아지며,
 * {@linkcode LoggerOptions.minLevel} 이 이 순서로 하한을 정한다.
 */
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error'

/**
 * 호출부가 기록하는 진단 이벤트.
 *
 * 의미 있는 필드만 담고 값은 담지 않는 게 원칙이다. `data`는 저장 직전
 * scrubber를 거치지만, 애초에 민감한 값을 넣지 않는 편이 안전하다.
 */
export interface DiagEvent {
  /** 어떤 종류의 침묵인지. */
  type: DiagEventType
  /** 심각도. 생략하면 `'info'`로 기록된다. */
  level?: LogLevel
  /** 사람이 읽을 짧은 메시지. PHI를 넣지 말 것. */
  message?: string
  /** 구조화 컨텍스트. scrubber를 거쳐 저장된다. */
  data?: Record<string, unknown>
  /** 출처 표시 (예: `'pino'`, `'loglevel'`, `'app'`). 생략하면 `'app'`. */
  source?: string
}

/**
 * sink에 실제로 저장되는, 메타데이터가 보강된 최종 형태.
 *
 * {@linkcode DiagEvent}의 선택 필드가 모두 채워진 상태이며, `data`는 이미
 * 마스킹을 거쳤다. 그래서 export해도 원본 값은 남지 않는다.
 */
export interface LogRecord extends Required<Pick<DiagEvent, 'type'>> {
  /** 자동 증가 키 ({@linkcode IdbSink}가 채움). 메모리 단계에선 없음. */
  id?: number
  /** 기록 시각 (epoch ms). */
  ts: number
  /** 심각도. */
  level: LogLevel
  /** 사람이 읽을 메시지. 없었으면 빈 문자열. */
  message: string
  /** 마스킹을 마친 구조화 컨텍스트. 없었으면 빈 객체. */
  data: Record<string, unknown>
  /** 출처 표시. */
  source: string
  /** 매 이벤트에 자동 부착되는 환경 컨텍스트. */
  ctx: BaseContext
}

/** 매 레코드에 자동으로 붙는 환경 정보. */
export interface BaseContext {
  /** 기록 시점의 `location.href`. 브라우저 밖에선 빈 문자열. */
  url: string
  /** 빌드/릴리스 버전. 어느 배포에서 난 로그인지 가르는 열쇠. */
  release?: string
  /** 탭 단위 세션 식별자. 로거 인스턴스마다 새로 생성된다. */
  sessionId: string
  /** 앱이 덧붙이는 임의의 컨텍스트. */
  [k: string]: unknown
}

/**
 * 쌓인 레코드의 목적지.
 *
 * IndexedDB(pull) / 원격(push) / console(dev) 모두 같은 인터페이스라,
 * 같은 로거가 환경에 따라 sink만 갈아끼우면 된다.
 */
export interface Sink {
  /** 진단·디버깅에서 sink를 구분하는 이름. */
  name: string
  /**
   * 배치로 들어온 레코드를 기록한다.
   *
   * 절대 throw 하지 말 것. 로깅 실패가 앱을 깨서는 안 된다.
   *
   * @param records 이번 flush에서 모인 레코드. 항상 1개 이상.
   */
  write(records: LogRecord[]): void | Promise<void>
  /** 선택: 탭 종료 시점 등에서 강제 비우기. */
  flush?(): void | Promise<void>
}
