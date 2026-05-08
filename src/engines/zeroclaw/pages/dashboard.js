/**
 * ZeroClaw 仪表盘 — 状态总览 + 快速操作
 */
import { api, invalidate } from '../../../lib/tauri-api.js'
import { toast } from '../../../components/toast.js'
import { t } from '../../../lib/i18n.js'

let _page = null, _loadSeq = 0

function esc(str) {
  if (!str) return ''
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}

export async function render() {
  _page = document.createElement('div')
  _page.className = 'page'
  _page.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">ZeroClaw ${t('sidebar.dashboard')}</h1>
      <p class="page-desc" id="zc-dash-desc">${t('engine.loading')}</p>
    </div>
    <div id="zc-dash-body">
      <div class="stat-card loading-placeholder" style="height:120px"></div>
    </div>
  `
  bindEvents()
  loadStatus()
  return _page
}

function bindEvents() {
  _page.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]')
    if (!btn || btn.disabled) return
    btn.disabled = true
    const action = btn.dataset.action
    try {
      if (action === 'zc-install') {
        btn.textContent = t('engine.installing')
        await api.installZeroclaw()
        toast(t('engine.installDone'), 'success')
      } else if (action === 'zc-start') {
        await api.zeroclawStart()
        toast(t('engine.serviceStarted'), 'success')
      } else if (action === 'zc-stop') {
        await api.zeroclawStop()
        toast(t('engine.serviceStopped'), 'success')
      } else if (action === 'zc-restart') {
        await api.zeroclawRestart()
        toast(t('engine.serviceRestarted'), 'success')
      } else if (action === 'zc-health') {
        const r = await api.zeroclawHealthCheck()
        toast(r?.healthy ? t('engine.healthOk') : t('engine.healthFail'), r?.healthy ? 'success' : 'error')
      } else if (action === 'zc-open') {
        await api.zeroclawOpenDir(btn.dataset.kind || 'data')
      }
    } catch (e) { toast(e?.message || e, 'error') }
    setTimeout(() => loadStatus(), 1200)
  })
}

async function loadStatus() {
  const body = _page?.querySelector('#zc-dash-body')
  const desc = _page?.querySelector('#zc-dash-desc')
  if (!body) return
  const seq = ++_loadSeq
  invalidate('check_zeroclaw')
  let info
  try { info = await api.checkZeroclaw() } catch (e) { info = null }
  if (seq !== _loadSeq) return

  if (!info || !info.installed) {
    if (desc) desc.textContent = t('engine.notInstalled')
    body.innerHTML = `
      <div class="stat-card" style="text-align:center;padding:32px">
        <div style="font-size:48px;margin-bottom:12px">📦</div>
        <h3>ZeroClaw ${t('engine.notInstalled')}</h3>
        <p style="color:var(--text-secondary);margin:8px 0 16px">${t('engine.zcInstallHint')}</p>
        <button class="btn btn-primary" data-action="zc-install">${t('engine.installNow')}</button>
      </div>`
  } else {
    const running = info.running
    const dot = running ? '<span style="color:#22c55e">●</span>' : '<span style="color:#9ca3af">●</span>'
    if (desc) desc.innerHTML = `${dot} ZeroClaw v${esc(info.version || '?')} — ${running ? t('engine.running') : t('engine.stopped')}`
    body.innerHTML = `
      <div class="config-section" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px">
        <div class="stat-card"><div class="stat-label">${t('engine.version')}</div><div class="stat-value">v${esc(info.version || '?')}</div></div>
        <div class="stat-card"><div class="stat-label">${t('engine.status')}</div><div class="stat-value">${running ? t('engine.running') : t('engine.stopped')}</div></div>
        <div class="stat-card"><div class="stat-label">${t('engine.port')}</div><div class="stat-value">${info.port || 18790}</div></div>
        <div class="stat-card"><div class="stat-label">PID</div><div class="stat-value">${info.pid || '-'}</div></div>
      </div>
      <div class="config-section" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px">
        ${running
          ? `<button class="btn btn-secondary" data-action="zc-restart">${t('engine.restart')}</button>
             <button class="btn btn-danger" data-action="zc-stop">${t('engine.stop')}</button>`
          : `<button class="btn btn-primary" data-action="zc-start">${t('engine.start')}</button>`}
        <button class="btn btn-secondary" data-action="zc-health">${t('engine.healthCheck')}</button>
        <button class="btn btn-secondary" data-action="zc-open" data-kind="knowledge">📁 ${t('engine.knowledge')}</button>
        <button class="btn btn-secondary" data-action="zc-open" data-kind="logs">📋 ${t('engine.logs')}</button>
        <button class="btn btn-secondary" data-action="zc-open" data-kind="config">⚙ ${t('engine.config')}</button>
      </div>
      <div class="form-hint" style="margin-top:12px">
        <p>📂 ${t('engine.dataDir')}: <code>${esc(info.data_dir || '-')}</code></p>
        <p>⚙ ${t('engine.configDir')}: <code>${esc(info.config_dir || '-')}</code></p>
      </div>`
  }
}
