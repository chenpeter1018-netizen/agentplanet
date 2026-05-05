/**
 * Agent Planet 日志查看页面
 * 日志类型选择 + 过滤 + 自动刷新
 */
import { tl } from '../lib/language.js'
import { bridge } from '../lib/backend-bridge.js'

let _el = null
let _pollTimer = null
let _logType = 'gateway'
let _autoRefresh = true
let _filterLevel = ''
let _lines = 200

const LOG_TYPES = ['gateway', 'cli', 'hermes', 'system']
const LEVELS = ['', 'error', 'warn', 'info', 'debug']

export async function render() {
  _el = document.createElement('div')
  _el.className = 'page'

  _el.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">${tl('logViewer.title')}</div>
        <div class="page-desc">${tl('sidebar.agentPlanet')}</div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-secondary" data-action="log-download">${tl('logViewer.download')}</button>
        <button class="btn btn-secondary" data-action="log-clear">${tl('logViewer.clear')}</button>
        <button class="btn btn-secondary" data-action="log-refresh">${tl('common.refresh')}</button>
      </div>
    </div>

    <div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap;align-items:center">
      <div class="tabs" style="margin-bottom:0;border-bottom:none">
        ${LOG_TYPES.map(t => `
          <button class="tab ${t === _logType ? 'active' : ''}" data-log-type="${t}">${tl(`logViewer.${t}`) || t}</button>
        `).join('')}
      </div>

      <select class="input" id="log-filter-level" style="width:auto;min-width:100px">
        ${LEVELS.map(l => `<option value="${l}">${l || tl('logViewer.filterLevel')}</option>`).join('')}
      </select>

      <input class="input" id="log-lines" type="number" value="${_lines}" min="50" max="2000" step="50" style="width:100px" />

      <label style="display:flex;align-items:center;gap:6px;font-size:var(--font-size-sm);cursor:pointer">
        <input type="checkbox" id="log-auto-refresh" ${_autoRefresh ? 'checked' : ''} />
        ${tl('logViewer.autoRefresh')}
      </label>
    </div>

    <div class="card">
      <div class="card-body" style="padding:0">
        <pre id="log-content" style="background:var(--bg-tertiary);padding:14px 18px;border-radius:var(--radius-md);font-size:var(--font-size-xs);max-height:calc(100vh - 300px);overflow-y:auto;white-space:pre-wrap;line-height:1.7;margin:0">${tl('common.loading')}</pre>
      </div>
    </div>
  `

  bindEvents(_el)
  loadLogs()
  startPoll()

  return _el
}

function bindEvents(el) {
  el.addEventListener('click', async (e) => {
    const tab = e.target.closest('[data-log-type]')
    if (tab) {
      _logType = tab.dataset.logType
      el.querySelectorAll('[data-log-type]').forEach(t => t.classList.remove('active'))
      tab.classList.add('active')
      loadLogs()
      return
    }

    const btn = e.target.closest('[data-action]')
    if (!btn) return

    if (btn.dataset.action === 'log-refresh') loadLogs()
    else if (btn.dataset.action === 'log-clear') clearLogs()
    else if (btn.dataset.action === 'log-download') downloadLogs()
  })

  el.querySelector('#log-filter-level')?.addEventListener('change', (e) => {
    _filterLevel = e.target.value
    loadLogs()
  })

  el.querySelector('#log-lines')?.addEventListener('change', (e) => {
    _lines = parseInt(e.target.value) || 200
    loadLogs()
  })

  el.querySelector('#log-auto-refresh')?.addEventListener('change', (e) => {
    _autoRefresh = e.target.checked
    if (_autoRefresh) startPoll()
    else stopPoll()
  })
}

async function loadLogs() {
  try {
    const content = await bridge.readLogs(_logType, { limit: _lines, level: _filterLevel || null })
    const pre = _el.querySelector('#log-content')
    if (pre) {
      pre.textContent = content || tl('logViewer.noLogs')
      pre.scrollTop = pre.scrollHeight
    }
  } catch (err) {
    const pre = _el.querySelector('#log-content')
    if (pre) pre.textContent = `${tl('common.error')}: ${err.message || err}`
  }
}

async function clearLogs() {
  try {
    await bridge.clearLogs(_logType)
    loadLogs()
  } catch {}
}

async function downloadLogs() {
  try {
    await bridge.downloadLogs(_logType)
  } catch {}
}

function startPoll() {
  stopPoll()
  if (_autoRefresh) _pollTimer = setInterval(loadLogs, 5000)
}

function stopPoll() {
  if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null }
}

export function cleanup() {
  stopPoll()
  _el = null
}
