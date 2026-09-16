import type { LogRecord } from 'cdr'

/** 레코드로 읽지 못한 한 줄과 그 이유. */
export interface ParseIssue {
  /** 1부터 세는 줄 번호. */
  line: number
  /** 사람이 읽을 이유. */
  reason: string
}

/** {@linkcode parseNdjson}의 결과. */
export interface ParsedLog {
  /** 읽어낸 레코드. 파일에 나온 순서를 따른다. */
  records: LogRecord[]
  /** 건너뛴 줄. 비어 있으면 파일 전체를 읽었다는 뜻. */
  issues: ParseIssue[]
}
