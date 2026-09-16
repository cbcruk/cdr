# cdr log viewer

사용자가 `/log`에서 내보낸 NDJSON 파일을 **받는 쪽**에서 여는 로컬 도구.
[Devframe](https://devfra.me) 위에 만들었다.

레코드의 `ctx.trace_id` / `span_id` / `parent_id`로 span 트리를 다시 세우고,
`ctx.sessionId`로 탭·새로고침 단위를 나눈다. span 식별자는 문서 하나 안에서만
유일하기 때문이다.

> PoC. 워크스페이스 안에서만 쓰고, npm에 올리지 않는다(`private`).

## 사용

Node 22.18 이상(TypeScript를 그대로 실행한다). 먼저 화면을 한 번 빌드한다.

```bash
pnpm -C packages/log-viewer build
```

### 로컬 서버로 보기

```bash
pnpm -C packages/log-viewer start ~/Downloads/cdr-2026-09-16T09-00-00.ndjson
# → http://localhost:9998
```

`--port`, `--host`(기본 `127.0.0.1`), `--no-open`을 받는다. 인증 게이트는 꺼져
있으므로 루프백 밖으로 열지 말 것.

### 정적 리포트로 굽기

```bash
pnpm -C packages/log-viewer start ~/Downloads/cdr-export.ndjson --out-dir ~/cdr-report
```

`pnpm -C`는 작업 디렉터리를 패키지로 옮기므로 상대 경로는 `packages/log-viewer` 기준이 된다.
절대 경로를 쓰는 편이 안전하다.

결과 디렉터리는 서버 없이 어떤 정적 호스팅에서도, 어떤 하위 경로에서도 열린다.
파일 내용이 `__rpc-dump/`에 그대로 들어가니, 이슈 첨부 전에 내용을 확인할 것.
cdr은 쓰기 시점에 마스킹하지만 앱이 `data`에 무엇을 넣었는지까지 보장하지는 않는다.

## 화면

- 레벨 칩(개수 포함)과 메시지 검색. 거르기는 `cdr`의 `filterLogs`를 그대로 쓴다.
- 세션 → trace → span 트리. 점 색은 그 span과 자손 중 가장 높은 레벨.
- 레코드를 남기지 않은 부모 span도 자식의 `parent_id`로 자리를 만든다.
- 어느 `trace()`에도 속하지 않은 레코드는 `unattributed`로 모은다.
- 읽지 못한 줄은 버리지 않고 줄 번호와 이유를 보여 준다.

## 구조

| 경로               | 역할                                                   |
| ------------------ | ------------------------------------------------------ |
| `src/parse-ndjson` | NDJSON → `LogRecord[]` + 건너뛴 줄                     |
| `src/span-tree`    | 레코드 → 세션/trace/span 트리 (순수 함수)              |
| `src/log-viewer`   | `defineDevframe` 정의. `load-log`는 `static` RPC       |
| `src/cli.ts`       | `createDevServer` / `createBuild`를 고르는 CLI         |
| `app/`             | 브라우저 화면. `connectDevframe()`으로 `load-log` 호출 |

`load-log`가 `static`이라 dev에서는 WebSocket으로, 정적 빌드에서는 덤프 파일로
같은 코드가 동작한다.

## 개발

```bash
pnpm -C packages/log-viewer test       # 파서·트리·정적 빌드 덤프
pnpm -C packages/log-viewer typecheck
```

루트 `pnpm test`에는 포함되지 않는다(루트는 jsdom 환경이라). CI는 따로 돌린다.
