import type { ParsedLog } from '../parse-ndjson/parse-ndjson.types.ts'

/** {@linkcode createLogViewer}에 넘기는 설정. */
export interface LogViewerOptions {
  /** 열어 볼 NDJSON 파일 경로. 상대 경로면 현재 작업 디렉터리 기준. */
  file: string
}

/** `load-log` RPC가 돌려주는, 파일 하나를 읽은 결과. */
export interface LoadedLog extends ParsedLog {
  /** 화면 제목에 쓸 파일 이름. 경로는 뺀다. */
  fileName: string
}
