import { copyLogs, downloadLogs, filterLogs, setupDiagLogger } from '../src'
import type { LogLevel, LogRecord } from '../src'

const { diag, idbSink } = setupDiagLogger({
  release: 'demo',
  maxRecords: 500,
  dev: true,
})

const ALL_LEVELS: LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error']

function $<T extends HTMLElement>(selector: string): T {
  const node = document.querySelector<T>(selector)
  if (!node) throw new Error(`missing element: ${selector}`)
  return node
}

function render(): void {
  const app = $('#app')
  app.innerHTML = `
    <header>
      <h1>cdr</h1>
      <p>기기에 쌓고(IndexedDB), <code>/log</code>에서 직접 내보내는 pull 모델 로거. 아래에서 이벤트를 만들고 뷰어에서 확인·내보내세요.</p>
    </header>

    <div class="tabs" role="tablist">
      <button class="tab" id="tab-gen" role="tab" aria-selected="true" data-target="gen">이벤트 생성</button>
      <button class="tab" id="tab-log" role="tab" aria-selected="false" data-target="log">/log 뷰어</button>
    </div>

    <section class="panel" data-panel="gen" data-active="true">
      <div class="card">
        <h2>침묵하는 제3의 상태</h2>
        <p class="hint">검증 실패로 동작을 막았는데 UI가 조용한 경우 — 사용자에겐 필드 에러를, 시스템엔 <code>validationBlocked</code>를 남긴다.</p>
        <div class="field">
          <label for="email">이메일</label>
          <input type="text" id="email" placeholder="name@hospital.org" />
          <div class="err" data-err="email"></div>
        </div>
        <div class="field">
          <label for="phone">전화번호</label>
          <input type="text" id="phone" placeholder="010-1234-5678" />
          <div class="err" data-err="phone"></div>
        </div>
        <button class="btn primary" id="submit">제출</button>
      </div>

      <div class="card">
        <h2>그 외 진단 이벤트</h2>
        <p class="hint">성공도 throw도 아닌, 조용히 막힌 상태들을 일급 이벤트로.</p>
        <div class="row">
          <button class="btn" data-emit="schema">스키마 불일치</button>
          <button class="btn" data-emit="swallowed">삼킨 예외</button>
          <button class="btn" data-emit="info">일반 로그 (info)</button>
          <button class="btn" data-emit="warn">경고 (warn)</button>
          <button class="btn" data-emit="error">에러 (error)</button>
        </div>
      </div>

      <div class="card">
        <h2>스크러빙 확인</h2>
        <p class="hint">민감 키(token·email·환자 등)는 값이 마스킹되고, 그 외 값도 형태로 요약돼 저장된다. 아래로 만들고 뷰어에서 확인.</p>
        <button class="btn" data-emit="sensitive">민감 데이터 포함 로그 남기기</button>
      </div>
    </section>

    <section class="panel" data-panel="log" data-active="false">
      <div class="card">
        <div class="toolbar">
          <div class="levels" id="levels"></div>
          <span class="count" id="count"></span>
        </div>
        <div class="toolbar">
          <input type="text" id="search" placeholder="message 검색…" style="max-width: 220px" />
          <button class="btn" id="refresh">새로고침</button>
          <button class="btn" id="download">NDJSON 다운로드</button>
          <button class="btn" id="copy">txt 복사</button>
          <button class="btn" id="clear">비우기</button>
        </div>
        <div class="records" id="records"></div>
      </div>
    </section>
  `
}

function wireTabs(): void {
  const tabs = document.querySelectorAll<HTMLButtonElement>('.tab')
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.target
      tabs.forEach((t) => t.setAttribute('aria-selected', String(t === tab)))
      document.querySelectorAll<HTMLElement>('.panel').forEach((panel) => {
        panel.dataset.active = String(panel.dataset.panel === target)
      })
      if (target === 'log') void refreshViewer()
    })
  })
}

