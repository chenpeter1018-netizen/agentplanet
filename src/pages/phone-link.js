/**
 * Agent Planet 手机对接页面
 * 配对码 + 已配对设备管理
 */
import { tl } from '../lib/language.js'
import { bridge } from '../lib/backend-bridge.js'
import { toast } from '../components/toast.js'

let _el = null
let _pairings = []
let _pairCode = ''
let _pollTimer = null

export async function render() {
  _el = document.createElement('div')
  _el.className = 'page'

  _el.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">${tl('phoneLink.title')}</div>
        <div class="page-desc">${tl('sidebar.agentPlanet')}</div>
      </div>
      <button class="btn btn-primary" data-action="phone-generate">${tl('phoneLink.pairCode')}</button>
    </div>

    <div class="card" style="margin-bottom:16px">
      <div class="card-header">${tl('phoneLink.pairingChannel')}</div>
      <div class="card-body" style="text-align:center;padding:24px">
        <div id="phone-pair-code" style="font-size:36px;font-weight:900;letter-spacing:.2em;font-family:monospace;color:var(--accent);margin-bottom:8px">----</div>
        <div id="phone-pair-status" style="font-size:var(--font-size-sm);color:var(--text-tertiary)">${tl('phoneLink.unpaired')}</div>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <div class="card-header">${tl('phoneLink.paired')}</div>
      <div class="card-body" style="padding:0">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>${tl('digitalWorkers.agentName')}</th>
                <th>${tl('phoneLink.pairingChannel')}</th>
                <th>${tl('cronJobs.status')}</th>
                <th style="text-align:right">${tl('services.actions')}</th>
              </tr>
            </thead>
            <tbody id="phone-table-body">
              <tr><td colspan="4"><div class="page-loader"><div class="page-loader-spinner"></div></div></td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">${tl('phoneLink.waitingPair')}</div>
      <div class="card-body" id="phone-requests">
        <div class="empty-state"><div class="empty-state-text">${tl('phoneLink.noPairingRequests')}</div></div>
      </div>
    </div>
  `

  bindEvents(_el)
  loadPairings()
  startPoll()

  return _el
}

function bindEvents(el) {
  el.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]')
    if (!btn) return
    const action = btn.dataset.action

    if (action === 'phone-generate') generatePairCode()
    else if (action === 'phone-approve') approvePair(btn.dataset.id)
    else if (action === 'phone-reject') rejectPair(btn.dataset.id)
    else if (action === 'phone-unpair') unpairDevice(btn.dataset.id)
  })
}

async function generatePairCode() {
  try {
    _pairCode = await bridge.generatePairCode()
    const codeEl = _el.querySelector('#phone-pair-code')
    const statusEl = _el.querySelector('#phone-pair-status')
    if (codeEl) codeEl.textContent = _pairCode
    if (statusEl) statusEl.textContent = tl('phoneLink.waitingPair')
  } catch (err) {
    toast(err.message || tl('common.error'), 'error')
  }
}

async function loadPairings() {
  try {
    _pairings = await bridge.listPairings() || []
  } catch {
    _pairings = []
  }
  renderPairings()
  loadRequests()
}

function renderPairings() {
  const tbody = _el.querySelector('#phone-table-body')
  if (!tbody) return

  if (!_pairings.length) {
    tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state"><div class="empty-state-text">${tl('common.noData')}</div></div></td>`
    return
  }

  tbody.innerHTML = _pairings.map(p => `
    <tr>
      <td style="font-weight:500">${escHtml(p.deviceName || p.name || p.id)}</td>
      <td style="font-size:var(--font-size-xs)">${escHtml(p.channel || '-')}</td>
      <td><span class="badge badge-success">${tl('phoneLink.paired')}</span></td>
      <td style="text-align:right">
        <button class="btn btn-sm btn-danger" data-action="phone-unpair" data-id="${escAttr(p.id)}">${tl('phoneLink.rejectPair')}</button>
      </td>
    </tr>
  `).join('')
}

async function loadRequests() {
  try {
    const requests = await bridge.listPairRequests() || []
    const container = _el.querySelector('#phone-requests')
    if (!container) return

    if (!requests.length) {
      container.innerHTML = `<div class="empty-state"><div class="empty-state-text">${tl('phoneLink.noPairingRequests')}</div></div>`
      return
    }

    container.innerHTML = requests.map(r => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border-light)">
        <div>
          <div style="font-weight:500;font-size:var(--font-size-sm)">${escHtml(r.deviceName || r.id)}</div>
          <div style="font-size:var(--font-size-xs);color:var(--text-tertiary)">${escHtml(r.channel || '')}</div>
        </div>
        <div style="display:flex;gap:4px">
          <button class="btn btn-sm btn-primary" data-action="phone-approve" data-id="${escAttr(r.id)}">${tl('phoneLink.approvePair')}</button>
          <button class="btn btn-sm btn-secondary" data-action="phone-reject" data-id="${escAttr(r.id)}">${tl('phoneLink.rejectPair')}</button>
        </div>
      </div>
    `).join('')
  } catch {}
}

async function approvePair(id) {
  try {
    await bridge.approvePair(id)
    toast(tl('common.success'), 'success')
    loadPairings()
  } catch (err) {
    toast(err.message || tl('common.error'), 'error')
  }
}

async function rejectPair(id) {
  try {
    await bridge.rejectPair(id)
    toast(tl('common.success'), 'success')
    loadPairings()
  } catch (err) {
    toast(err.message || tl('common.error'), 'error')
  }
}

async function unpairDevice(id) {
  try {
    await bridge.unpairDevice(id)
    toast(tl('common.success'), 'success')
    loadPairings()
  } catch (err) {
    toast(err.message || tl('common.error'), 'error')
  }
}

function startPoll() {
  _pollTimer = setInterval(loadPairings, 15000)
}

function escHtml(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') }
function escAttr(s) { return (s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }

export function cleanup() {
  if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null }
  _el = null
}
