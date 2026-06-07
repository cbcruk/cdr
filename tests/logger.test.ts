import { afterEach, describe, expect, it } from "vite-plus/test";
import { DiagLogger } from "../src/logger";
import type { LogRecord, Sink } from "../src/types";

class MemorySink implements Sink {
  readonly name = "memory";
  records: LogRecord[] = [];
  write(records: LogRecord[]): void {
    this.records.push(...records);
  }
}

let logger: DiagLogger | null = null;

afterEach(() => {
  logger?.dispose();
  logger = null;
});

describe("DiagLogger", () => {
  it("buffers events and flushes them to sinks", async () => {
    const sink = new MemorySink();
    logger = new DiagLogger({ sinks: [sink] });

    logger.log({ type: "log", message: "hello" });
    expect(sink.records).toHaveLength(0);

    await logger.flush();
    expect(sink.records).toHaveLength(1);
    expect(sink.records[0]?.message).toBe("hello");
  });

  it("auto-flushes when the buffer exceeds maxBufferSize", async () => {
    const sink = new MemorySink();
    logger = new DiagLogger({ sinks: [sink], maxBufferSize: 2 });

    logger.log({ type: "log", message: "a" });
    logger.log({ type: "log", message: "b" });
    await Promise.resolve();
    await Promise.resolve();

    expect(sink.records.length).toBeGreaterThanOrEqual(2);
  });

  it("drops events below minLevel", async () => {
    const sink = new MemorySink();
    logger = new DiagLogger({ sinks: [sink], minLevel: "warn" });

    logger.log({ type: "log", level: "info", message: "skip" });
    logger.log({ type: "log", level: "error", message: "keep" });
    await logger.flush();

    expect(sink.records).toHaveLength(1);
    expect(sink.records[0]?.message).toBe("keep");
  });

  it("scrubs data values at write time", async () => {
    const sink = new MemorySink();
    logger = new DiagLogger({ sinks: [sink] });

    logger.log({ type: "log", data: { token: "secret", name: "Alice" } });
    await logger.flush();

    expect(sink.records[0]?.data.token).toBe("‹masked›");
    expect(sink.records[0]?.data.name).toBe("‹string:5›");
  });

  it("attaches base context (sessionId, url) to every record", async () => {
    const sink = new MemorySink();
    logger = new DiagLogger({ sinks: [sink], context: { release: "1.2.3" } });

    logger.log({ type: "log", message: "x" });
    await logger.flush();

    const ctx = sink.records[0]?.ctx;
    expect(ctx?.release).toBe("1.2.3");
    expect(typeof ctx?.sessionId).toBe("string");
  });

  it("maps semantic helpers to typed events", async () => {
    const sink = new MemorySink();
    logger = new DiagLogger({ sinks: [sink] });

    logger.validationBlocked(["email", "name"]);
    logger.schemaMismatch("UserResponse", ["data.id"]);
    await logger.flush();

    expect(sink.records[0]?.type).toBe("validation_blocked");
    expect(sink.records[0]?.level).toBe("warn");
    expect(sink.records[1]?.type).toBe("schema_mismatch");
    expect(sink.records[1]?.level).toBe("error");
  });

  it("does not let a throwing sink break other sinks", async () => {
    const good = new MemorySink();
    const bad: Sink = {
      name: "bad",
      write() {
        throw new Error("sink failure");
      },
    };
    logger = new DiagLogger({ sinks: [bad, good] });

    logger.log({ type: "log", message: "x" });
    await expect(logger.flush()).resolves.toBeUndefined();
    expect(good.records).toHaveLength(1);
  });
});
