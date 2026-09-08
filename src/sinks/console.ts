import type { LogRecord, Sink } from '../types'

/**
 * 레코드를 브라우저 콘솔에 그대로 찍는 sink.
 *
 * dev 전용이다. prod에선 {@linkcode IdbSink}만 두는 게 보통이고,
 * {@linkcode setupDiagLogger}는 `dev: true`일 때만 이걸 끼운다.
 *
 * 레벨에 따라 `console.error`/`console.warn`/`console.log`로 나뉜다.
 */
export class ConsoleSink implements Sink {
  /** sink 이름. 항상 `'console'`. */
  readonly name = 'console'

  /**
   * 배치를 한 줄씩 콘솔에 출력한다.
   *
   * @param records 출력할 레코드.
   */
  write(records: LogRecord[]): void {
    for (const r of records) {
      const fn =
        r.level === 'error' ? console.error : r.level === 'warn' ? console.warn : console.log
      fn(`[diag:${r.type}]`, r.message, r.data)
    }
  }
}
