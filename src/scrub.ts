/** {@linkcode makeScrubber}의 마스킹 정책. */
export interface ScrubOptions {
  /**
   * 키 이름이 이 패턴 중 하나에 걸리면 값 자체를 마스킹한다.
   *
   * 기본값은 password/token/authorization/주민번호/환자·진단/연락처 등
   * 흔한 민감 키를 덮는 내장 목록이다. 지정하면 내장 목록을 대체한다.
   */
  sensitiveKeys?: RegExp[]
  /** `true`면 민감하지 않은 값도 원본 대신 형태 요약으로 치환. 기본 `true`. */
  redactValues?: boolean
  /** 객체 순회 최대 깊이 (순환/거대 객체 방어). 기본 6. */
  maxDepth?: number
}

const DEFAULT_SENSITIVE: RegExp[] = [
  /pass(word)?/i,
  /token/i, // refreshToken/accessToken
  /secret/i,
  /authorization/i,
  /cookie/i,
  /rrn|주민|socialsecurity|ssn/i,
  /patient|환자|diagnos|진단|chart|차트/i,
  /phone|tel|전화|email|mail|주소|address/i,
  /card|account|계좌/i,
]

const MASK = '‹masked›'

/** 값을 노출하지 않으면서 형태만 보여주는 요약. */
function summarize(v: unknown): unknown {
  if (v === null) return null
  switch (typeof v) {
    case 'string':
      return `‹string:${v.length}›`
    case 'number':
      return Number.isFinite(v) ? '‹number›' : `‹number:${String(v)}›`
    case 'boolean':
      return v // boolean은 보통 안전하고 분기 디버깅에 유용
    case 'bigint':
      return '‹bigint›'
    case 'undefined':
      return undefined
    default:
      return '‹value›'
  }
}

/**
 * 쓰기 시점 스크러버를 만든다.
 *
 * 원칙: 디버깅에 필요한 건 "어느 필드가 어떤 모양으로 잘못됐나"이지
 * "그 값이 무엇이었나"가 아니다. 그래서 민감 키는 값을 지우고, 그 외 값도
 * 기본적으로 타입/형태로 축약한다.
 *
 * 병원 앱처럼 on-device여도 export로 결국 밖에 나갈 수 있으므로 저장 자체를
 * 안전하게 만든다. `DiagLogger`는 이 함수를 내부에서 호출하므로, 보통은
 * `LoggerOptions.scrub`에 옵션만 넘기면 된다.
 *
 * `Error`는 디버깅의 핵심이라 구조(`name`/`stack` 앞 8줄)를 보존하되
 * `message`는 `redactValues`가 켜져 있으면 지운다. 순환 참조와 `maxDepth`
 * 초과 지점은 각각 `'‹circular›'`, `'‹depth-limit›'` 표식으로 남고,
 * 배열은 앞 50개까지만 순회한다.
 *
 * @param opts 마스킹 정책. 생략하면 전부 기본값.
 * @returns 객체를 같은 모양으로 마스킹해 돌려주는 함수. 원본은 건드리지 않는다.
 *
 * @example 기본 정책으로 마스킹
 * ```ts
 * import { makeScrubber } from 'cdr'
 *
 * const scrub = makeScrubber()
 * scrub({ userId: 'u_123', accessToken: 'abc' })
 * // { userId: '‹string:5›', accessToken: '‹masked›' }
 * ```
 *
 * @example 값은 남기고 민감 키만 가리기
 * ```ts
 * import { makeScrubber } from 'cdr'
 *
 * const scrub = makeScrubber({ redactValues: false })
 * scrub({ page: 3, password: 'hunter2' })
 * // { page: 3, password: '‹masked›' }
 * ```
 */
export function makeScrubber(opts: ScrubOptions = {}) {
  const sensitive = opts.sensitiveKeys ?? DEFAULT_SENSITIVE
  const redactValues = opts.redactValues ?? true
  const maxDepth = opts.maxDepth ?? 6

  const isSensitive = (key: string) => sensitive.some((re) => re.test(key))

  function walk(value: unknown, depth: number, seen: WeakSet<object>): unknown {
    if (depth > maxDepth) return '‹depth-limit›'

    if (Array.isArray(value)) {
      return value.slice(0, 50).map((v) => walk(v, depth + 1, seen))
    }

    if (value && typeof value === 'object') {
      if (seen.has(value as object)) return '‹circular›'
      seen.add(value as object)

      // Error는 디버깅 핵심이므로 구조를 보존하되 message는 redact 대상으로
      if (value instanceof Error) {
        return {
          name: value.name,
          message: redactValues ? '‹redacted›' : value.message,
          stack: value.stack?.split('\n').slice(0, 8).join('\n'),
        }
      }

      const out: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (isSensitive(k)) out[k] = MASK
        else if (v && typeof v === 'object') out[k] = walk(v, depth + 1, seen)
        else out[k] = redactValues ? summarize(v) : v
      }
      return out
    }

    // 원시값: redactValues면 형태만
    return redactValues ? summarize(value) : value
  }

  /**
   * 객체를 마스킹한다.
   *
   * @template T 입력 객체 타입. 반환값은 같은 타입으로 다루되, 실제 값은
   * 마스킹된 문자열로 바뀌어 있다.
   * @param data 마스킹할 객체.
   * @returns 같은 키 구조의 새 객체.
   */
  return function scrub<T extends Record<string, unknown>>(data: T): T {
    return walk(data, 0, new WeakSet()) as T
  }
}

/** {@linkcode makeScrubber}가 반환하는 마스킹 함수. */
export type Scrubber = ReturnType<typeof makeScrubber>
