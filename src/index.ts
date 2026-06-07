import { DiagLogger, type LoggerOptions } from "./logger";
import { IdbSink, type IdbSinkOptions } from "./sinks/idb";
import { ConsoleSink } from "./sinks/console";

export { DiagLogger } from "./logger";
export type { LoggerOptions } from "./logger";
export { IdbSink } from "./sinks/idb";
export type { IdbSinkOptions } from "./sinks/idb";
export { ConsoleSink } from "./sinks/console";
export { makeScrubber } from "./scrub";
export type { ScrubOptions, Scrubber } from "./scrub";

export * from "./types";
export * from "./export";

// adapters
export { pinoTransmit } from "./adapters/pino";
export { attachLoglevel } from "./adapters/loglevel";
export { consolaReporter } from "./adapters/consola";

/**
 * 가장 흔한 구성을 한 번에 세우는 편의 팩토리.
 *
 *  - prod: IndexedDB만 (pull 모델, 망 제약 무관)
 *  - dev:  + console
 *
 * 더 세밀하게 제어하려면 DiagLogger를 직접 생성하고 sinks를 조립할 것.
 * idbSink를 반환하므로 /log 라우트에서 read()/clear()에 그대로 쓴다.
 */
export interface SetupOptions {
  release?: string;
  maxRecords?: number;
  dev?: boolean;
  idb?: IdbSinkOptions;
  logger?: Partial<Omit<LoggerOptions, "sinks">>;
}

export function setupDiagLogger(opts: SetupOptions = {}): {
  diag: DiagLogger;
  idbSink: IdbSink;
} {
  const idbSink = new IdbSink({
    maxRecords: opts.maxRecords ?? 5000,
    ...opts.idb,
  });

  const sinks = opts.dev ? [idbSink, new ConsoleSink()] : [idbSink];

  const diag = new DiagLogger({
    sinks,
    context: { release: opts.release },
    ...opts.logger,
  });

  return { diag, idbSink };
}
