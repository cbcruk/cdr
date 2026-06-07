import type {
  BaseContext,
  DiagEvent,
  LogLevel,
  LogRecord,
  Sink,
} from "./types";
import { makeScrubber, type ScrubOptions, type Scrubber } from "./scrub";

export interface LoggerOptions {
  sinks: Sink[];
  /** 환경 컨텍스트 (release 버전 등). url/sessionId는 자동 채움. */
  context?: Partial<BaseContext>;
  /** flush 주기(ms). 기본 2000. */
  flushIntervalMs?: number;
  /** 한 번에 쌓이는 메모리 버퍼 상한. 넘으면 즉시 flush. 기본 100. */
  maxBufferSize?: number;
  /** 이 레벨 미만은 버린다. 기본 'debug'. */
  minLevel?: LogLevel;
  scrub?: ScrubOptions;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
};

function randomId(): string {
  // crypto가 없는 환경 대비 fallback
  try {
    return crypto.randomUUID();
  } catch {
    return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

export class DiagLogger {
  private sinks: Sink[];
  private scrub: Scrubber;
  private buffer: LogRecord[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly flushIntervalMs: number;
  private readonly maxBufferSize: number;
  private readonly minLevel: number;
  private readonly baseCtx: BaseContext;
  private listenersBound = false;

  constructor(opts: LoggerOptions) {
    this.sinks = opts.sinks;
    this.scrub = makeScrubber(opts.scrub);
    this.flushIntervalMs = opts.flushIntervalMs ?? 2000;
    this.maxBufferSize = opts.maxBufferSize ?? 100;
    this.minLevel = LEVEL_ORDER[opts.minLevel ?? "debug"];
    this.baseCtx = {
      url: typeof location !== "undefined" ? location.href : "",
      sessionId: randomId(),
      ...opts.context,
    };
    this.start();
  }

  /** 진단 이벤트 기록. 동기 호출이고, 실제 쓰기는 비동기 배치로 미뤄진다. */
  log(event: DiagEvent): void {
    const level = event.level ?? "info";
    if (LEVEL_ORDER[level] < this.minLevel) return;

    const record: LogRecord = {
      type: event.type,
      ts: Date.now(),
      level,
      message: event.message ?? "",
      data: event.data ? this.scrub(event.data) : {}, // ← 쓰기 시점 마스킹
      source: event.source ?? "app",
      ctx: { ...this.baseCtx, url: this.currentUrl() },
    };

    this.buffer.push(record);
    if (this.buffer.length >= this.maxBufferSize) void this.flush();
  }

  /** 의미별 헬퍼 — 호출부가 type을 외울 필요 없게. */
  validationBlocked(fields: string[], source = "app") {
    this.log({ type: "validation_blocked", level: "warn", source, data: { fields } });
  }
  schemaMismatch(schema: string, paths: string[], source = "app") {
    this.log({ type: "schema_mismatch", level: "error", source, data: { schema, paths } });
  }
  swallowed(where: string, err?: unknown, source = "app") {
    this.log({ type: "swallowed_exception", level: "error", source, data: { where, err } });
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const batch = this.buffer;
    this.buffer = [];
    await Promise.all(
      this.sinks.map(async (s) => {
        try {
          await s.write(batch);
        } catch {
          // sink 실패가 앱이나 다른 sink를 깨면 안 된다. 조용히 무시.
        }
      }),
    );
  }

  private currentUrl(): string {
    return typeof location !== "undefined" ? location.href : this.baseCtx.url;
  }

  private start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.flush(), this.flushIntervalMs);
    this.bindLifecycle();
  }

  /** 탭 종료/백그라운드 진입 시점에 유실 최소화. */
  private bindLifecycle(): void {
    if (this.listenersBound || typeof addEventListener !== "function") return;
    this.listenersBound = true;
    const onExit = () => {
      void this.flush();
      void Promise.all(this.sinks.map((s) => s.flush?.()));
    };
    addEventListener("pagehide", onExit);
    addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") onExit();
    });
  }

  /** 정리 (테스트/SPA 언마운트용). */
  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    void this.flush();
  }
}
