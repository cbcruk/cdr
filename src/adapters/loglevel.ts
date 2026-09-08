import type { DiagLogger } from '../logger'
import type { LogLevel } from '../types'

/**
 * loglevel의 `methodFactory`를 래핑해 로그 한 부를 로거로 흘려보낸다.
 *
 * loglevel은 `methodFactory`를 redefine해서 plugin을 만든다. 권장 패턴은
 * "원본 factory를 래핑" — 그래야 console 출력의 신뢰성/기능을 잃지 않고,
 * 우리는 한 부를 더 가져갈 뿐이다(non-destructive).
 *
 * @param log loglevel 루트 로거 또는 `getLogger()`로 만든 자식 로거.
 * @param diag 레코드를 받을 로거.
 * @returns `methodFactory`를 원래대로 되돌리는 함수. 테스트나 해제에 쓴다.
 *
 * @example loglevel에 연결하고 나중에 해제
 * ```ts
 * import log from 'loglevel'
 * import { attachLoglevel, setupDiagLogger } from 'cdr'
 *
 * const { diag } = setupDiagLogger()
 * const detach = attachLoglevel(log, diag)
 *
 * log.warn('조용히 막힌 제출')
 * detach()
 * ```
 */
export function attachLoglevel(log: LoglevelLogger, diag: DiagLogger): () => void {
  const original = log.methodFactory

  log.methodFactory = (methodName, logLevel, loggerName) => {
    const raw = original(methodName, logLevel, loggerName)
    return (...args: unknown[]) => {
      raw(...args) // 1) 원본 console 출력 유지
      diag.log({
        // 2) sink에 복사
        type: 'log',
        level: normalizeLevel(methodName),
        message: typeof args[0] === 'string' ? args[0] : '',
        data: { args, logger: String(loggerName ?? '') },
        source: 'loglevel',
      })
    }
  }

  log.rebuild() // methodFactory 교체 후 필수

  // 원복 함수 반환 (테스트/해제용)
  return () => {
    log.methodFactory = original
    log.rebuild()
  }
}

/** {@linkcode attachLoglevel}이 기대하는 loglevel 로거의 최소 형태. */
interface LoglevelLogger {
  /** 레벨별 로깅 함수를 만들어 내는 팩토리. 교체해서 plugin을 만든다. */
  methodFactory: MethodFactory
  /** 교체한 `methodFactory`를 실제 메서드에 반영한다. */
  rebuild(): void
}

/**
 * loglevel이 레벨별 로깅 함수를 만들 때 쓰는 팩토리 시그니처.
 *
 * 매개변수 타입은 loglevel의 `MethodFactory`와 그대로 맞춘다. 더 넓게 잡으면
 * (예: `methodName: string`) 실제 로거를 {@linkcode attachLoglevel}에 넘길 때
 * 반공변성 때문에 대입이 거부된다.
 *
 * @param methodName 만들 로깅 메서드 이름.
 * @param logLevel loglevel의 숫자 레벨 (0=trace … 4=error, 5=silent).
 * @param loggerName `getLogger()`에 준 이름. 루트 로거면 심볼.
 */
type MethodFactory = (
  methodName: LogLevel,
  logLevel: 0 | 1 | 2 | 3 | 4 | 5,
  loggerName: string | symbol,
) => (...args: unknown[]) => void

function normalizeLevel(method: string): LogLevel {
  switch (method) {
    case 'error':
      return 'error'
    case 'warn':
      return 'warn'
    case 'debug':
      return 'debug'
    case 'trace':
      return 'trace'
    default:
      return 'info'
  }
}
