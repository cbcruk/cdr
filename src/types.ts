/**
 * 침묵하는 "제3의 상태"를 일급 이벤트로 만드는 분류.
 * 자유 문자열이 아니라 유니온이라, 어떤 종류의 사일런트가 존재하는지가
 * 코드로 관리되고 검색·집계 가능해진다.
 */
export type DiagEventType =
  | "validation_blocked" // 검증 실패로 동작을 막았는데 UI가 침묵
  | "schema_mismatch" // 응답이 스키마와 안 맞음 (이번 케이스의 원인)
  | "swallowed_exception" // catch 했지만 표면화 안 됨
  | "silent_early_return" // early return 했는데 사용자 피드백 없음
  | "log"; // 일반 로그 (기존 로거 어댑터 경유분)

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error";

/** 사용자 정의 진단 이벤트. 의미 있는 필드만, 값은 담지 않는 게 원칙. */
export interface DiagEvent {
  type: DiagEventType;
  level?: LogLevel;
  /** 사람이 읽을 짧은 메시지. PHI를 넣지 말 것. */
  message?: string;
  /** 구조화 컨텍스트. scrubber를 거쳐 저장된다. */
  data?: Record<string, unknown>;
  /** 출처 표시 (예: 'pino', 'loglevel', 'app'). */
  source?: string;
}

/** sink에 실제로 저장되는, 메타데이터가 보강된 최종 형태. */
export interface LogRecord extends Required<Pick<DiagEvent, "type">> {
  /** 자동 증가 키 (IDB sink가 채움). 메모리 단계에선 없음. */
  id?: number;
  ts: number; // epoch ms
  level: LogLevel;
  message: string;
  data: Record<string, unknown>;
  source: string;
  /** 매 이벤트에 자동 부착되는 환경 컨텍스트. */
  ctx: BaseContext;
}

export interface BaseContext {
  url: string;
  release?: string; // 빌드/릴리스 버전
  sessionId: string; // 탭 단위 세션 식별자
  [k: string]: unknown;
}

/**
 * sink는 "쌓인 레코드를 어디로 보낼지"만 안다.
 * IndexedDB(pull) / 원격(push) / console(dev) 모두 같은 인터페이스.
 * 같은 로거가 환경에 따라 sink만 갈아끼우면 된다.
 */
export interface Sink {
  name: string;
  /** 배치로 들어온다. 절대 throw 하지 말 것(로깅이 앱을 깨면 안 됨). */
  write(records: LogRecord[]): void | Promise<void>;
  /** 선택: 탭 종료 시점 등에서 강제 비우기. */
  flush?(): void | Promise<void>;
}
