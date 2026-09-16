import type { LogLevel } from 'cdr'

/** 화면에서 고른 거르기 조건. */
export interface ViewState {
  /** 켜 둔 레벨. */
  levels: Set<LogLevel>
  /** 메시지 부분 일치 검색어. 비어 있으면 적용하지 않는다. */
  text: string
}
