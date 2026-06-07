import type { LogLevel, LogRecord } from "./types";

/**
 * /log 라우트용 내보내기 유틸.
 *
 * 핵심: /log의 진짜 가치는 "보는 것"보다 "내보내는 것"이다.
 * HAR 추출("F12 → 우클릭 → Save as HAR")을 대체하는 지점.
 * 지원 담당자에게는 "‹/log› 가서 내보내기 눌러서 보내주세요" 한 줄로 끝.
 *
 * 이미 scrubber를 거쳐 저장된 레코드라 export해도 PHI는 빠져 있다.
 */

export interface LogFilter {
  levels?: LogLevel[];
  types?: string[];
  since?: number; // epoch ms
  until?: number;
  text?: string; // message 부분 일치
}

export function filterLogs(records: LogRecord[], f: LogFilter = {}): LogRecord[] {
  return records.filter((r) => {
    if (f.levels && !f.levels.includes(r.level)) return false;
    if (f.types && !f.types.includes(r.type)) return false;
    if (f.since && r.ts < f.since) return false;
    if (f.until && r.ts > f.until) return false;
    if (f.text && !r.message.toLowerCase().includes(f.text.toLowerCase())) return false;
    return true;
  });
}

/** 한 줄당 한 레코드(NDJSON). 대용량에 강하고 스트림 처리에 유리. */
export function toNdjson(records: LogRecord[]): string {
  return records.map((r) => JSON.stringify(r)).join("\n");
}

/** 사람이 빠르게 훑기 좋은 평문. */
export function toPlainText(records: LogRecord[]): string {
  return records
    .map((r) => {
      const t = new Date(r.ts).toISOString();
      const data = Object.keys(r.data).length ? ` ${JSON.stringify(r.data)}` : "";
      return `${t} [${r.level}] (${r.type}) ${r.message}${data}`;
    })
    .join("\n");
}

/** 파일 다운로드 트리거. */
export function downloadLogs(records: LogRecord[], format: "ndjson" | "txt" = "ndjson"): void {
  const content = format === "ndjson" ? toNdjson(records) : toPlainText(records);
  const blob = new Blob([content], {
    type: format === "ndjson" ? "application/x-ndjson" : "text/plain",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `cdr-${new Date().toISOString().slice(0, 19)}.${format}`;
  a.click();
  URL.revokeObjectURL(url);
}

/** 클립보드 복사 (담당자에게 메신저로 붙여넣기 좋게). */
export async function copyLogs(
  records: LogRecord[],
  format: "ndjson" | "txt" = "txt",
): Promise<void> {
  const content = format === "ndjson" ? toNdjson(records) : toPlainText(records);
  await navigator.clipboard.writeText(content);
}
