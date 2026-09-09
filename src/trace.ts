import {
  configure,
  spanContext as readSpanContext,
  trace as runInSpan,
} from '@cbcruk/console-trace'

/**
 * 사용자 동작 하나를 span 하나로 묶는다.
 *
 * 이 안에서 기록된 레코드는 같은 `trace_id`를 달고 나오고, 중첩된 `trace`는
 * `parent_id`로 이어진다. 배선은 `setupDiagLogger`에 `trace: true`를 주면
 * 자동으로 된다.
 *
 * 콜백의 반환값을 그대로 돌려준다. 추적이 꺼져 있으면 콜백만 호출하고
 * 아무것도 만들지 않으므로, 호출부를 조건부로 감쌀 필요가 없다.
 *
 * @param name 동작 이름. 내보낸 파일에 그대로 남으니 값이 아니라 이름을 쓸 것.
 * @param fn 이 동작으로 묶을 작업.
 *
 * @example
 * ```ts
 * import { setupDiagLogger, trace } from 'cdr'
 *
 * const { diag } = setupDiagLogger({ trace: true })
 *
 * trace('form.submit', () => {
 *   diag.validationBlocked(['email'])
 * })
 * ```
 */
export function trace<T>(name: string, fn: () => T): T {
  return runInSpan(name, fn)
}

/**
 * 지금 활성화된 동작의 상관 식별자를 `ctx`에 합칠 모양으로 돌려준다.
 *
 * `setupDiagLogger`가 `trace: true`일 때 대신 넘겨주므로, 직접 쓰는 건
 * {@linkcode DiagLogger}를 손으로 조립할 때다. 어떤 {@linkcode trace} 밖에서는
 * 빈 객체라 아무것도 붙지 않는다.
 */
export function spanContext(): Record<string, unknown> {
  return readSpanContext()
}

/**
 * 진단 기록에 맞는 추적 기본값을 세운다.
 *
 * 트리를 붙들지 않고 호출마다 스택도 만들지 않는다. 여기서 필요한 건 화면이
 * 아니라 레코드에 붙일 식별자뿐이고, 오래 떠 있는 탭에서 메모리가 자라면 안
 * 되기 때문이다. `setupDiagLogger`가 `trace: true`일 때 대신 불러 준다.
 *
 * 개발 중 오버레이를 띄우려면 이 옵션 대신 트레이서의 `setupTrace`를 직접
 * 부를 것. 둘 다 같은 전역 설정을 만지므로 나중에 부른 쪽이 이긴다.
 */
export function configureTraceForDiagnostics(): void {
  configure({ enabled: true, retain: false, captureSource: false })
}
