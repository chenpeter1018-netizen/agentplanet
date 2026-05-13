/**
 * ZeroClaw 服务管理 — 启动/停止/自启/健康检查
 */
import { api, invalidate } from '../../../lib/tauri-api.js'
import { toast } from '../../../components/toast.js'
import { t } from '../../../lib/i18n.js'

function esc(s) { return s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;') : '' }

let _loadSeq = 0

export async function render() {
  const page = document.createElement('div')
  page.className = 'page'
  page.dataset.engine = 'zeroclaw'
  page.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">ZeroClaw ${t('sidebar.services')}</h1>
      <p class="page-desc" id="zc-svc-desc">${t('engine.loading')}</p>
    </div>
    <div id="zc-svc-body"><div class="stat-card loading-placeholder" style="height:100px"></div></div>
  `
  bindEvents(page)
  loadStatus(page)
  return page
}

function bindEvents(page) {
  page.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]')
    if (!btn || btn.disabled) return
    btn.disabled = true
    const a = btn.dataset.action
    try {
      if (a === 'zc-start') { await api.zeroclawStart(); toast(t('engine.serviceStarted'), 'success') }
      else if (a === 'zc-stop') { await api.zeroclawStop(); toast(t('engine.serviceStopped'), 'success') }
      else if (a === 'zc-restart') { await api.zeroclawRestart(); toast(t('engine.serviceRestarted'), 'success') }
      else if (a === 'zc-probe') { const r = await api.zeroclawRuntimeProbe(); toast(r?.listening ? t('engine.portOpen') : t('engine.portClosed'), r?.listening ? 'success' : 'warning') }
      else if (a === 'zc-open') { await api.zeroclawOpenDir(btn.dataset.kind || 'data') }
    } catch (e) { toast(e?.message || e, 'error') }
    setTimeout(() => loadStatus(page), 1200)
  })
}

async function loadStatus(page) {
  const body = page?.querySelector('#zc-svc-body')
  const desc = page?.querySelector('#zc-svc-desc')
  if (!body) return
  invalidate('check_zeroclaw')
  let info
  try { info = await api.checkZeroclaw() } catch { info = null }
  if (!info) { body.innerHTML = `<div class="form-hint">${t('engine.loadFailed')}</div>`; return }
  const r = info.running
  if (desc) desc.textContent = r ? t('engine.serviceRunning') : t('engine.serviceStopped')
  body.innerHTML = `
    <div class="config-section" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px">
      <div class="stat-card"><div class="stat-label">${t('engine.status')}</div><div class="stat-value" style="color:${r?'#22c55e':'#9ca3af'}">${r ? t('engine.running') : t('engine.stopped')}</div></div>
      <div class="stat-card"><div class="stat-label">PID</div><div class="stat-value">${info.pid || '-'}</div></div>
      <div class="stat-card"><div class="stat-label">${t('engine.port')}</div><div class="stat-value">${info.port || 18790}</div></div>
    </div>
    <div class="config-section" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px">
      ${r
        ? `<button class="btn btn-secondary" data-action="zc-restart">${t('engine.restart')}</button>
           <button class="btn btn-danger" data-action="zc-stop">${t('engine.stop')}</button>`
        : `<button class="btn btn-primary" data-action="zc-start">${t('engine.start')}</button>`}
      <button class="btn btn-secondary" data-action="zc-probe">${t('engine.probePort')}</button>
      <button class="btn btn-secondary" data-action="zc-open" data-kind="logs">📋 ${t('engine.logs')}</button>
      <button class="btn btn-secondary" data-action="zc-open" data-kind="config">⚙ ${t('engine.config')}</button>
    </div>`
}
