/**
 * Agent Planet 记忆优化页面
 * 分析 + 去重 + 压缩 + 摘要生成
 */
import { tl } from '../lib/language.js'
import { bridge } from '../lib/backend-bridge.js'
import { toast } from '../components/toast.js'

let _el = null
let _analysis = null
let _optimizing = false

export async function render() {
  _el = document.createElement('div')
  _el.className = 'page'

  _el.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">${tl('memoryOptimize.title')}</div>
        <div class="page-desc">${tl('sidebar.agentPlanet')}</div>
      </div>
      <button class="btn btn-secondary" data-action="opt-analyze" id="btn-opt-analyze">${tl('memoryOptimize.analyze')}</button>
    </div>

    <div class="stats-grid" id="opt-stats">
      <div class="stat-card"><div class="stat-card-label">${tl('memoryOptimize.totalFiles')}</div><div class="stat-card-value" id="opt-total">-</div></div>
      <div class="stat-card"><div class="stat-card-label">${tl('memoryOptimize.totalSize')}</div><div class="stat-card-value" id="opt-size">-</div></div>
      <div class="stat-card"><div class="stat-card-label">${tl('memoryOptimize.duplicateRate')}</div><div class="stat-card-value" id="opt-dup">-</div></div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <div class="card-header">${tl('memoryOptimize.optimizationSuggestions')}</div>
      <div class="card-body" id="opt-suggestions">
        <div class="empty-state"><div class="empty-state-text">${tl('common.noData')}</div></div>
      </div>
    </div>

    <div style="display:flex;gap:8px;justify-content:flex-end;padding-bottom:32px">
      <button class="btn btn-secondary" data-action="opt-dedup" id="btn-opt-dedup" disabled>${tl('memoryOptimize.deduplicate')}</button>
      <button class="btn btn-secondary" data-action="opt-compress" id="btn-opt-compress" disabled>${tl('memoryOptimize.compress')}</button>
      <button class="btn btn-primary" data-action="opt-summarize" id="btn-opt-summarize" disabled>${tl('memoryOptimize.summarize')}</button>
    </div>
  `

  bindEvents(_el)
  return _el
}

function bindEvents(el) {
  el.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]')
    if (!btn) return
    const action = btn.dataset.action

    if (action === 'opt-analyze') analyzeMemory()
    else if (action === 'opt-dedup') runOptimize('dedup')
    else if (action === 'opt-compress') runOptimize('compress')
    else if (action === 'opt-summarize') runOptimize('summarize')
  })
}

async function analyzeMemory() {
  const btn = _el.querySelector('#btn-opt-analyze')
  if (btn) { btn.disabled = true; btn.textContent = tl('common.processing') }

  try {
    _analysis = await bridge.analyzeMemory() || {}
    updateStats()
    updateSuggestions()
    _el.querySelector('#btn-opt-dedup').disabled = !(_analysis.duplicateRate > 0)
    _el.querySelector('#btn-opt-compress').disabled = false
    _el.querySelector('#btn-opt-summarize').disabled = false
  } catch (err) {
    toast(err.message || tl('common.error'), 'error')
  }

  if (btn) { btn.disabled = false; btn.textContent = tl('memoryOptimize.analyze') }
}

function updateStats() {
  if (!_analysis) return
  _el.querySelector('#opt-total').textContent = _analysis.totalFiles || 0
  _el.querySelector('#opt-size').textContent = formatSize(_analysis.totalSize || 0)
  _el.querySelector('#opt-dup').textContent = `${Math.round((_analysis.duplicateRate || 0) * 100)}%`
}

function updateSuggestions() {
  const container = _el.querySelector('#opt-suggestions')
  if (!container) return

  const suggestions = _analysis?.suggestions || []
  if (!suggestions.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-text">${tl('common.noData')}</div></div>`
    return
  }

  container.innerHTML = suggestions.map((s, i) => `
    <div style="display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-bottom:1px solid var(--border-light);font-size:var(--font-size-sm)">
      <span style="color:var(--accent);font-weight:600;flex-shrink:0">${i + 1}.</span>
      <span>${escHtml(s.description || s)}</span>
    </div>
  `).join('')
}

async function runOptimize(type) {
  if (_optimizing) return
  _optimizing = true

  const btnId = type === 'dedup' ? 'btn-opt-dedup' : type === 'compress' ? 'btn-opt-compress' : 'btn-opt-summarize'
  const btn = _el.querySelector(`#${btnId}`)
  if (btn) { btn.disabled = true; btn.textContent = tl('common.processing') }

  try {
    const result = type === 'dedup'
      ? await bridge.deduplicateMemory()
      : type === 'compress'
        ? await bridge.compressMemory()
        : await bridge.summarizeMemory()

    toast(result?.ok !== false ? tl('common.success') : tl('common.error'), result?.ok !== false ? 'success' : 'error')
    if (result?.ok !== false) analyzeMemory()
  } catch (err) {
    toast(err.message || tl('common.error'), 'error')
  }

  _optimizing = false
  if (btn) { btn.disabled = false; btn.textContent = tl(`memoryOptimize.${type}`) }
}

function formatSize(bytes) {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

function escHtml(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') }

export function cleanup() { _el = null; _analysis = null; _optimizing = false }
