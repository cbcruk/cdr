import type { DiagLogger } from '../logger'
import type { LogLevel } from '../types'

/**
 * consola 어댑터.
 *
 * consola는 reporters 배열로 출력을 확장한다. 기본 reporter를 지우지 않고
 * addReporter로 "한 부 더 받는" reporter를 추가하면 콘솔 출력은 유지된다.
 *
 * 사용:
 *   import { consola } from "consola";
 *   consola.addReporter(consolaReporter(diag));
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

interface ConsolaLogObject {
  type: string // 'info' | 'warn' | 'error' | 'debug' | 'success' ...
  level: number
  tag?: string
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
