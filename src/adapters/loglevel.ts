import type { DiagLogger } from "../logger";
import type { LogLevel } from "../types";

/**
 * loglevel 어댑터.
 *
 * loglevel은 methodFactory를 redefine해서 plugin을 만든다.
 * 권장 패턴은 "원본 factory를 래핑" — 그래야 console 출력의 신뢰성/기능을
 * 잃지 않고, 우리는 한 부를 더 가져갈 뿐이다(non-destructive).
 *
 * 사용:
 *   import log from "loglevel";
 *   attachLoglevel(log, diag);
 *
 * @param log loglevel 루트 로거 또는 getLogger()로 만든 자식 로거
 */
export function attachLoglevel(
  log: LoglevelLogger,
  diag: DiagLogger,
): () => void {
  const original = log.methodFactory;

  log.methodFactory = (methodName, logLevel, loggerName) => {
    const raw = original(methodName, logLevel, loggerName);
    return (...args: unknown[]) => {
      raw(...args); // 1) 원본 console 출력 유지
      diag.log({
        // 2) sink에 복사
        type: "log",
        level: normalizeLevel(methodName),
        message: typeof args[0] === "string" ? args[0] : "",
        data: { args, logger: String(loggerName ?? "") },
        source: "loglevel",
      });
    };
  };

  log.rebuild(); // methodFactory 교체 후 필수

  // 원복 함수 반환 (테스트/해제용)
  return () => {
    log.methodFactory = original;
    log.rebuild();
  };
}

interface LoglevelLogger {
  methodFactory: MethodFactory;
  rebuild(): void;
}
type MethodFactory = (
  methodName: string,
  logLevel: number,
  loggerName: string | symbol,
) => (...args: unknown[]) => void;

function normalizeLevel(method: string): LogLevel {
  switch (method) {
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
