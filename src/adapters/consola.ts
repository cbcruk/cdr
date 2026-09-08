import type { DiagLogger } from '../logger'
import type { LogLevel } from '../types'

/**
 * consola에 덧붙일 reporter를 만들어 로그 한 부를 로거로 흘려보낸다.
 *
 * consola는 reporters 배열로 출력을 확장한다. 기본 reporter를 지우지 않고
 * `addReporter`로 "한 부 더 받는" reporter를 추가하면 콘솔 출력은 그대로
 * 유지된다.
 *
 * @param diag 레코드를 받을 로거.
 * @returns `consola.addReporter`에 그대로 넣을 reporter.
 *
 * @example consola에 연결
 * ```ts
 * import { consola } from 'consola'
 * import { consolaReporter, setupDiagLogger } from 'cdr'
 *
 * const { diag } = setupDiagLogger()
 * consola.addReporter(consolaReporter(diag))
 * ```
 */
export function consolaReporter(diag: DiagLogger) {
  return {
    log(logObj: ConsolaLogObject) {
      diag.log({
        type: 'log',
        level: normalizeLevel(logObj.type, logObj.level),
        message: typeof logObj.args?.[0] === 'string' ? logObj.args[0] : '',
        data: { tag: logObj.tag, args: logObj.args },
        source: 'consola',
      })
    },
  }
}

/** consola가 reporter에 넘기는 로그 객체 중 우리가 쓰는 부분. */
interface ConsolaLogObject {
  /** 로깅 종류 (`'info'` | `'warn'` | `'error'` | `'debug'` | `'success'` …). */
  type: string
  /** consola가 매긴 숫자 레벨. */
  level: number
  /** `withTag`로 붙인 태그. */
  tag?: string
  /** 로깅 메서드에 넘긴 인자들. */
  args?: unknown[]
}

function normalizeLevel(type: string, _level: number): LogLevel {
  switch (type) {
    case 'error':
    case 'fatal':
      return 'error'
    case 'warn':
      return 'warn'
    case 'debug':
    case 'trace':
      return 'debug'
    default:
      return 'info'
  }
}
