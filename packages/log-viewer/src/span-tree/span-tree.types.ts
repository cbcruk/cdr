import type { LogRecord } from 'cdr'

/** 하나의 span과 그 안에서 기록된 레코드. */
export interface SpanNode {
  /** 레코드의 `ctx.span_id`. */
  spanId: string
  /** 이 span에서 직접 기록된 레코드. 시각순. */
  records: LogRecord[]
  /** `parent_id`로 이 span을 가리키는 span. 처음 기록된 시각순. */
  children: SpanNode[]
}

/** 최상위 `trace()` 하나로 묶인 span들. */
export interface TraceNode {
  /** 레코드의 `ctx.trace_id`. */
  traceId: string
  /** 부모가 없는 span. 보통 하나다. */
  roots: SpanNode[]
}

/** 로거 인스턴스(한 번의 페이지 로드) 하나에서 나온 레코드. */
export interface SessionNode {
  /** 레코드의 `ctx.sessionId`. */
  sessionId: string
  /** 이 세션의 trace. 처음 기록된 시각순. */
  traces: TraceNode[]
  /** 어떤 `trace()`에도 속하지 않은 레코드. 시각순. */
  unattributed: LogRecord[]
}