function wireGenerator(): void {
  $('#submit').addEventListener('click', () => {
    const email = $<HTMLInputElement>('#email').value.trim()
    const phone = $<HTMLInputElement>('#phone').value.trim()
    const invalid: string[] = []
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) invalid.push('email')
    if (!/^\d{2,3}-\d{3,4}-\d{4}$/.test(phone)) invalid.push('phone')

    setFieldError('email', invalid.includes('email') ? '올바른 이메일이 아닙니다' : '')
    setFieldError('phone', invalid.includes('phone') ? '올바른 전화번호가 아닙니다' : '')

    if (invalid.length > 0) {
      diag.validationBlocked(invalid)
    } else {
      diag.log({ type: 'log', level: 'info', message: 'form submitted' })
    }
  })

  document.querySelectorAll<HTMLButtonElement>('[data-emit]').forEach((btn) => {
    btn.addEventListener('click', () => emit(btn.dataset.emit ?? ''))
  })
}

function setFieldError(field: string, message: string): void {
  const node = document.querySelector(`[data-err="${field}"]`)
  if (node) node.textContent = message
}

function emit(kind: string): void {
  switch (kind) {
    case 'schema':
      diag.schemaMismatch('UserResponse', ['data.id', 'data.profile.role'])
      break
    case 'swallowed':
      diag.swallowed('parseResponse', new Error('unexpected end of JSON input'))
      break
    case 'info':
      diag.log({ type: 'log', level: 'info', message: 'user opened patient list' })
      break
    case 'warn':
      diag.log({ type: 'log', level: 'warn', message: 'retry scheduled', data: { attempt: 2 } })
      break
    case 'error':
      diag.log({ type: 'log', level: 'error', message: 'request failed', data: { status: 503 } })
      break
    case 'sensitive':
      diag.log({
        type: 'log',
        level: 'info',
        message: 'api request payload',
        data: {
          token: 'eyJhbGciOiJIUzI1Niated',
          email: 'patient@example.org',
          patientName: '홍길동',
          count: 3,
          ok: true,
        },
      })
      break
  }
}

function selectedLevels(): LogLevel[] {
  return ALL_LEVELS.filter(
    (lvl) => document.querySelector<HTMLInputElement>(`#lvl-${lvl}`)?.checked,
  )
}

function renderLevelFilter(): void {
  $('#levels').innerHTML = ALL_LEVELS.map(
    (lvl) => `<label><input type="checkbox" id="lvl-${lvl}" checked /> ${lvl}</label>`,
  ).join('')
  document.querySelectorAll<HTMLInputElement>('#levels input').forEach((input) => {
    input.addEventListener('change', () => void refreshViewer())
  })
}

let currentRecords: LogRecord[] = []

async function refreshViewer(): Promise<void> {
  await diag.flush()
  const all = await idbSink.read(500)
  const levels = selectedLevels()
  const text = $<HTMLInputElement>('#search').value.trim()
  currentRecords = filterLogs(all, {
    levels: levels.length ? levels : undefined,
    text: text || undefined,
  })
  renderRecords(currentRecords)
}

function renderRecords(records: LogRecord[]): void {
  $('#count').textContent = `${records.length} records`
  const list = $('#records')
  if (records.length === 0) {
    list.innerHTML = `<div class="empty">레코드가 없습니다. "이벤트 생성" 탭에서 만들어 보세요.</div>`
    return
  }
  list.innerHTML = records
    .map((r) => {
      const time = new Date(r.ts).toLocaleTimeString('ko-KR')
      const data = Object.keys(r.data).length
        ? `<pre class="data">${escapeHtml(JSON.stringify(r.data))}</pre>`
        : ''
      return `
        <div class="rec">
          <span class="lvl ${r.level}">${r.level}</span>
          <span class="meta"><span class="type">${r.type}</span>${time} · ${r.source}</span>
          <span class="body"><span class="msg">${escapeHtml(r.message)}</span>${data}</span>
        </div>`
    })
    .join('')
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function wireViewer(): void {
  $('#refresh').addEventListener('click', () => void refreshViewer())
  $('#search').addEventListener('input', () => void refreshViewer())
  $('#download').addEventListener('click', () => downloadLogs(currentRecords, 'ndjson'))
  $('#copy').addEventListener('click', () => {
    void copyLogs(currentRecords, 'txt').then(() => {
      const btn = $('#copy')
      const prev = btn.textContent
      btn.textContent = '복사됨!'
      setTimeout(() => (btn.textContent = prev), 1200)
    })
  })
  $('#clear').addEventListener('click', () => {
    void idbSink.clear().then(() => refreshViewer())
  })
}

render()
wireTabs()
wireGenerator()
renderLevelFilter()
wireViewer()
