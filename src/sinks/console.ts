import type { LogRecord, Sink } from "../types";

/** dev 전용. prod에선 IdbSink만 두는 게 보통. */
export class ConsoleSink implements Sink {
  readonly name = "console";
  write(records: LogRecord[]): void {
    for (const r of records) {
      const fn =
        r.level === "error" ? console.error
        : r.level === "warn" ? console.warn
        : console.log;
      fn(`[diag:${r.type}]`, r.message, r.data);
    }
  }
}
