import type { DiagLogger } from '../logger'
import type { LogLevel } from '../types'

/**
 * pino(browser)의 `transmit` 훅을 만들어 로그 한 부를 로거로 흘려보낸다.
 *
 * pino는 `browser.transmit.send(level, logEvent)`로 "원격 기록용" 훅을 연다.
 * 이건 console 출력(`browser.write`)과 완전히 분리돼 있어서, DevTools 출력은
 * 그대로 두고 우리 sink에 한 부 더 보낼 수 있다.
 *
 * @param diag 레코드를 받을 로거.
 * @param level 이 레벨 이상만 전달하도록 pino 쪽에서 거른다. 기본 `'info'`.
 * @returns pino의 `browser.transmit`에 그대로 넣을 객체.
 *
 * @example pino에 연결
 * ```ts
 * import pino from 'pino'
 * import { pinoTransmit, setupDiagLogger } from 'cdr'
 *
 * const { diag } = setupDiagLogger()
 * const logger = pino({ browser: { transmit: pinoTransmit(diag) } })
 *
 * logger.error('결제 응답이 스키마와 다름')
 * ```
 */
export function pinoTransmit(diag: DiagLogger, level: LogLevel = 'info') {
  return {
    level,
    send(lvl: string, logEvent: PinoLogEvent) {
      diag.log({
        type: 'log',
        level: normalizeLevel(lvl),
        // logEvent.messages = 로깅 메서드에 넘긴 인자들. 첫 문자열을 message로.
        message: extractMessage(logEvent),
        data: { bindings: logEvent.bindings, messages: logEvent.messages },
        source: 'pino',
      })
    },
  }
}

/** pino가 `transmit.send`에 넘기는 로그 이벤트 중 우리가 쓰는 부분. */
interface PinoLogEvent {
  /** 기록 시각 (epoch ms). */
  ts: number
  /** 로깅 메서드에 넘긴 인자들. */
  messages: unknown[]
  /** 자식 로거들이 누적한 바인딩. */
  bindings: unknown[]
  /** pino가 매긴 레벨. */
  level: { label: string; value: number }
}

function extractMessage(e: PinoLogEvent): string {
  const first = e.messages?.[0]
  return typeof first === 'string' ? first : ''
}

function normalizeLevel(l: string): LogLevel {
  switch (l) {
    case 'fatal':
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
