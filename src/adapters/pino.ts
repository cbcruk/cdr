import type { DiagLogger } from "../logger";
import type { LogLevel } from "../types";

/**
 * pino (browser) 어댑터.
 *
 * pino는 browser.transmit.send(level, logEvent) 로 "원격 기록용" 훅을 연다.
 * 이건 console 출력(browser.write)과 완전히 분리돼 있어서,
 * DevTools 출력은 그대로 두고 우리 IDB sink에 한 부 더 흘려보낼 수 있다.
 *
 * 사용:
 *   import pino from "pino";
 *   const logger = pino({ browser: { transmit: pinoTransmit(diag) } });
 *
 * transmit.level로 "이 레벨 이상만 보존"을 pino 쪽에서 거를 수도 있다.
 */
export function pinoTransmit(diag: DiagLogger, level: LogLevel = "info") {
  return {
    level,
    send(lvl: string, logEvent: PinoLogEvent) {
      diag.log({
        type: "log",
        level: normalizeLevel(lvl),
        // logEvent.messages = 로깅 메서드에 넘긴 인자들. 첫 문자열을 message로.
        message: extractMessage(logEvent),
        data: { bindings: logEvent.bindings, messages: logEvent.messages },
        source: "pino",
      });
    },
  };
}

interface PinoLogEvent {
  ts: number;
  messages: unknown[];
  bindings: unknown[];
  level: { label: string; value: number };
}

function extractMessage(e: PinoLogEvent): string {
  const first = e.messages?.[0];
  return typeof first === "string" ? first : "";
}

function normalizeLevel(l: string): LogLevel {
  switch (l) {
    case "fatal":
    case "error":
      return "error";
    case "warn":
      return "warn";
    case "debug":
      return "debug";
    case "trace":
      return "trace";
    default:
      return "info";
  }
}
