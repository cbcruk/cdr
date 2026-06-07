# diaglog

사용자 기기에 진단 로그를 보존하고(IndexedDB), 필요 시 사용자가 `/log`에서
직접 내보내는 **pull 모델** 클라이언트 로거. 병원 내부망처럼 outbound가
막힌 환경에서도 동작하며, 기존 로깅 라이브러리(pino · loglevel · consola)에
**기존 console 출력을 건드리지 않고** 얹는다.

## 왜 pull 모델인가

Sentry/OpenReplay 같은 도구는 전부 **push**다 — 클라이언트가 outbound로
텔레메트리를 쏴야 작동한다. 내부망이 그 outbound를 막으면 무력화된다.
diaglog는 기기 안에 쌓다가 사용자가 열어보거나 내보낸다. 망 정책과 무관하다.
그리고 데이터·통제권이 사용자에게 있다.

```
DiagEvent ──→ [scrub] ──→ ┬─→ IdbSink      (pull: /log, 망 제약 무관)
                          ├─→ ConsoleSink  (dev)
                          └─→ (원격 sink)   (push: 망 되면 추가)
```

같은 로거에 sink만 갈아끼우면 push/pull 둘 다 된다.

## 빠른 시작

```ts
import { setupDiagLogger } from "./diaglog/src";

export const { diag, idbSink } = setupDiagLogger({
  release: import.meta.env.VITE_BUILD_ID,
  maxRecords: 5000, // 이 개수 넘으면 오래된 것부터 삭제
  dev: import.meta.env.DEV, // dev면 console에도 출력
});
```

## 핵심: "침묵하는 제3의 상태"를 기록

성공도 실패(throw)도 아닌, **조용히 막힌** 상태가 사일런트 에러의 정체다.
이걸 일급 이벤트로 올린다.

```ts
function handleSubmit() {
  const result = schema.safeParse(formData);
  if (!result.success) {
    setFieldErrors(mapZodIssuesToFields(result.error.issues)); // 1) 사용자에게
    diag.validationBlocked(result.error.issues.map((i) => i.path.join("."))); // 2) 시스템에
    return;
  }
  await callApi(result.data);
}
```

`data`는 저장 전 scrubber를 거치므로, 필드 *경로*는 남고 *값*은 남지 않는다.

## 기존 로거와 연동 (non-destructive)

세 어댑터 모두 원본 console 출력은 유지하고 sink에 **한 부 더** 복사한다.

### pino (browser)

```ts
import pino from "pino";
import { pinoTransmit } from "./diaglog/src";

const logger = pino({
  browser: { transmit: pinoTransmit(diag, "info") }, // warn 이상만 보존하려면 "warn"
});
```

`transmit.send`는 `browser.write`(콘솔 출력)와 분리돼 있어 출력은 그대로다.

### loglevel

```ts
import log from "loglevel";
import { attachLoglevel } from "./diaglog/src";

attachLoglevel(log, diag); // methodFactory를 래핑 후 rebuild
```

### consola

```ts
import { consola } from "consola";
import { consolaReporter } from "./diaglog/src";

consola.addReporter(consolaReporter(diag)); // 기본 reporter 유지한 채 추가
```

## `/log` 라우트 — HAR 추출의 대체

`/log`의 진짜 가치는 뷰어가 아니라 **내보내기**다.
"F12 → 우클릭 → Save as HAR" 대신 "`/log` 가서 내보내기" 한 줄.

```ts
import { filterLogs, downloadLogs, copyLogs } from "./diaglog/src";

const records = await idbSink.read(2000); // 최신순
const filtered = filterLogs(records, { levels: ["warn", "error"] });

downloadLogs(filtered, "ndjson"); // 파일로
await copyLogs(filtered, "txt"); // 클립보드로 (메신저 붙여넣기용)
await idbSink.clear(); // 사용자가 직접 비우기
```

## 설계 노트

- **배치 flush**: 매 로그가 아니라 메모리 버퍼에 모았다가 주기적으로/버퍼
  초과 시/`pagehide` 시점에 한 트랜잭션으로 쓴다. 메인 스레드 부담 최소화.
- **rotation**: IndexedDB는 자동 삭제가 없다. count 기반으로 `maxRecords`
  초과분을 오래된 순서로 직접 삭제한다.
- **PHI**: scrubber가 쓰기 시점에 동작. on-device여도 export로 결국 나갈 수
  있으니 저장 자체를 안전하게 만든다. `token` 키도 기본 마스킹 대상이다.
- **sink는 throw하지 않는다**: 로깅이 앱이나 다른 sink를 깨면 안 된다.

## 주의

- **공유 워크스테이션**: 여러 직원이 한 단말을 쓰면 `/log`가 남의 진료
  컨텍스트를 보일 수 있다. 로그아웃 시 `idbSink.clear()` 호출 등 정책 필요.
- 어댑터의 `data.args`/`messages`는 원본 로깅 인자를 담는다. 기존 코드가
  민감값을 직접 로깅 중이면 scrubber 패턴(`sensitiveKeys`)을 보강할 것.

## 개발

[Vite+](https://viteplus.dev) 통합 툴체인을 쓴다. `vp` CLI 설치:
`curl -fsSL https://vite.plus | bash`

```bash
vp install
vp test       # jsdom + fake-indexeddb
vp check      # oxfmt + oxlint + type check
vp pack       # 라이브러리 빌드 → dist/ (esm + d.ts)
```

소스 구조:

```
src/
  index.ts          # public API + setupDiagLogger
  logger.ts         # DiagLogger (배치 버퍼 · 라이프사이클 flush)
  scrub.ts          # 쓰기 시점 스크러버
  export.ts         # filter / ndjson / txt / download / copy
  types.ts          # DiagEvent · LogRecord · Sink
  sinks/            # idb (pull) · console (dev)
  adapters/         # pino · loglevel · consola (non-destructive)
```

`pino`·`loglevel`·`consola`는 optional peerDependencies다. 쓰는 어댑터의
패키지만 설치하면 된다.
